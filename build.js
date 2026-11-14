'use strict';
/*
  Gamaliel Consult: site builder (no dependencies).
  Reads everything in /content (edited through /admin) and writes the finished website into /dist.
  Netlify runs this automatically on every deploy:  node build.js
*/
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'dist');
const CONTENT = path.join(ROOT, 'content');

/* ---------------------------------------------------------------- helpers */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const br = (s, cls) => esc(s).trim().replace(/\r?\n/g, cls ? `<br class="${cls}"> ` : '<br>');
const pad = (n) => String(n).padStart(2, '0');
const slugify = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtDate = (iso) => {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${parseInt(m[3], 10)} ${MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}` : '';
};
const readJSON = (name) => {
  const file = path.join(CONTENT, name);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { throw new Error(`Could not read content/${name}: ${e.message}`); }
};
const deep = (v, fn) => {
  if (typeof v === 'string') return fn(v);
  if (Array.isArray(v)) return v.map((x) => deep(x, fn));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x, fn)]));
  return v;
};
const safeUrl = (u) => (/^\s*(javascript|data|vbscript):/i.test(u) ? '#' : u);

/* ------------------------------------------------- tiny markdown renderer */
function inl(src, opts = {}) {
  let s = esc(src);
  const stash = [];
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => {
    const url = safeUrl(u.replace(/&amp;/g, '&'));
    const ext = /^https?:/i.test(url) ? ' target="_blank" rel="noopener"' : '';
    stash.push(`<a href="${esc(url)}"${ext}>${t}</a>`);
    return `\u0000${stash.length - 1}\u0000`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  if (opts.todo !== false) s = s.replace(/\[([^\]]+)\]/g, '<span class="todo">[$1]</span>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[+i]);
}
function md(src, { leadFirst = false } = {}) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0, first = true;
  const special = (l) => /^(#{1,6}\s|>|[-*]\s|\d+\.\s|!\[|(-{3,}|\*{3,})$)/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{1,6})\s+(.*)$/))) {
      const lvl = m[1].length <= 2 ? 2 : m[1].length;
      out.push(`<h${lvl}>${inl(m[2].trim())}</h${lvl}>`); i++; continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if ((m = l.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/))) {
      out.push(`<img src="${esc(safeUrl(m[2]))}" alt="${esc(m[1])}">`); i++; continue;
    }
    if (/^>\s?/.test(l)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${inl(buf.join(' ').trim())}</blockquote>`); continue;
    }
    if (/^[-*]\s+/.test(l)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^[-*]\s+/, ''));
      out.push(`<ul>${items.map((x) => `\n  <li>${inl(x)}</li>`).join('')}\n</ul>`); continue;
    }
    if (/^\d+\.\s+/.test(l)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\d+\.\s+/, ''));
      out.push(`<ol>${items.map((x) => `\n  <li>${inl(x)}</li>`).join('')}\n</ol>`); continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !special(lines[i])) buf.push(lines[i++].trim());
    if (!buf.length) { buf.push(lines[i++]); }
    out.push(`<p${leadFirst && first ? ' class="lead-p"' : ''}>${inl(buf.join(' '))}</p>`);
    first = false;
  }
  return out.join('\n          ');
}

/* ------------------------------------------- front matter (blog posts) */
function scalar(v) {
  v = v.trim();
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === '' || v === 'null' || v === '~') return '';
  if (v[0] === '"' && v.endsWith('"') && v.length > 1) { try { return JSON.parse(v); } catch (e) { return v.slice(1, -1); } }
  if (v[0] === "'" && v.endsWith("'") && v.length > 1) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}
