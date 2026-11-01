// The pilot's guide (docs/pilots-guide.md) as the page the Windows release ships, guide/index.html:
// one HTML file that opens in the browser as the simulator does, offline, its pictures beside it. The
// Markdown stays the one source. This turns the part of Markdown the guide uses into HTML — a title
// block, headings, paragraphs, lists, a quotation, tables, pictures with captions, code — and refuses
// what it does not know rather than pass it through. No dependency: node tests it. GPLv3.

export const GUIDE_SOURCE = 'docs/pilots-guide.md';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Code spans as they are; outside them, bold, italic and links.
function inline(text) {
  return text.split(/(`[^`]*`)/).map((part, k) => (k % 2
    ? `<code>${esc(part.slice(1, -1))}</code>`
    : esc(part)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\s][^*]*)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>'))).join('');
}

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// The pictures the guide shows, by name: docs/guide/<name>, guide/<name> in the release.
export function guideImages(markdown) {
  return [...markdown.matchAll(/!\[[^\]]*\]\(guide\/([^)\s]+)\)/g)].map((m) => m[1]);
}

function frontMatter(markdown) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(markdown.replace(/\r\n/g, '\n'));
  const meta = {};
  if (m) for (const line of m[1].split('\n')) {
    const kv = /^(\w+):\s*"?(.*?)"?\s*$/.exec(line);
    if (kv) meta[kv[1]] = kv[2];
  }
  return { meta, body: m ? markdown.replace(/\r\n/g, '\n').slice(m[0].length) : markdown.replace(/\r\n/g, '\n') };
}

function table(lines) {
  const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const [head, rule, ...rows] = lines;
  if (!rule || !/^\|?\s*:?-+/.test(rule.trim())) throw new Error(`the guide's table under "${head}" has no rule line`);
  return `<table>\n<thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>\n<tbody>\n${
    rows.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('\n')}\n</tbody>\n</table>`;
}

// The guide's body as HTML blocks, and its sections for the contents.
function blocks(body) {
  const out = [], sections = [], lines = body.split('\n');
  let k = 0;
  const take = (test) => {
    const got = [];
    while (k < lines.length && test(lines[k])) got.push(lines[k++]);
    return got;
  };
  while (k < lines.length) {
    const line = lines[k];
    if (!line.trim()) { ++k; continue; }
    const h = /^(#{1,3}) (.+)$/.exec(line);
    if (h) {
      ++k;
      const level = h[1].length + 1, id = slug(h[2]);
      if (level === 2) sections.push({ id, title: h[2] });
      out.push(`<h${level} id="${id}">${inline(h[2])}</h${level}>`);
    } else if (line.startsWith('    ')) {
      out.push(`<pre><code>${esc(take((l) => l.startsWith('    ')).map((l) => l.slice(4)).join('\n'))}</code></pre>`);
    } else if (line.startsWith('>')) {
      out.push(`<blockquote><p>${inline(take((l) => l.startsWith('>')).map((l) => l.replace(/^>\s?/, '')).join(' '))}</p></blockquote>`);
    } else if (line.startsWith('|')) {
      out.push(table(take((l) => l.startsWith('|'))));
    } else if (/^- /.test(line)) {
      const items = [];
      for (const l of take((x) => /^- /.test(x) || /^ {2}\S/.test(x))) {
        if (l.startsWith('- ')) items.push(l.slice(2));
        else items[items.length - 1] += ` ${l.trim()}`;
      }
      out.push(`<ul>\n${items.map((i) => `<li>${inline(i)}</li>`).join('\n')}\n</ul>`);
    } else {
      const text = take((l) => l.trim() && !/^(#{1,3} |- |\||>| {4})/.test(l)).join(' ');
      const figure = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(text);
      if (figure) {
        out.push(`<figure><img src="${esc(figure[2].replace(/^guide\//, ''))}" alt="${esc(figure[1])}"><figcaption>${inline(figure[1])}</figcaption></figure>`);
      } else if (text.includes('![')) {
        throw new Error(`the guide has a picture inside a paragraph: "${text.slice(0, 60)}"`);
      } else {
        out.push(`<p>${inline(text)}</p>`);
      }
    }
  }
  return { html: out.join('\n'), sections };
}

const STYLE = `
  body { margin: 0; background: #fbfaf7; color: #1d2126; font: 17px/1.55 Georgia, "Times New Roman", serif; counter-reset: s; }
  main { max-width: 46rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
  h1, h2, h3, nav, figcaption, table, .disclaimer, .meta { font-family: "Segoe UI", Arial, sans-serif; }
  h1 { font-size: 2.1rem; line-height: 1.2; margin: 0 0 .4rem; }
  .meta { color: #5a6270; margin: 0 0 1.2rem; }
  .disclaimer { border-left: 4px solid #b54a1c; background: #f3e7df; padding: .6rem .9rem; font-weight: 600; }
  nav ol { columns: 2; padding-left: 1.3rem; }
  h2 { font-size: 1.45rem; margin: 2.4rem 0 .6rem; border-bottom: 1px solid #d8d4cc; padding-bottom: .2rem;
    counter-increment: s; counter-reset: ss; }
  h2::before { content: counter(s) "\\00a0\\00a0"; color: #7a8290; }
  h3 { font-size: 1.15rem; margin: 1.6rem 0 .4rem; counter-increment: ss; }
  h3::before { content: counter(s) "." counter(ss) "\\00a0\\00a0"; color: #7a8290; }
  code, pre { font-family: Consolas, "Cascadia Mono", monospace; font-size: .86em; }
  pre { background: #eeece6; padding: .6rem .8rem; overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: .9rem; margin: .8rem 0 1.2rem; }
  th, td { text-align: left; vertical-align: top; padding: .3rem .5rem; border-bottom: 1px solid #ddd8cf; }
  th { border-bottom: 2px solid #9aa0aa; }
  figure { margin: 1.4rem 0; }
  figure img { display: block; width: 100%; height: auto; border: 1px solid #c9c4ba; }
  figcaption { font-size: .88rem; color: #4a5160; margin-top: .4rem; }
  blockquote { margin: 1rem 0; padding: .1rem 1rem; border-left: 3px solid #c9c4ba; color: #3a404a; }
  @media print { body { background: #fff; font-size: 11pt; } figure { break-inside: avoid; } }
`;

// The whole page. disclaimer: the release's own words, first under the title.
export function guideHtml(markdown, { disclaimer = '', version = '' } = {}) {
  const { meta, body } = frontMatter(markdown);
  const { html, sections } = blocks(body);
  const title = meta.title || 'A pilot\'s guide';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>${inline(title)}</h1>
<p class="meta">${inline([meta.subtitle, version ? `release ${version}` : meta.date].filter(Boolean).join(' · '))}</p>
${disclaimer ? `<p class="disclaimer">${esc(disclaimer)}</p>\n` : ''}<nav><ol>
${sections.map((s) => `<li><a href="#${s.id}">${inline(s.title)}</a></li>`).join('\n')}
</ol></nav>
${html}
</main>
</body>
</html>
`;
}
