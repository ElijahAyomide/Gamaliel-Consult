'use strict';
/*
  Shared helpers used by the site builder (build.js), the admin function and the admin screen.
  Works both in Node and in the browser.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GC = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const slugify = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const fmtDate = (iso) => {
    const m = /(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? `${parseInt(m[3], 10)} ${MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}` : '';
  };
  const safeUrl = (u) => (/^\s*(javascript|data|vbscript):/i.test(u) ? '#' : u);

  /* ---------------------------------------------------- tiny markdown */
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

  /* ----------------------------------------- blog post front matter */
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
    const m = String(text).replace(/\r\n?/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!m) throw new Error(`${file || 'post'}: missing the --- front matter block`);
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
  function serializePost(d, body) {
    const q = (s) => JSON.stringify(String(s == null ? '' : s));
    return [
      '---',
      `title: ${q(d.title)}`,
      `date: ${(/\d{4}-\d{2}-\d{2}/.exec(String(d.date)) || [''])[0]}`,
      `category: ${q(d.category)}`,
      `topic: ${q(d.topic)}`,
      `read_time: ${q(d.read_time)}`,
      `excerpt: ${q(d.excerpt)}`,
      `image: ${q(d.image)}`,
      `image_alt: ${q(d.image_alt)}`,
      `featured: ${d.featured ? 'true' : 'false'}`,
      `draft: ${d.draft ? 'true' : 'false'}`,
      '---',
      '',
      String(body || '').replace(/\r\n?/g, '\n').trim(),
      '',
    ].join('\n');
  }

  return { esc, slugify, fmtDate, safeUrl, inl, md, scalar, parseFront, serializePost };
});