function parseFront(text, file) {
  const m = text.replace(/\r\n?/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing the --- front matter block`);
  const data = {};
  const ls = m[1].split('\n');
  for (let i = 0; i < ls.length; i++) {
    const mm = ls[i].match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!mm) continue;
    const key = mm[1];
    let v = mm[2].trim();
    if (/^[>|][+-]?$/.test(v)) {
      const folded = v[0] === '>';
      const buf = [];
      while (i + 1 < ls.length && (/^\s/.test(ls[i + 1]) || ls[i + 1] === '')) buf.push(ls[++i].trim());
      data[key] = buf.join(folded ? ' ' : '\n').trim();
      continue;
    }
    const cont = [];
    while (i + 1 < ls.length && /^\s+\S/.test(ls[i + 1])) cont.push(ls[++i].trim());
    if (cont.length) v = [v, ...cont].join(' ');
    data[key] = scalar(v);
  }
  return { data, body: m[2] };
}

/* ------------------------------------------------------------- load data */
const settings0 = readJSON('settings.json');
const digits = (s) => String(s || '').replace(/\D/g, '');
const S0 = settings0;
const tel = (S0.phone_for_tap_to_call || S0.phone || '').replace(/[^\d+]/g, '');
const TOKENS = {
  email: S0.email || '',
  phone: S0.phone || '',
  whatsapp: S0.whatsapp_number ? `https://wa.me/${digits(S0.whatsapp_number)}` : '',
  linkedin: S0.linkedin_url || '',
};
const tok = (s) => s.replace(/\{\{\s*(email|phone|whatsapp|linkedin)\s*\}\}/g, (_, k) => TOKENS[k]);
const load = (n) => deep(readJSON(n), tok);

const S = deep(settings0, tok);
const home = load('home.json');
const about = load('about.json');
const practice = load('practice-areas.json');
const contact = load('contact.json');
const blog = load('blog.json');
const team = load('team.json');
const privacy = load('privacy.json');
const legal = load('legal.json');

const posts = fs.readdirSync(path.join(CONTENT, 'posts')).filter((f) => f.endsWith('.md')).map((f) => {
  const { data, body } = parseFront(fs.readFileSync(path.join(CONTENT, 'posts', f), 'utf8'), f);
  const d = deep(data, (x) => tok(x));
  const slug = f.replace(/\.md$/, '');
  const date = (/\d{4}-\d{2}-\d{2}/.exec(String(d.date)) || [''])[0];
  return {
    slug, file: `post-${slug}.html`, title: d.title || slug, category: d.category || '', topic: d.topic || '',
    topicSlug: slugify(d.topic || ''), date, dateText: fmtDate(date), read: d.read_time || '', excerpt: d.excerpt || '',
    image: d.image || '', alt: d.image_alt || '', featured: d.featured === true, draft: d.draft === true, body: tok(body),
  };
}).filter((p) => !p.draft).sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : a.slug.localeCompare(b.slug)));

/* ------------------------------------------------------------- components */
const ICONS = {
  building: '<path d="M6 28V6h12v22M18 12h8v16M3 28h26M10 11h4M10 16h4M10 21h4M21 17h2M21 22h2"/>',
  scales: '<path d="M16 5v21M9 26h14M6 9h20M6 9l-3 8a4 4 0 008 0L8 9M26 9l-3 8a4 4 0 008 0l-3-8"/>',
  columns: '<path d="M4 12L16 5l12 7M6 12v1M26 12v1M8 14v10M13 14v10M19 14v10M24 14v10M4 26h24M5 28h22"/>',
  briefcase: '<path d="M4 11h24v15H4zM11 11V7h10v4M4 18h24M14 18v2h4v-2"/>',
  users: '<path d="M12 14a4.5 4.5 0 100-9 4.5 4.5 0 000 9zM3 27c0-5 4-8 9-8s9 3 9 8M21 6.5a4 4 0 010 7.5M24 19.5c3 1 5 3.5 5 7.5"/>',
  shield: '<path d="M16 4l10 4v8c0 6-4 10-10 12C10 26 6 22 6 16V8zM11.5 16l3.5 3.5 6-6.5"/>',
};
const icon = (name) => `<svg viewBox="0 0 32 32" aria-hidden="true">${ICONS[name] || ICONS.building}</svg>`;
const NAV = [['Home', 'index.html'], ['About Us', 'about.html'], ['Practice Areas', 'practice-areas.html'], ['Blog', 'blog.html'], ['Contact Us', 'contact.html']];

const header = (active, border) => `  <!-- ============ HEADER ============ -->
  <header class="site-header${border ? ' has-border' : ''}">
    <div class="container header-inner">
      <a class="logo" href="index.html" aria-label="Gamaliel Consult home">
        <img src="images/logo.png" alt="Gamaliel Consult" width="489" height="462">
      </a>
      <nav class="main-nav" aria-label="Main">
${NAV.map(([l, h]) => (h === active ? `        <a href="${h}" class="active" aria-current="page">${l}</a>` : `        <a href="${h}">${l}</a>`)).join('\n')}
        <a href="contact.html" class="btn">${esc(S.header_button_label || 'Book a consultation')}</a>
      </nav>
      <button class="menu-toggle" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-menu">
        <svg class="icon-open" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6h14M3 10h14M3 14h14"/></svg>
        <svg class="icon-close" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4l12 12M16 4L4 16"/></svg>
      </button>
    </div>
    <nav class="mobile-menu" id="mobile-menu" aria-label="Mobile">
      <ul class="container">
${NAV.map(([l, h]) => (h === active ? `        <li><a href="${h}" class="active">${l}</a></li>` : `        <li><a href="${h}">${l}</a></li>`)).join('\n')}
        <li><a href="contact.html" class="btn btn-block">${esc(S.header_button_label || 'Book a consultation')}</a></li>
      </ul>
    </nav>
  </header>
`;

