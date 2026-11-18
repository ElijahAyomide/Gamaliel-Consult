'use strict';
/*
  Admin API for the Gamaliel Consult website.

  The admin screen (/admin) talks to this one function. It:
    - checks the admin's email + password and hands back a signed session token
    - reads and writes ONLY the site's content files and uploaded photos in GitHub
    - never exposes the GitHub key: it stays in Netlify's environment variables

  Required environment variables (set in Netlify, never in the code):
    ADMIN_EMAIL, ADMIN_PASSWORD, SESSION_SECRET, GITHUB_TOKEN, GITHUB_REPO  (and optionally GITHUB_BRANCH)
*/
const crypto = require('crypto');
const { parseFront } = require('../../lib/shared.js');

const SESSION_HOURS = 12;
const JSON_FILES = new Set(['settings', 'home', 'about', 'practice-areas', 'contact', 'blog', 'team', 'privacy', 'legal']);
const MAX_JSON_BYTES = 300 * 1024;
const MAX_POST_BYTES = 200 * 1024;
const MAX_IMAGE_B64 = 4.4 * 1024 * 1024;

/* ----------------------------------------------------------- utilities */
const json = (status, obj) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(obj),
});
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha256(a), sha256(b));
const b64url = (buf) => Buffer.from(buf).toString('base64url');

function env() {
  const need = ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'SESSION_SECRET', 'GITHUB_TOKEN', 'GITHUB_REPO'];
  const missing = need.filter((k) => !process.env[k]);
  if (missing.length) throw new HttpError(500, `The admin is not set up yet. Missing in Netlify: ${missing.join(', ')}`);
  if (process.env.SESSION_SECRET.length < 24) throw new HttpError(500, 'SESSION_SECRET must be at least 24 characters long.');
  return {
    email: process.env.ADMIN_EMAIL.trim().toLowerCase(),
    password: process.env.ADMIN_PASSWORD,
    secret: process.env.SESSION_SECRET,
    token: process.env.GITHUB_TOKEN,
    repo: process.env.GITHUB_REPO,
    branch: process.env.GITHUB_BRANCH || 'main',
    api: (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, ''),
  };
}

/* ------------------------------------------------------ session tokens */
function sign(payload, secret) {
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}
function verify(header, secret) {
  const m = /^Bearer\s+(.+)$/i.exec(header || '');
  if (!m) return null;
  const [body, sig] = m[1].split('.');
  if (!body || !sig) return null;
  const expected = b64url(crypto.createHmac('sha256', secret).update(body).digest());
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p.exp > Date.now() ? p : null;
  } catch (e) { return null; }
}

/* -------------------------------- login throttle (best effort, per instance) */
const attempts = new Map();
function throttled(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  attempts.set(ip, list);
  return list.length >= 8;
}
const noteFailure = (ip) => attempts.set(ip, [...(attempts.get(ip) || []), Date.now()]);

/* ------------------------------------------------------------- GitHub */
async function gh(cfg, method, path, body) {
  const url = `${cfg.api}/repos/${cfg.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}${method === 'GET' ? `?ref=${encodeURIComponent(cfg.branch)}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'gamaliel-site-admin',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404 && method === 'GET') return null;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) throw new HttpError(502, 'GitHub refused the request. Check that GITHUB_TOKEN is valid and has "Contents: Read and write" access to the repository.');
  if (res.status === 409 || res.status === 422) throw new HttpError(409, 'This content was changed somewhere else. Please reload the page and try again.');
  if (!res.ok) throw new HttpError(502, `GitHub error (${res.status}). ${data.message || ''}`.trim());
  return data;
}
const decode = (file) => Buffer.from(file.content || '', 'base64').toString('utf8');

/* ---------------------------------------------------------- validation */
function kindOf(path) {
  let m;
  if (typeof path === 'string' && (m = /^content\/([a-z-]+)\.json$/.exec(path)) && JSON_FILES.has(m[1])) return 'json';
  if (typeof path === 'string' && /^content\/posts\/[a-z0-9][a-z0-9-]{0,80}\.md$/.test(path)) return 'post';
  throw new HttpError(400, 'That file cannot be edited from the admin.');
}
function sniffImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}

/* ------------------------------------------------------------- actions */
async function login(cfg, body, ip) {
  if (throttled(ip)) throw new HttpError(429, 'Too many attempts. Please wait 15 minutes and try again.');
  const okEmail = safeEqual(String(body.email || '').trim().toLowerCase(), cfg.email);
  const okPass = safeEqual(String(body.password || ''), cfg.password);
  if (!(okEmail && okPass)) {
    noteFailure(ip);
    await sleep(1200);
    throw new HttpError(401, 'That email or password is not right.');
  }
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  return json(200, { token: sign({ e: cfg.email, exp }, cfg.secret), expires: exp });
}

