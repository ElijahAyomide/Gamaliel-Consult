'use strict';
/* Gamaliel Consult: site admin screen. Talks only to /.netlify/functions/admin. */
(() => {
  const GC = window.GC;
  const API = '/.netlify/functions/admin';
  const TOKEN_KEY = 'gc_admin_token';
  let token = sessionStorage.getItem(TOKEN_KEY) || '';
  let dirty = false;
  let uid = 0;
  const blobs = new Map(); // freshly uploaded photo path -> local preview URL

  const $ = (s, r = document) => r.querySelector(s);
  const nid = () => 'f' + (++uid);

  /* ----------------------------------------------------------- tiny DOM helper */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k in el) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => {
      if (c == null || c === false) return;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return el;
  }

  /* --------------------------------------------------------------------- API */
  async function api(action, payload = {}) {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && action !== 'login') {
      signOut('Your session has ended. Please sign in again.');
      throw new Error('Please sign in again.');
    }
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  /* ------------------------------------------------------------------- toast */
  let toastTimer;
  function toast(msg, type = 'ok') {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast ' + type;
    clearTimeout(toastTimer);
    if (type === 'ok') toastTimer = setTimeout(() => t.classList.add('hidden'), 8000);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const clearToast = () => $('#toast').classList.add('hidden');

  /* ---------------------------------------------------------------- sign in */
  function showLogin(message) {
    $('#app').classList.add('hidden');
    $('#login').classList.remove('hidden');
    $('#login-error').textContent = message || '';
  }
  function signOut(message) {
    token = '';
    sessionStorage.removeItem(TOKEN_KEY);
    dirty = false;
    showLogin(message);
  }
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    $('#login-error').textContent = '';
    try {
      const r = await api('login', { email: $('#login-email').value, password: $('#login-password').value });
      token = r.token;
      sessionStorage.setItem(TOKEN_KEY, token);
      $('#login-password').value = '';
      startApp();
    } catch (err) {
      $('#login-error').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
  $('#logout').addEventListener('click', () => { if (confirmLeave()) signOut(); });

  /* ------------------------------------------------------------- navigation */
  const NAV = [
    { group: 'Blog', items: [{ id: 'posts', label: 'Blog posts', type: 'posts' }] },
    { group: 'Website details', items: [{ id: 'settings', label: 'Contact details & footer', file: 'settings' }] },
    { group: 'Pages', items: [
      { id: 'home', label: 'Home page', file: 'home' },
      { id: 'about', label: 'About Us page', file: 'about' },
      { id: 'practice-areas', label: 'Practice Areas page', file: 'practice-areas' },
      { id: 'contact', label: 'Contact Us page', file: 'contact' },
      { id: 'blog', label: 'Blog page & post layout', file: 'blog' },
      { id: 'privacy', label: 'Privacy policy', file: 'privacy' },
      { id: 'legal', label: 'Legal notice', file: 'legal' },
    ] },
    { group: 'People', items: [{ id: 'team', label: 'Attorneys', file: 'team' }] },
  ];
  const TITLES = {
    posts: ['Blog posts', 'Add, edit or hide the articles in the journal.'],
    settings: ['Contact details & footer', 'Your email, phone, WhatsApp, LinkedIn and the text that appears on every page.'],
    home: ['Home page', 'Text and photos on the home page.'],
    about: ['About Us page', 'Text and photos on the About Us page.'],
    'practice-areas': ['Practice Areas page', 'The practice areas, their descriptions and the questions and answers.'],
    contact: ['Contact Us page', 'Text on the Contact Us page. (Email and phone are under Contact details & footer.)'],
    blog: ['Blog page & post layout', 'Text on the Blog page and the notes shown on every article.'],
    privacy: ['Privacy policy', 'Review this with your lawyers before the website goes live.'],
    legal: ['Legal notice', 'Review this with your lawyers before the website goes live.'],
    team: ['Attorneys', 'The attorney profiles shown on the Home and About Us pages.'],
  };

  function buildNav() {
    const nav = $('#nav');
    nav.innerHTML = '';
    NAV.forEach((g) => {
      nav.append(h('h2', {}, g.group));
      g.items.forEach((it) => nav.append(h('button', { type: 'button', 'data-id': it.id, onclick: () => go(it) }, it.label)));
    });
  }
  function markNav(id) {
    document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
  }
  function confirmLeave() {
    return !dirty || window.confirm('You have changes that are not saved. Leave without saving?');
  }
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  async function go(it) {
    if (!confirmLeave()) return;
    dirty = false;
    clearToast();
    markNav(it.id);
    if (it.type === 'posts') return showPosts();
    return openFile(it);
  }

  /* ----------------------------------------------------------- form builder */
  const HINTS = {
    seo_title: 'The title shown on the browser tab and in Google results.',
    seo_description: 'The short description shown under the title in Google results (about 150 characters).',
    heading: 'Press Enter to start a new line. The line break only shows on large screens.',
    title: 'Press Enter to start a new line.',
    button_link: 'Where the button goes: another page (e.g. contact.html) or a full web address (https://...).',
    image: 'Choose a photo. Landscape photos at least 1200 px wide look best.',
    image_alt: 'A short description of the photo, for people who use screen readers.',
    email: 'Shown on the Contact page and in the footer. Messages sent through the contact form are delivered to the email address set up in Netlify (see the README).',
    phone: 'Shown on the Contact page, e.g. 08145686089.',
    phone_country_code: 'Used to make the tap-to-call link work for visitors abroad, e.g. +234 for Nigeria. The call link follows the phone number above automatically.',
    phone_for_tap_to_call: 'Optional. Leave empty. Only fill this in if the automatic call link is wrong (international format, e.g. +2348145686089).',
    whatsapp_number: 'Digits only with the country code, e.g. 2348145686089 (no + sign or spaces).',
    linkedin_url: 'Full address of your LinkedIn page. Leave empty to hide the LinkedIn link in the footer.',
    address: 'Optional. Shown in the footer when filled in.',
    footer_lines: 'Press Enter for a new line.',
    icon: 'The small icon shown on the card.',
    id: 'A short word used in the page address, e.g. corporate. Do not change it unless you also update links to it.',
    body: 'Use {{email}} to insert the email address from Contact details. Text in [square brackets] shows in gold as a reminder to fill in a detail.',
    mobile_note: 'Shown only on phones. Leave empty to hide it.',
    footnote: 'Leave empty to hide it.',
    quote: 'Quotation marks are added automatically.',
  };
  const MULTI = new Set(['heading', 'title', 'text', 'intro', 'bio', 'short_bio', 'long_bio', 'lead', 'excerpt', 'answer', 'note', 'footnote', 'disclaimer', 'footer_lines', 'address', 'quote', 'caption', 'meetings_text', 'next_text', 'footer_tagline', 'mobile_note']);
  const ICONS = ['building', 'scales', 'columns', 'briefcase', 'users', 'shield'];
  const FALLBACK = {
    cards: { icon: 'building', title: '', text: '', link: '' },
    steps: { title: '', text: '' },
    items: { title: '', text: '' },
    members: { name: '', role: '', image: '', short_bio: '', long_bio: '', focus: '', link: 'about.html#team' },
    areas: { id: '', icon: 'building', title: '', text: '', bullets: [''] },
    faq_items: { question: '', answer: '' },
  };
  const human = (k) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const isImageKey = (k) => k === 'image' || k.endsWith('_image') || k === 'photo';
  const linkHint = (k) => (k === 'link' || k.endsWith('_link') ? 'Where the link goes: another page (e.g. contact.html) or a full web address (https://...).' : '');
  const markDirty = () => {
    dirty = true;
    const bar = $('.savebar');
    if (bar) { bar.classList.add('dirty'); $('.savebar .status').textContent = 'You have unsaved changes'; }
  };

  function field(label, hint, control, id) {
    return h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('p', { class: 'hint' }, hint) : null);
  }
  function textField(parent, key, o = {}) {
    const id = nid();
    const v = parent[key] == null ? '' : String(parent[key]);
    const multi = o.multi ?? (MULTI.has(key) || v.includes('\n') || v.length > 90);
    const el = multi
      ? h('textarea', { id, rows: o.rows || Math.min(9, Math.max(3, Math.ceil(v.length / 70) + v.split('\n').length - 1)) })
      : h('input', { id, type: o.type || 'text' });
    el.value = v;
    el.addEventListener('input', () => { parent[key] = el.value; markDirty(); if (o.onInput) o.onInput(el.value); });
    return field(o.label || human(key), o.hint ?? HINTS[key] ?? linkHint(key), el, id);
  }
  function selectField(parent, key, options, o = {}) {
    const id = nid();
    const el = h('select', { id }, options.map((x) => h('option', { value: x }, x)));
    if (parent[key] && !options.includes(parent[key])) el.append(h('option', { value: parent[key] }, parent[key]));
    el.value = parent[key] || options[0];
    parent[key] = el.value;
    el.addEventListener('change', () => { parent[key] = el.value; markDirty(); });
    return field(o.label || human(key), o.hint ?? HINTS[key], el, id);
  }
  function checkField(parent, key, o = {}) {
    const id = nid();
    const el = h('input', { id, type: 'checkbox', checked: !!parent[key] });
    el.addEventListener('change', () => { parent[key] = el.checked; markDirty(); });
    return h('div', { class: 'field' }, h('div', { class: 'check' }, el, h('label', { for: id }, o.label || human(key))), o.hint ? h('p', { class: 'hint' }, o.hint) : null);
  }

  /* ---- photos: shrink in the browser, upload to the function, store the path */
  function shrinkImage(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error('Please choose a JPG, PNG or WebP photo.'));
      if (file.size > 30 * 1024 * 1024) return reject(new Error('That photo is too large. Please choose one under 30 MB.'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const max = 1800;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (!blob) return reject(new Error('That photo could not be read.'));
          const fr = new FileReader();
          fr.onload = () => resolve({ b64: String(fr.result).split(',')[1], preview: URL.createObjectURL(blob) });
          fr.onerror = () => reject(new Error('That photo could not be read.'));
          fr.readAsDataURL(blob);
        }, 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That photo could not be read.')); };
      img.src = url;
    });
  }
  function imageField(parent, key, o = {}) {
    const id = nid();
    const thumb = h('img', { class: 'thumb', alt: '' });
    const msg = h('span', { class: 'imgmsg' });
    const setSrc = () => {
      const v = parent[key] || '';
      thumb.src = blobs.get(v) || (v ? '/' + v.replace(/^\//, '') : '');
      msg.textContent = v ? 'Current file: ' + v : 'No photo chosen yet.';
    };
    const input = h('input', { id, type: 'file', accept: 'image/jpeg,image/png,image/webp' });
    input.addEventListener('change', async () => {
      const f = input.files[0];
      if (!f) return;
      msg.textContent = 'Uploading…';
      try {
        const { b64, preview } = await shrinkImage(f);
        const r = await api('upload', { name: f.name, data: b64 });
        parent[key] = r.path;
        blobs.set(r.path, preview);
        setSrc();
        markDirty();
        msg.textContent = 'Photo uploaded. Click "Save changes" to use it on the website.';
      } catch (e) {
        setSrc();
        msg.textContent = e.message;
      }
      input.value = '';
    });
    setSrc();
    return field(o.label || human(key), o.hint ?? HINTS.image, h('div', { class: 'imgfield' }, thumb, h('div', {}, input, msg)), id);
  }

  /* ---- markdown editor with a small toolbar and a preview */
  function markdownField(parent, key, o = {}) {
    const id = nid();
    const ta = h('textarea', { id, rows: o.rows || 16 });
    ta.value = parent[key] || '';
    ta.addEventListener('input', () => { parent[key] = ta.value; markDirty(); });
    const preview = h('iframe', { class: 'preview hidden', title: 'Preview', sandbox: '' });
    const wrap = (before, after = before, placeholder = 'text') => () => {
      const s = ta.selectionStart, e = ta.selectionEnd;
      const sel = ta.value.slice(s, e) || placeholder;
      ta.setRangeText(before + sel + after, s, e, 'end');
      ta.dispatchEvent(new Event('input')); ta.focus();
    };
    const linePrefix = (prefix) => () => {
      const s = ta.selectionStart;
      const start = ta.value.lastIndexOf('\n', s - 1) + 1;
      ta.setRangeText(prefix, start, start, 'end');
      ta.dispatchEvent(new Event('input')); ta.focus();
    };
    const linkBtn = () => {
      const url = window.prompt('Web address for the link (for example https://example.com):');
      if (url) wrap('[', `](${url})`, 'link text')();
    };
    let previewing = false;
    const toggle = h('button', { type: 'button', class: 'btn-line btn-small' }, 'Preview');
    toggle.addEventListener('click', () => {
      previewing = !previewing;
      if (previewing) {
        preview.srcdoc = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/css/styles.css"><body style="margin:0;padding:28px"><div class="prose prose-post" style="margin:0">${GC.md(ta.value, { leadFirst: true })}</div>`;
      }
      preview.classList.toggle('hidden', !previewing);
      ta.classList.toggle('hidden', !previewing ? false : true);
      tools.classList.toggle('hidden', previewing);
      toggle.textContent = previewing ? 'Back to editing' : 'Preview';
    });
    const tools = h('div', { class: 'md-tools' },
      h('button', { type: 'button', class: 'btn-line btn-small', onclick: linePrefix('## ') }, 'Heading'),
      h('button', { type: 'button', class: 'btn-line btn-small', onclick: wrap('**') }, 'Bold'),
      h('button', { type: 'button', class: 'btn-line btn-small', onclick: wrap('*') }, 'Italic'),
      h('button', { type: 'button', class: 'btn-line btn-small', onclick: linkBtn }, 'Link'),
      h('button', { type: 'button', class: 'btn-line btn-small', onclick: linePrefix('- ') }, 'Bullet list'),
      h('button', { type: 'button', class: 'btn-line btn-small', onclick: linePrefix('> ') }, 'Quote'));
    const box = h('div', {}, h('div', { class: 'top-actions', style: null }, tools, toggle), ta, preview);
    return field(o.label || human(key), o.hint ?? HINTS[key], box, id);
  }

  /* ---- groups and lists */
  function blank(x, key) {
    if (typeof x === 'string') return '';
    if (typeof x === 'boolean') return false;
    if (Array.isArray(x)) return [];
    if (x && typeof x === 'object') {
      const o = {};
      for (const [k, v] of Object.entries(x)) o[k] = k === 'icon' ? 'building' : k === 'link' && key === 'members' ? 'about.html#team' : blank(v, k);
      return o;
    }
    return '';
  }
  function objectField(parent, key, o = {}) {
    const obj = parent[key];
    const d = h('details', { class: 'group', open: o.open });
    d.append(h('summary', {}, o.label || human(key)));
    const body = h('div', { class: 'group-body' });
    Object.keys(obj).forEach((k) => body.append(renderValue(obj, k)));
    d.append(body);
    return d;
  }
  function listField(parent, key, o = {}) {
    const arr = parent[key];
    const objects = arr.length ? typeof arr[0] === 'object' : !!FALLBACK[key] && typeof FALLBACK[key] === 'object';
    const box = h('div', { class: 'list' });
    const template = () => (arr.length ? blank(arr[0], key) : FALLBACK[key] ? JSON.parse(JSON.stringify(FALLBACK[key])) : '');
    const move = (i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; markDirty(); draw(); };
    const remove = (i) => { if (window.confirm('Remove this item?')) { arr.splice(i, 1); markDirty(); draw(); } };
    const tools = (i) => [
      h('button', { type: 'button', class: 'btn-line btn-small', title: 'Move up', 'aria-label': 'Move up', onclick: () => move(i, -1) }, '↑'),
      h('button', { type: 'button', class: 'btn-line btn-small', title: 'Move down', 'aria-label': 'Move down', onclick: () => move(i, 1) }, '↓'),
      h('button', { type: 'button', class: 'btn-danger btn-small', onclick: () => remove(i) }, 'Remove'),
    ];
    function draw() {
      box.innerHTML = '';
      arr.forEach((item, i) => {
        if (objects) {
          const titleKey = ['title', 'name', 'question'].find((k) => k in item);
          const sum = h('summary', {}, (titleKey && item[titleKey]) || `${human(o.singular || 'Item')} ${i + 1}`);
          const d = h('details', { class: 'group item' }, sum);
          const body = h('div', { class: 'group-body' }, h('div', { class: 'item-tools' }, tools(i)));
          Object.keys(item).forEach((k) => body.append(renderValue(item, k, { onInput: k === titleKey ? (v) => { sum.textContent = v || `${human(o.singular || 'Item')} ${i + 1}`; } : null })));
          d.append(body);
          box.append(d);
        } else {
          const id = nid();
          const multi = String(item).length > 90 || String(item).includes('\n');
          const el = multi ? h('textarea', { id, rows: 3 }) : h('input', { id, type: 'text' });
          el.value = item;
          el.setAttribute('aria-label', `${human(key)} ${i + 1}`);
          el.addEventListener('input', () => { arr[i] = el.value; markDirty(); });
          box.append(h('div', { class: 'row' }, el, tools(i)));
        }
      });
      box.append(h('button', { type: 'button', class: 'btn-line', onclick: () => { arr.push(template()); markDirty(); draw(); } }, '+ Add'));
    }
    draw();
    return h('div', { class: 'field' }, h('label', {}, o.label || human(key)), box, o.hint ? h('p', { class: 'hint' }, o.hint) : null);
  }

  function renderValue(parent, key, o = {}) {
    const v = parent[key];
    if (Array.isArray(v)) return listField(parent, key, { singular: key.replace(/s$/, '') });
    if (v && typeof v === 'object') return objectField(parent, key);
    if (typeof v === 'boolean') return checkField(parent, key);
    if (key === 'icon') return selectField(parent, key, ICONS);
    if (isImageKey(key)) return imageField(parent, key);
    if (key === 'body') return markdownField(parent, key, { rows: 22 });
    return textField(parent, key, o);
  }

  /* ----------------------------------------------------- page / settings files */
  function view(...nodes) {
    const v = $('#view');
    v.innerHTML = '';
    v.append(...nodes);
  }
  const loading = (text = 'Loading…') => view(h('p', { class: 'muted' }, text));

  async function openFile(it) {
    loading();
    const path = `content/${it.file}.json`;
    let data, sha;
    try {
      const r = await api('get', { path });
      data = JSON.parse(r.content);
      sha = r.sha;
    } catch (e) { return view(h('p', { class: 'error' }, e.message)); }

    const [t, sub] = TITLES[it.id] || [it.label, ''];
    const form = h('form', { onsubmit: (e) => e.preventDefault() });
    let firstGroup = true;
    Object.keys(data).forEach((k) => {
      const v = data[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        form.append(objectField(data, k, { open: firstGroup || Object.keys(data).length <= 4 }));
        firstGroup = false;
      } else form.append(renderValue(data, k));
    });

    const status = h('span', { class: 'status' }, 'No changes yet');
    const saveBtn = h('button', { type: 'button', class: 'btn-primary' }, 'Save changes');
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      status.textContent = 'Saving…';
      try {
        const r = await api('save', { path, sha, content: JSON.stringify(data, null, 2) + '\n' });
        sha = r.sha;
        dirty = false;
        $('.savebar').classList.remove('dirty');
        status.textContent = 'All changes saved';
        toast('Saved. Your changes will be live on the website in about a minute.');
      } catch (e) {
        status.textContent = 'Not saved';
        toast(e.message, 'error');
      } finally { saveBtn.disabled = false; }
    });
    view(h('h1', { class: 'page-title' }, t), h('p', { class: 'page-sub' }, sub), form,
      h('div', { class: 'savebar' }, status, h('div', { class: 'actions' }, saveBtn)));
  }

  /* ------------------------------------------------------------- blog posts */
  let knownSlugs = [];
  async function showPosts() {
    loading('Loading posts…');
    let posts;
    try { posts = (await api('list-posts')).posts; } catch (e) { return view(h('p', { class: 'error' }, e.message)); }
    knownSlugs = posts.map((p) => p.slug);
    const rows = posts.map((p) => h('tr', {},
      h('td', {}, p.title),
      h('td', {}, GC.fmtDate(p.date) || '—'),
      h('td', {}, p.draft ? h('span', { class: 'badge' }, 'Hidden (draft)') : h('span', { class: 'badge' }, 'Published'), p.featured ? h('span', { class: 'badge gold' }, 'Featured') : null),
      h('td', {}, h('button', { type: 'button', class: 'btn-line btn-small', onclick: () => openPost(p.slug) }, 'Edit'))));
    view(
      h('div', { class: 'top-actions' }, h('div', {}, h('h1', { class: 'page-title' }, TITLES.posts[0]), h('p', { class: 'page-sub' }, TITLES.posts[1])),
        h('button', { type: 'button', class: 'btn-primary', onclick: () => openPost(null) }, '+ New post')),
      posts.length
        ? h('table', { class: 'posts' }, h('thead', {}, h('tr', {}, h('th', {}, 'Title'), h('th', {}, 'Date'), h('th', {}, 'Status'), h('th', {}, ''))), h('tbody', {}, rows))
        : h('p', { class: 'muted' }, 'No posts yet. Click "New post" to write the first one.'));
  }

  const CATEGORIES = ['Corporate & commercial', 'Dispute resolution', 'Property & real estate', 'Employment & workplace', 'Family & private client', 'Regulatory & compliance'];
  const TOPICS = ['Business', 'Disputes', 'Property', 'Private client'];

  async function openPost(slug) {
    if (dirty && !confirmLeave()) return;
    dirty = false;
    clearToast();
    loading();
    const today = new Date().toISOString().slice(0, 10);
    let data = { title: '', date: today, category: CATEGORIES[0], topic: TOPICS[0], read_time: '5 min read', excerpt: '', image: '', image_alt: '', featured: false, draft: false };
    let body = '';
    let sha = null;
    if (slug) {
      try {
        const r = await api('get', { path: `content/posts/${slug}.md` });
        const p = GC.parseFront(r.content, slug);
        data = { ...data, ...p.data, date: (/\d{4}-\d{2}-\d{2}/.exec(String(p.data.date)) || [today])[0] };
        body = p.body.trim();
        sha = r.sha;
      } catch (e) { return view(h('p', { class: 'error' }, e.message)); }
    }
    const holder = { body };
    const form = h('form', { onsubmit: (e) => e.preventDefault() },
      textField(data, 'title', { label: 'Title', multi: false }),
      textField(data, 'date', { label: 'Date', type: 'date', hint: 'The date shown on the post. Newer posts appear first.' }),
      selectField(data, 'category', CATEGORIES, { label: 'Category label', hint: 'The small gold label above the title.' }),
      selectField(data, 'topic', TOPICS, { label: 'Filter group', hint: 'Which filter button on the Blog page lists this post.' }),
      textField(data, 'read_time', { label: 'Reading time', multi: false, hint: 'For example: 5 min read' }),
      textField(data, 'excerpt', { label: 'Short summary', multi: true, rows: 3, hint: 'One or two sentences shown on the post cards and in Google results.' }),
      imageField(data, 'image', { label: 'Cover image' }),
      textField(data, 'image_alt', { label: 'Cover image description', multi: false, hint: 'A short description of the photo for screen readers.' }),
      checkField(data, 'featured', { label: 'Featured post', hint: 'The newest featured post appears in the large panel at the top of the Blog page.' }),
      checkField(data, 'draft', { label: 'Hide from the website (draft)', hint: 'Tick this to keep the post saved but not shown to visitors.' }),
      markdownField(holder, 'body', { label: 'Article text', hint: 'The first paragraph is shown slightly larger. Use "Heading" for section titles.' }));

    const status = h('span', { class: 'status' }, slug ? 'No changes yet' : 'New post');
    const saveBtn = h('button', { type: 'button', class: 'btn-primary' }, slug ? 'Save changes' : 'Publish post');
    const back = h('button', { type: 'button', class: 'btn-line', onclick: () => { if (confirmLeave()) { dirty = false; showPosts(); } } }, '← All posts');
    const actions = h('div', { class: 'actions' }, back);
    if (slug) {
      actions.append(h('button', { type: 'button', class: 'btn-danger', onclick: async () => {
        if (!window.confirm('Delete this post permanently? This cannot be undone.')) return;
        try { await api('delete', { path: `content/posts/${slug}.md`, sha }); dirty = false; toast('Post deleted. It will disappear from the website in about a minute.'); showPosts(); }
        catch (e) { toast(e.message, 'error'); }
      } }, 'Delete'));
    }
    actions.append(saveBtn);

    saveBtn.addEventListener('click', async () => {
      if (!String(data.title).trim()) return toast('Please give the post a title.', 'error');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) return toast('Please choose a date.', 'error');
      let useSlug = slug;
      if (!useSlug) {
        const base = GC.slugify(data.title).slice(0, 70) || 'post';
        useSlug = base;
        for (let n = 2; knownSlugs.includes(useSlug); n++) useSlug = `${base}-${n}`;
      }
      saveBtn.disabled = true;
      status.textContent = 'Saving…';
      try {
        const r = await api('save', { path: `content/posts/${useSlug}.md`, sha: sha || undefined, content: GC.serializePost(data, holder.body) });
        sha = r.sha;
        if (!slug) { slug = useSlug; knownSlugs.push(slug); saveBtn.textContent = 'Save changes'; }
        dirty = false;
        $('.savebar').classList.remove('dirty');
        status.textContent = 'All changes saved';
        toast('Saved. Your changes will be live on the website in about a minute.');
      } catch (e) { status.textContent = 'Not saved'; toast(e.message, 'error'); }
      finally { saveBtn.disabled = false; }
    });

    view(h('h1', { class: 'page-title' }, slug ? 'Edit post' : 'New post'), h('p', { class: 'page-sub' }, 'Changes go live about a minute after you save.'), form, h('div', { class: 'savebar' }, status, actions));
  }

  /* ------------------------------------------------------------------ start */
  async function startApp() {
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    buildNav();
    const first = NAV[0].items[0];
    markNav(first.id);
    showPosts();
  }

  (async () => {
    if (!token) return showLogin();
    try { await api('me'); startApp(); } catch (e) { showLogin(); }
  })();
})();