const footer = () => `  <!-- ============ FOOTER ============ -->
  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div>
          <a class="footer-logo" href="index.html"><img src="images/logo.png" alt="Gamaliel Consult" width="489" height="462"></a>
          <p class="footer-tagline">${esc(S.footer_tagline)}</p>
        </div>
        <div class="footer-cols">
          <div>
            <p class="eyebrow">Explore</p>
            <ul>
${NAV.map(([l, h]) => `              <li><a href="${h}">${l}</a></li>`).join('\n')}
            </ul>
          </div>
          <div>
            <p class="eyebrow">Get in touch</p>
            <div class="contact-lines">
              <a href="mailto:${esc(S.email)}">${esc(S.email)}</a>${S.address ? `\n              <p>${br(S.address)}</p>` : ''}
              <p>${br(S.footer_lines)}</p>${S.linkedin_url ? `\n              <a href="${esc(safeUrl(S.linkedin_url))}" class="link" target="_blank" rel="noopener"><span>LinkedIn</span></a>` : ''}
            </div>
          </div>
        </div>
      </div>
      <div class="footer-bottom">
        <p>© <span id="year">${new Date().getFullYear()}</span> Gamaliel Consult. All rights reserved.</p>
        <nav aria-label="Legal">
          <a href="privacy.html">Privacy policy</a>
          <a href="legal.html">Legal notice</a>
        </nav>
      </div>
    </div>
  </footer>
`;