async function listPosts(cfg) {
  const dir = await gh(cfg, 'GET', 'content/posts');
  if (!Array.isArray(dir)) return json(200, { posts: [] });
  const files = dir.filter((f) => f.type === 'file' && /\.md$/.test(f.name));
  const posts = [];
  for (let i = 0; i < files.length; i += 8) {
    const batch = await Promise.all(files.slice(i, i + 8).map(async (f) => {
      const file = await gh(cfg, 'GET', f.path);
      if (!file) return null;
      try {
        const { data } = parseFront(decode(file), f.name);
        return { slug: f.name.replace(/\.md$/, ''), sha: file.sha, title: data.title || f.name, date: (/\d{4}-\d{2}-\d{2}/.exec(String(data.date)) || [''])[0], draft: data.draft === true, featured: data.featured === true };
      } catch (e) { return { slug: f.name.replace(/\.md$/, ''), sha: file.sha, title: f.name, date: '', draft: false, featured: false }; }
    }));
    posts.push(...batch.filter(Boolean));
  }
  posts.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : a.slug.localeCompare(b.slug)));
  return json(200, { posts });
}

async function getFile(cfg, path) {
  kindOf(path);
  const file = await gh(cfg, 'GET', path);
  if (!file || Array.isArray(file)) throw new HttpError(404, 'File not found.');
  return json(200, { content: decode(file), sha: file.sha });
}

async function saveFile(cfg, body) {
  const { path, content, sha } = body;
  const kind = kindOf(path);
  if (typeof content !== 'string') throw new HttpError(400, 'Nothing to save.');
  const size = Buffer.byteLength(content, 'utf8');

  const current = await gh(cfg, 'GET', path);
  if (kind === 'json') {
    if (size > MAX_JSON_BYTES) throw new HttpError(400, 'That page is too large to save.');
    let next;
    try { next = JSON.parse(content); } catch (e) { throw new HttpError(400, 'The content is not valid.'); }
    if (!next || typeof next !== 'object' || Array.isArray(next)) throw new HttpError(400, 'The content is not valid.');
    if (!current) throw new HttpError(404, 'File not found.');
    const old = JSON.parse(decode(current));
    const lost = Object.keys(old).filter((k) => !(k in next));
    if (lost.length) throw new HttpError(400, `Some sections are missing (${lost.join(', ')}). Reload the page and try again.`);
  } else {
    if (size > MAX_POST_BYTES) throw new HttpError(400, 'That post is too large to save.');
    let parsed;
    try { parsed = parseFront(content, path); } catch (e) { throw new HttpError(400, 'The post could not be read.'); }
    if (!String(parsed.data.title || '').trim()) throw new HttpError(400, 'The post needs a title.');
  }

  if (current && !sha) throw new HttpError(409, 'A page with this name already exists. Please use a different title.');
  if (current && sha && current.sha !== sha) throw new HttpError(409, 'This content was changed somewhere else. Please reload the page and try again.');
  const message = `Admin: ${current ? 'update' : 'add'} ${path.replace(/^content\//, '')}`;
  const res = await gh(cfg, 'PUT', path, {
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch: cfg.branch,
    ...(current ? { sha: current.sha } : {}),
  });
  return json(200, { sha: res.content.sha });
}

async function deleteFile(cfg, body) {
  const { path, sha } = body;
  if (kindOf(path) !== 'post') throw new HttpError(400, 'Only blog posts can be deleted.');
  const current = await gh(cfg, 'GET', path);
  if (!current) throw new HttpError(404, 'Post not found.');
  if (!sha || current.sha !== sha) throw new HttpError(409, 'This post was changed somewhere else. Please reload the page and try again.');
  await gh(cfg, 'DELETE', path, { message: `Admin: delete ${path.replace(/^content\//, '')}`, sha: current.sha, branch: cfg.branch });
  return json(200, { ok: true });
}

async function upload(cfg, body) {
  const data = String(body.data || '');
  if (!data || data.length > MAX_IMAGE_B64) throw new HttpError(400, 'That photo is too large. Please choose a smaller one.');
  const buf = Buffer.from(data, 'base64');
  const ext = sniffImage(buf);
  if (!ext) throw new HttpError(400, 'Please upload a JPG, PNG or WebP photo.');
  const base = String(body.name || 'photo').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'photo';
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const path = `images/uploads/${stamp}-${base}.${ext}`;
  await gh(cfg, 'PUT', path, { message: `Admin: upload ${path.replace(/^images\/uploads\//, '')}`, content: buf.toString('base64'), branch: cfg.branch });
  return json(200, { path });
}

/* -------------------------------------------------------------- handler */
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad request' }); }
    const cfg = env();
    const headers = event.headers || {};
    const ip = headers['x-nf-client-connection-ip'] || headers['client-ip'] || (headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

    if (body.action === 'login') return await login(cfg, body, ip);

    const user = verify(headers.authorization || headers.Authorization, cfg.secret);
    if (!user) return json(401, { error: 'Please sign in again.' });

    switch (body.action) {
      case 'me': return json(200, { email: user.e, expires: user.exp });
      case 'list-posts': return await listPosts(cfg);
      case 'get': return await getFile(cfg, body.path);
      case 'save': return await saveFile(cfg, body);
      case 'delete': return await deleteFile(cfg, body);
      case 'upload': return await upload(cfg, body);
      default: return json(400, { error: 'Unknown request.' });
    }
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    console.error('admin function error:', e);
    return json(500, { error: 'Something went wrong. Please try again.' });
  }
};