function shell({ title, desc, active, border, main }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="icon" href="images/logo.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Lora:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>

${header(active, border)}
  <main>
${main}
  </main>

${footer()}
  <script src="js/main.js"></script>
</body>
</html>
`;
}

const link = (href, label, cls = 'link') => `<a href="${esc(safeUrl(href))}" class="${cls}"><span>${esc(label)}</span></a>`;
const heroStack = (theme, h, extra = '') => `    <section class="hero-stack hero-${theme}">
      <div class="container">
        <p class="eyebrow">${esc(h.eyebrow)}</p>
        <h1>${br(h.heading, 'br-m')}</h1>
        <p class="hero-stack-text">${esc(h.text)}</p>${extra}
      </div>
    </section>
`;
const steps = (arr = []) => `<ol class="steps">${arr.map((s, i) => `
          <li class="step">
            <p class="n">${pad(i + 1)}</p>
            <h3>${esc(s.title)}</h3>
            <p class="small-text">${esc(s.text)}</p>
          </li>`).join('')}
        </ol>`;
const cta = (c) => `    <section class="cta bg-sand">
      <div class="container cta-inner">
        <div>
          <p class="eyebrow">${esc(c.eyebrow)}</p>
          <h2 class="section-title">${br(c.title)}</h2>
          <p class="small-text">${inl(c.text, { todo: false })}</p>
        </div>
        <a href="${esc(safeUrl(c.button_link || 'contact.html'))}" class="btn btn-block">${esc(c.button_label)}</a>
      </div>
    </section>
`;
const faq = (f, { open = true } = {}) => `<div class="faq-list">${(f.items || []).map((it, i) => `
          <details class="faq"${open && i === 0 ? ' open' : ''}>
            <summary>${esc(it.question)}<span class="faq-icon" aria-hidden="true"></span></summary>
            <p class="small-text">${esc(it.answer)}</p>
          </details>`).join('')}
        </div>`;
const img = (src, alt = '') => `<img src="${esc(src)}" alt="${esc(alt)}">`;

function carousel(variant, t) {
  const members = team.members || [];
  const cards = members.map((m) => `
            <li class="team-card">
              <div class="photo">${img(m.image, m.name)}</div>
              <div class="info">
                <h3>${esc(m.name)}</h3>
                <p class="role">${esc(m.role)}</p>
                <p>${esc(variant === 'home' ? m.short_bio : m.long_bio)}</p>${variant === 'about' && m.focus ? `\n                <p class="focus">${esc(t.focus_label || 'Practice focus:')} ${esc(m.focus)}</p>` : ''}${m.link ? `\n                <a href="${esc(safeUrl(m.link))}" class="link"><span>${esc(t.profile_link_label || 'View profile')}</span></a>` : ''}
              </div>
            </li>`).join('');
  return `<div class="carousel${variant === 'about' ? ' carousel-stack' : ''}">
          <ul class="carousel-track" aria-label="Attorneys" tabindex="0">${cards}
          </ul>

          <div class="carousel-controls">
            <button class="arrow-btn arrow-prev" type="button" aria-label="Previous attorney">
              <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M8 2L4 6l4 4"/></svg>
            </button>
            <div class="dots"></div>
            <button class="arrow-btn arrow-next" type="button" aria-label="Next attorney">
              <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2l4 4-4 4"/></svg>
            </button>
          </div>
        </div>`;
}

const postCard = (p, { excerpt = false, cat = false } = {}) => `
          <article class="post"${cat ? ` data-cat="${esc(p.topicSlug)}"` : ''}>
            <a class="thumb" href="${p.file}">${img(p.image, '')}</a>
            <span class="eyebrow">${esc(p.category)}</span>
            <h3><a href="${p.file}">${esc(p.title)}</a></h3>${excerpt ? `\n            <p class="excerpt">${esc(p.excerpt)}</p>` : ''}
            <p class="meta">${esc(p.dateText)}${p.read ? ' · ' + esc(p.read) : ''}</p>
            <a href="${p.file}" class="link"><span>${esc(home.journal.read_label || 'Read insight')}</span></a>
          </article>`;

/* ------------------------------------------------------------------ pages */
const pages = {};

pages['index.html'] = () => {
  const h = home;
  const main = `
    <!-- ============ HERO ============ -->
    <section class="hero">
      <div class="container">
        <div class="hero-text">
          <p class="eyebrow">${esc(h.hero.eyebrow)}</p>
          <h1>${br(h.hero.heading)}</h1>
          <p class="lead">${esc(h.hero.text)}</p>
          <a href="${esc(safeUrl(h.hero.button_link || 'contact.html'))}" class="btn btn-block">${esc(h.hero.button_label)}</a>
          <p class="note">${esc(h.hero.note)}</p>
        </div>
      </div>
      <div class="hero-image">
        ${img(h.hero.image, h.hero.image_alt)}
        <p class="hero-caption">${esc(h.hero.caption)}</p>
      </div>
    </section>

    <!-- ============ OUR PERSPECTIVE ============ -->
    <section class="section bg-white perspective">
      <div class="container two-col">
        <div>
          <p class="eyebrow">${esc(h.perspective.eyebrow)}</p>
          <h2 class="section-title">${br(h.perspective.title)}</h2>
        </div>
        <div class="right">
          <p class="body-text">${esc(h.perspective.text)}</p>
          ${link(h.perspective.link, h.perspective.link_label)}
        </div>
      </div>
    </section>

    <!-- ============ PRACTICE AREAS ============ -->
    <section class="section bg-cream">
      <div class="container">
        <div class="head-row">
          <div>
            <p class="eyebrow">${esc(h.practice.eyebrow)}</p>
            <h2 class="section-title" style="max-width:460px">${br(h.practice.title)}</h2>
          </div>
          ${link(h.practice.link, h.practice.link_label)}
        </div>

        <div class="practice-grid">${(h.practice.cards || []).map((c, i) => `
          <article class="practice-card">
            <div class="top">
              ${icon(c.icon)}
              <span class="num">${pad(i + 1)}</span>
            </div>
            <h3>${esc(c.title)}</h3>
            <p class="small-text">${esc(c.text)}</p>
            ${link(c.link, h.practice.card_link_label || 'Learn more')}
          </article>`).join('')}
        </div>
      </div>
    </section>

    <!-- ============ FOUNDER ============ -->
    <section class="section bg-white founder">
      <div class="container">
        <p class="eyebrow">${esc(h.founder.eyebrow)}</p>
        <h2 class="section-title" style="max-width:820px">${br(h.founder.title)}</h2>
        <p class="body-text max-760" style="margin-top:20px">${esc(h.founder.intro)}</p>

        <div class="founder-wrap">
          <div class="founder-photo">
            ${img(h.founder.image, h.founder.image_alt || h.founder.name)}
          </div>
          <div>
            <h3>${esc(h.founder.name)}</h3>
            <p class="role">${esc(h.founder.role)}</p>
            <p class="body-text">${esc(h.founder.bio)}</p>
            <span class="eyebrow">${esc(h.founder.focus_label)}</span>
            <ul class="tags">${(h.founder.tags || []).map((t) => `
              <li>${esc(t)}</li>`).join('')}
            </ul>
            ${link(h.founder.link, h.founder.link_label)}
          </div>
        </div>
      </div>
    </section>

    <!-- ============ ATTORNEYS ============ -->
    <section class="section bg-cream">
      <div class="container">
        <p class="eyebrow">${esc(h.team.eyebrow)}</p>
        <h2 class="section-title max-760">${br(h.team.title)}</h2>
        <p class="small-text" style="margin-top:16px">${esc(h.team.intro)}</p>

        ${carousel('home', h.team)}
      </div>
    </section>

    <!-- ============ APPROACH ============ -->
    <section class="section bg-white">
      <div class="container">
        <p class="eyebrow">${esc(h.approach.eyebrow)}</p>
        <h2 class="section-title">${br(h.approach.title)}</h2>
        <p class="small-text" style="margin-top:16px">${esc(h.approach.intro)}</p>
        ${steps(h.approach.steps)}
      </div>
    </section>

    <!-- ============ JOURNAL / BLOG PREVIEW ============ -->
    <section class="section bg-cream">
      <div class="container">
        <p class="eyebrow">${esc(h.journal.eyebrow)}</p>
        <div class="journal-head">
          <h2 class="section-title">${br(h.journal.title)}</h2>
          ${link(h.journal.link, h.journal.link_label)}
        </div>
        <div class="posts">${posts.slice(0, 3).map((p) => postCard(p)).join('')}
        </div>
      </div>
    </section>

    <!-- ============ CTA BAND ============ -->
${cta(S.cta)}`;
  return shell({ title: h.seo_title, desc: h.seo_description, active: 'index.html', border: false, main });
};

pages['about.html'] = () => {
  const a = about;
  const main = `
    <!-- ============ ABOUT HERO ============ -->
${heroStack('navy', a.hero)}
    <!-- ============ ATTORNEYS ============ -->
    <section class="bg-cream attorneys" id="team">
      <div class="container">
        <p class="eyebrow">${esc(a.team.eyebrow)}</p>
        <h2 class="section-title max-760">${br(a.team.title)}</h2>
        <p class="small-text" style="margin-top:16px">${esc(a.team.intro)}</p>${a.team.mobile_note ? `\n        <p class="note-gold">${esc(a.team.mobile_note)}</p>` : ''}

        ${carousel('about', a.team)}${a.team.footnote ? `\n\n        <p class="footnote">${esc(a.team.footnote)}</p>` : ''}
      </div>
    </section>

    <!-- ============ THE FIRM ============ -->
    <section class="section bg-white">
      <div class="container two-col firm">
        <div>
          <p class="eyebrow">${esc(a.firm.eyebrow)}</p>
          <h2 class="section-title">${br(a.firm.title)}</h2>
        </div>
        <div class="right">
          <p class="lead-dark">${esc(a.firm.lead)}</p>${(a.firm.paragraphs || []).map((p) => `
          <p class="small-text">${esc(p)}</p>`).join('')}
          ${link(a.firm.link, a.firm.link_label)}
        </div>
      </div>
    </section>

    <!-- ============ PRINCIPLES ============ -->
    <section class="section bg-navy principles">
      <div class="container">
        <p class="eyebrow">${esc(a.principles.eyebrow)}</p>
        <h2 class="section-title">${br(a.principles.title)}</h2>
        ${steps(a.principles.items)}
      </div>
    </section>

    <!-- ============ WORKING TOGETHER ============ -->
    <section class="section bg-white">
      <div class="container working">
        <div class="working-photo">
          ${img(a.working.image, a.working.image_alt)}
        </div>
        <div class="working-text">
          <p class="eyebrow">${esc(a.working.eyebrow)}</p>
          <h2 class="section-title">${br(a.working.title)}</h2>
          <p class="small-text" style="margin-top:20px">${esc(a.working.text)}</p>
          <hr class="gold-rule">
          <blockquote>“${esc(a.working.quote)}”</blockquote>
          <p class="eyebrow cite">${esc(a.working.cite)}</p>
        </div>
      </div>
    </section>

    <!-- ============ WHAT TO EXPECT ============ -->
    <section class="section bg-cream">
      <div class="container">
        <p class="eyebrow">${esc(a.expect.eyebrow)}</p>
        <h2 class="section-title">${br(a.expect.title)}</h2>
        ${steps(a.expect.steps)}
      </div>
    </section>

    <!-- ============ CTA BAND ============ -->
${cta(S.cta)}`;
  return shell({ title: a.seo_title, desc: a.seo_description, active: 'about.html', border: false, main });
};

pages['practice-areas.html'] = () => {
  const p = practice;
  const main = `
    <!-- ============ HERO ============ -->
${heroStack('navy', p.hero, `\n        ${link('#areas', p.hero.link_label, 'link link-light hero-link')}`)}
    <!-- ============ HOW WE CAN HELP ============ -->
    <section class="section bg-cream" id="areas">
      <div class="container">
        <div class="two-col help-head">
          <div>
            <p class="eyebrow">${esc(p.help.eyebrow)}</p>
            <h2 class="section-title">${br(p.help.title)}</h2>
          </div>
          <p class="small-text help-intro">${esc(p.help.intro)}</p>
        </div>

        <div class="area-grid">${(p.areas || []).map((a, i) => `
          <article class="area-card" id="${esc(a.id || slugify(a.title))}">
            <div class="top">
              ${icon(a.icon)}
              <span class="num">${pad(i + 1)}</span>
            </div>
            <h3>${esc(a.title)}</h3>
            <p class="small-text">${esc(a.text)}</p>
            <ul class="bullets">${(a.bullets || []).map((b) => `
              <li>${esc(b)}</li>`).join('')}
            </ul>
            ${link('contact.html', p.area_link_label || 'Discuss your matter')}
          </article>`).join('')}
        </div>

        <p class="footnote">${esc(p.footnote)}</p>
      </div>
    </section>

    <!-- ============ YOUR NEXT STEP ============ -->
    <section class="section bg-white">
      <div class="container">
        <p class="eyebrow">${esc(p.next.eyebrow)}</p>
        <h2 class="section-title">${br(p.next.title)}</h2>
        ${steps(p.next.steps)}
      </div>
    </section>

    <!-- ============ FAQ ============ -->
    <section class="section bg-cream">
      <div class="container two-col faq-wrap">
        <div>
          <p class="eyebrow">${esc(p.faq.eyebrow)}</p>
          <h2 class="section-title">${br(p.faq.title)}</h2>
          <p class="small-text" style="margin-top:20px;max-width:340px">${esc(p.faq.intro)}</p>
        </div>
        ${faq(p.faq)}
      </div>
    </section>

    <!-- ============ CTA BAND ============ -->
${cta(S.cta)}`;
  return shell({ title: p.seo_title, desc: p.seo_description, active: 'practice-areas.html', border: false, main });
};

const netlifyForm = (name, attrs = '') => `name="${name}" method="POST" action="/" data-netlify="true" netlify-honeypot="bot-field" data-form ${attrs} novalidate`.replace(/\s+/g, ' ');
const formHidden = (name, subject) => `<input type="hidden" name="form-name" value="${name}">
            <input type="hidden" name="subject" value="${esc(subject)}">
            <p class="hp"><label>Leave this field empty <input name="bot-field" tabindex="-1" autocomplete="off"></label></p>`;

pages['contact.html'] = () => {
  const c = contact;
  const telHref = `tel:${tel}`;
  const waHref = TOKENS.whatsapp;
  const mail = '<svg viewBox="0 0 24 24" aria-hidden="true" class="ic-stroke"><rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/></svg>';
  const phoneIc = '<svg viewBox="0 0 24 24" aria-hidden="true" class="ic-stroke"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.34 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.36 1.85.58 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
  const wa = '<svg viewBox="0 0 24 24" aria-hidden="true" class="ic-fill"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.4-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.05 21.8h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88zm8.41-18.3A11.8 11.8 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.17-3.48-8.41z"/></svg>';
  const row = (href, ic, label, value, ext = '') => `
              <li><a href="${esc(href)}"${ext}><span class="tile">${ic}</span><span class="txt"><small>${label}</small><strong>${esc(value)}</strong></span></a></li>`;
  const rows = [
    S.email ? row(`mailto:${S.email}`, mail, 'Email', S.email) : '',
    S.phone ? row(telHref, phoneIc, 'Phone', S.phone) : '',
    waHref ? row(waHref, wa, 'Whatsapp', c.direct.whatsapp_text || 'Chat with us on Whatsapp', ' target="_blank" rel="noopener"') : '',
  ].join('');
  const opts = (c.form.practice_options || []).map((o) => `<option>${esc(o)}</option>`).join('');
  const main = `
    <!-- ============ CONTACT HERO ============ -->
${heroStack('cream', c.hero, c.hero.note ? `\n        <p class="hero-note">${esc(c.hero.note)}</p>` : '')}
    <!-- ============ FORM ============ -->
    <section class="contact-main">
      <div class="container contact-grid">
        <div>
          <h2 class="form-title">${br(c.form.title)}</h2>
          <p class="form-note" style="margin-top:12px">${esc(c.form.required_note)}</p>

          <form class="enquiry" id="enquiry-form" ${netlifyForm('contact', `data-success="${esc(c.form.success_message)}"`)}>
            ${formHidden('contact', 'New enquiry from the website')}
            <div class="field-row">
              <div class="field"><label for="first">First name *</label><input id="first" name="first_name" type="text" placeholder="Your first name" required autocomplete="given-name"></div>
              <div class="field"><label for="last">Last name *</label><input id="last" name="last_name" type="text" placeholder="Your last name" required autocomplete="family-name"></div>
            </div>
            <div class="field-row">
              <div class="field"><label for="email">Email address *</label><input id="email" name="email" type="email" placeholder="you@example.com" required autocomplete="email"></div>
              <div class="field"><label for="phone">Phone number (optional)</label><input id="phone" name="phone" type="tel" placeholder="Include country code" autocomplete="tel"></div>
            </div>
            <div class="field">
              <label for="area">How can we help? *</label>
              <select id="area" name="practice_area" required>
                <option value="" selected disabled>Select a practice area</option>
                ${opts}
              </select>
            </div>
            <div class="field">
              <label for="message">A brief outline of your matter *</label>
              <textarea id="message" name="message" rows="5" placeholder="Tell us what you need help with and any important dates or deadlines." required></textarea>
            </div>

            <fieldset class="field meet">
              <legend>How would you prefer to meet?</legend>
              <div class="seg">
                <label><input type="radio" name="meeting" value="Online" checked><span>Online</span></label>
                <label><input type="radio" name="meeting" value="In person"><span>In person</span></label>
                <label><input type="radio" name="meeting" value="No preference"><span>No preference</span></label>
              </div>
            </fieldset>

            <label class="consent">
              <input type="checkbox" name="consent" required>
              <span>I agree that Gamaliel Consult may use the details provided to respond to my enquiry, in accordance with the <a href="privacy.html">privacy policy</a>. *</span>
            </label>

            <button type="submit" class="btn">Send enquiry</button>
            <p class="form-status" role="status" aria-live="polite"></p>
            <p class="form-note">${esc(c.form.disclaimer)}</p>
          </form>
        </div>

        <aside class="direct">
          <div class="direct-body">
            <p class="eyebrow">${esc(c.direct.eyebrow)}</p>
            <h3>${br(c.direct.heading)}</h3>
            <ul class="direct-list">${rows}
            </ul>
            <hr>
            <h4>${esc(c.direct.meetings_title)}</h4>
            <p>${esc(c.direct.meetings_text)}</p>
            <h4>${esc(c.direct.next_title)}</h4>
            <p>${esc(c.direct.next_text)}</p>
          </div>
          ${img(c.direct.image, c.direct.image_alt)}
        </aside>
      </div>
    </section>

    <!-- ============ WHAT TO EXPECT ============ -->
    <section class="section bg-cream">
      <div class="container">
        <p class="eyebrow">${esc(c.expect.eyebrow)}</p>
        <h2 class="section-title">${br(c.expect.title)}</h2>
        ${steps(c.expect.steps)}
      </div>
    </section>

    <!-- ============ FAQ ============ -->
    <section class="section bg-white">
      <div class="container two-col faq-wrap">
        <div>
          <p class="eyebrow">${esc(c.faq.eyebrow)}</p>
          <h2 class="section-title">${br(c.faq.title)}</h2>
          <p class="small-text" style="margin-top:20px;max-width:340px">${esc(c.faq.intro)}</p>
        </div>
        ${faq(c.faq)}
      </div>
    </section>
`;
  return shell({ title: c.seo_title, desc: c.seo_description, active: 'contact.html', border: true, main });
};

pages['blog.html'] = () => {
  const b = blog;
  const featured = posts.find((p) => p.featured) || posts[0];
  const list = posts.filter((p) => p !== featured);
  const chips = (b.filters || []).map((f) => `
            <button type="button" class="chip" data-filter="${slugify(f)}">${esc(f)}</button>`).join('');
  const main = `
    <!-- ============ JOURNAL HERO ============ -->
${heroStack('cream', b.hero)}${featured ? `
    <!-- ============ FEATURED ============ -->
    <section class="featured-wrap">
      <div class="container">
        <article class="featured">
          <a class="featured-img" href="${featured.file}">${img(featured.image, '')}</a>
          <div class="featured-body">
            <p class="eyebrow">${esc(b.featured_label)} · ${esc(featured.category)}</p>
            <h2><a href="${featured.file}">${esc(featured.title)}</a></h2>
            <p class="featured-ex">${esc(featured.excerpt)}</p>
            <p class="featured-meta">${esc(featured.dateText)}${featured.read ? ' · ' + esc(featured.read) : ''}</p>
            ${link(featured.file, b.featured_link_label, 'link link-light')}
          </div>
        </article>
      </div>
    </section>
` : ''}
    <!-- ============ FILTERS + LIST ============ -->
    <section class="blog-list">
      <div class="container">
        <div class="filter-bar">
          <div class="chips" role="group" aria-label="Filter insights by topic">
            <button type="button" class="chip active" data-filter="all">All insights</button>${chips}
          </div>
          <label class="search">
            <span class="sr-only">Search insights</span>
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>
            <input type="search" id="post-search" placeholder="Search insights" autocomplete="off">
          </label>
        </div>

        <div class="list-head">
          <h2>${esc(b.list_title)}</h2>
          <p class="count" id="post-count" aria-live="polite">${list.length} ${list.length === 1 ? 'article' : 'articles'}</p>
        </div>

        <div class="post-grid" id="post-grid">${list.map((p) => postCard(p, { excerpt: true, cat: true })).join('')}
        </div>
        <p class="no-results" id="no-results" hidden>${esc(b.no_results)}</p>

        <nav class="pagination" id="pagination" aria-label="Pagination" hidden></nav>
        <p class="footnote">${esc(b.footnote)}</p>
      </div>
    </section>

    <!-- ============ NEWSLETTER ============ -->
    <section class="section bg-cream">
      <div class="container two-col news">
        <div>
          <p class="eyebrow">${esc(b.newsletter.eyebrow)}</p>
          <h2 class="section-title">${br(b.newsletter.title)}</h2>
          <p class="small-text" style="margin-top:20px">${esc(b.newsletter.text)}</p>
        </div>
        <form class="news-form" ${netlifyForm('newsletter', `data-success="Thank you. You are now subscribed."`)}>
          ${formHidden('newsletter', 'New journal subscriber')}
          <label for="news-email">Email address</label>
          <div class="news-row">
            <input type="email" id="news-email" name="email" placeholder="you@example.com" required autocomplete="email">
            <button type="submit" class="btn">${esc(b.newsletter.button_label)}</button>
          </div>
          <p class="form-note">${esc(b.newsletter.note)}</p>
          <p class="form-status" role="status" aria-live="polite"></p>
        </form>
      </div>
    </section>

    <!-- ============ CTA BAND ============ -->
${cta(S.cta)}`;
  return shell({ title: b.seo_title, desc: b.seo_description, active: 'blog.html', border: true, main });
};

const docPage = (d, active) => () => {
  const main = `
${heroStack('cream', d.hero)}
    <section class="section bg-white">
      <div class="container">
        <div class="prose">
          <p class="updated">${esc(d.updated)}</p>
          ${md(d.body, { leadFirst: true })}
        </div>
      </div>
    </section>

${cta(d.cta)}`;
  return shell({ title: d.seo_title, desc: d.seo_description, active, border: true, main });
};
pages['privacy.html'] = docPage(privacy, null);
pages['legal.html'] = docPage(legal, null);

posts.forEach((p, i) => {
  pages[p.file] = () => {
    const rel = posts.length > 1 ? [1, 2, 3].map((k) => posts[(i + k) % posts.length]).filter((x, idx, arr) => x !== p && arr.indexOf(x) === idx) : [];
    const b = blog;
    const main = `
    <!-- ============ POST HEADER ============ -->
    <section class="page-hero bg-cream post-head">
      <div class="container">
        <a href="blog.html" class="back-link">${esc(b.post.back_label)}</a>
        <p class="eyebrow" style="margin-top:28px">${esc(p.category)}</p>
        <h1>${esc(p.title)}</h1>
        <p class="post-byline">${esc(p.dateText)}${p.read ? ' · ' + esc(p.read) : ''} · By Gamaliel Consult</p>
      </div>
    </section>

    <!-- ============ ARTICLE ============ -->
    <article class="post-article">
      <div class="container">
        <img class="post-cover" src="${esc(p.image)}" alt="${esc(p.alt)}">
        <div class="prose prose-post">
          ${md(p.body, { leadFirst: true })}

          <p class="post-note">${esc(b.post.article_note)}</p>
        </div>
      </div>
    </article>
${rel.length ? `
    <!-- ============ RELATED ============ -->
    <section class="section bg-cream">
      <div class="container">
        <p class="eyebrow">${esc(b.post.more_eyebrow)}</p>
        <div class="journal-head">
          <h2 class="section-title">${esc(b.post.more_title)}</h2>
          ${link('blog.html', b.post.more_link_label)}
        </div>
        <div class="post-grid" style="margin-top:40px">${rel.map((r) => postCard(r, { excerpt: true })).join('')}
        </div>
      </div>
    </section>
` : ''}
    <!-- ============ CTA BAND ============ -->
${cta(S.cta)}`;
    return shell({ title: `${p.title} | Gamaliel Consult`, desc: p.excerpt, active: 'blog.html', border: true, main });
  };
});

/* ------------------------------------------------------------------ write */
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const dir of ['css', 'js', 'images', 'admin']) {
  if (fs.existsSync(path.join(ROOT, dir))) fs.cpSync(path.join(ROOT, dir), path.join(OUT, dir), { recursive: true });
}
let count = 0;
for (const [file, render] of Object.entries(pages)) {
  fs.writeFileSync(path.join(OUT, file), render());
  count++;
}
const site = (process.env.URL || '').replace(/\/$/, '');
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nDisallow: /admin/\n${site ? `Sitemap: ${site}/sitemap.xml\n` : ''}`);
if (site) {
  const urls = Object.keys(pages).map((f) => `  <url><loc>${site}/${f === 'index.html' ? '' : f}</loc></url>`).join('\n');
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
}
console.log(`Built ${count} pages (${posts.length} blog posts) into dist/`);
