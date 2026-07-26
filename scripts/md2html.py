#!/usr/bin/env python3
"""Render an integration spec to a self-contained, shareable HTML document.

    python scripts/md2html.py                 # build the combined spec
    python scripts/md2html.py tax-system      # build one, by md2docx MANIFEST key

Writes a single .html file with all CSS and JS inlined — no external requests,
so it works offline, as an email attachment, or published as an Artifact.

Reuses the same Markdown subset as md2docx.py: headings, paragraphs, tables,
fenced code, blockquotes, bullet / numbered / checkbox lists, rules, and inline
bold, italic, code and links.
"""
import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
from md2docx import MANIFEST, load_markdown  # noqa: E402  — reuse the manifest

OUT_DIR = ROOT / 'build'

CSS = """
:root{
  --paper:#F5F8F7; --surface:#FFFFFF; --ink:#0E1817; --muted:#5D6C69;
  --accent:#0F625C; --accent-soft:#E4EFEC; --seal:#7B2E34;
  --rule:#D9E3E0; --code-bg:#EFF4F3; --code-ink:#1C2A28;
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Times New Roman",serif;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;
  --measure:68ch;
}
@media (prefers-color-scheme:dark){
  :root{
    --paper:#0B1211; --surface:#101A19; --ink:#DFE8E6; --muted:#8C9D9A;
    --accent:#5CB3A9; --accent-soft:#15302C; --seal:#C9838A;
    --rule:#1F2D2B; --code-bg:#0E1817; --code-ink:#C9D6D3;
  }
}
:root[data-theme="dark"]{
  --paper:#0B1211; --surface:#101A19; --ink:#DFE8E6; --muted:#8C9D9A;
  --accent:#5CB3A9; --accent-soft:#15302C; --seal:#C9838A;
  --rule:#1F2D2B; --code-bg:#0E1817; --code-ink:#C9D6D3;
}
:root[data-theme="light"]{
  --paper:#F5F8F7; --surface:#FFFFFF; --ink:#0E1817; --muted:#5D6C69;
  --accent:#0F625C; --accent-soft:#E4EFEC; --seal:#7B2E34;
  --rule:#D9E3E0; --code-bg:#EFF4F3; --code-ink:#1C2A28;
}

*{box-sizing:border-box}
body{
  margin:0; background:var(--paper); color:var(--ink);
  font-family:var(--serif); font-size:17px; line-height:1.62;
  -webkit-font-smoothing:antialiased;
}

/* ── shell ─────────────────────────────────────────────────────────────── */
.shell{display:grid; grid-template-columns:264px minmax(0,1fr); gap:0; align-items:start}
.rail{
  position:sticky; top:0; height:100vh; overflow-y:auto; padding:2rem 1.25rem 3rem;
  border-right:1px solid var(--rule); background:var(--surface);
  font-family:var(--sans); font-size:13px;
}
.main{padding:3.5rem 3rem 8rem; min-width:0}
.wrap{max-width:var(--measure); margin:0 auto}

/* ── rail nav ──────────────────────────────────────────────────────────── */
.rail .brand{
  font-family:var(--sans); font-weight:700; font-size:15px; letter-spacing:.14em;
  text-transform:uppercase; color:var(--accent); margin:0 0 .25rem;
}
.rail .brand-sub{color:var(--muted); font-size:12px; margin:0 0 1.75rem; line-height:1.45}
.rail nav ul{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:1px}
.rail .part{
  font-family:var(--sans); font-size:11px; font-weight:700; letter-spacing:.11em;
  text-transform:uppercase; color:var(--muted);
  margin:1.4rem 0 .4rem; padding-bottom:.35rem; border-bottom:1px solid var(--rule);
}
.rail .part:first-of-type{margin-top:0}
.rail a{
  display:flex; gap:.5rem; text-decoration:none; color:var(--ink);
  padding:.3rem .5rem; border-radius:3px; border-left:2px solid transparent;
}
.rail a .n{color:var(--muted); font-variant-numeric:tabular-nums; flex:none; min-width:2.6em}
.rail a:hover{background:var(--accent-soft)}
.rail a.active{border-left-color:var(--accent); background:var(--accent-soft); color:var(--accent); font-weight:600}
.rail a.active .n{color:var(--accent)}
.rail a:focus-visible,.masthead a:focus-visible,.main a:focus-visible{
  outline:2px solid var(--accent); outline-offset:2px
}

/* ── masthead ──────────────────────────────────────────────────────────── */
.masthead{border-bottom:2px solid var(--ink); padding-bottom:1.75rem; margin-bottom:2.5rem}
.masthead .eyebrow{
  font-family:var(--sans); font-size:11px; font-weight:700; letter-spacing:.16em;
  text-transform:uppercase; color:var(--accent); margin:0 0 .9rem;
}
.masthead h1{
  font-size:2.5rem; line-height:1.14; margin:0 0 .6rem; font-weight:600;
  letter-spacing:-.015em; text-wrap:balance;
}
.masthead .standfirst{font-size:1.14rem; color:var(--muted); margin:0; text-wrap:balance}

/* front-matter table reads as an instrument's particulars, not a data grid */
.frontmatter{margin:2rem 0 0; border-top:1px solid var(--rule)}
.frontmatter dl{
  display:grid; grid-template-columns:minmax(9rem,auto) 1fr; gap:0;
  margin:0; font-family:var(--sans); font-size:13.5px;
}
.frontmatter dt{
  padding:.6rem 1rem .6rem 0; color:var(--muted); border-bottom:1px solid var(--rule);
  letter-spacing:.02em;
}
.frontmatter dd{margin:0; padding:.6rem 0; border-bottom:1px solid var(--rule)}

/* ── headings, with the section number set in the margin ───────────────── */
h2,h3,h4{font-weight:600; letter-spacing:-.01em; text-wrap:balance; scroll-margin-top:2rem}
h2{font-size:1.62rem; line-height:1.22; margin:3.6rem 0 1rem; position:relative}
h3{font-size:1.2rem; margin:2.4rem 0 .7rem}
h4{font-size:1.02rem; margin:1.9rem 0 .5rem}
h2 .num,h3 .num{
  font-family:var(--sans); font-size:11.5px; font-weight:700; letter-spacing:.09em;
  color:var(--accent); display:block; margin-bottom:.35rem;
}
@media (min-width:1180px){
  h2 .num{position:absolute; left:-7.5rem; top:.55rem; width:6.5rem; text-align:right; margin:0}
}
.parthead{
  margin:5rem 0 2.5rem; padding-top:2.5rem; border-top:2px solid var(--ink);
}
.parthead:first-child{margin-top:0; padding-top:0; border-top:0}
.parthead .label{
  font-family:var(--sans); font-size:11px; font-weight:700; letter-spacing:.18em;
  text-transform:uppercase; color:var(--accent); display:block; margin-bottom:.5rem;
}
.parthead h2{font-size:2rem; margin:0; position:static}

p{margin:0 0 1.05rem}
a{color:var(--accent); text-decoration-thickness:1px; text-underline-offset:2px}
strong{font-weight:700}
hr{border:0; border-top:1px solid var(--rule); margin:2.6rem 0}

ul,ol{margin:0 0 1.15rem; padding-left:1.35rem}
li{margin:0 0 .42rem}
li::marker{color:var(--muted)}
ul.checks{list-style:none; padding-left:0}
ul.checks li{display:flex; gap:.65rem; align-items:baseline}
ul.checks li::before{
  content:"☐"; color:var(--accent); font-size:1.05em; flex:none; line-height:1
}

/* ── notes ─────────────────────────────────────────────────────────────── */
blockquote{
  margin:1.6rem 0; padding:.9rem 1.25rem; border-left:3px solid var(--accent);
  background:var(--accent-soft); border-radius:0 3px 3px 0;
  font-size:15.5px; line-height:1.55;
}
blockquote p:last-child{margin-bottom:0}
blockquote.risk{border-left-color:var(--seal); background:color-mix(in srgb,var(--seal) 8%,transparent)}
blockquote.risk strong{color:var(--seal)}

/* ── tables ────────────────────────────────────────────────────────────── */
.tablewrap{overflow-x:auto; margin:1.5rem 0; border:1px solid var(--rule); border-radius:4px}
table{border-collapse:collapse; width:100%; font-family:var(--sans); font-size:13.5px}
thead th{
  background:var(--accent); color:#fff; text-align:left; font-weight:600;
  padding:.62rem .85rem; letter-spacing:.02em; white-space:nowrap;
}
td{padding:.58rem .85rem; border-top:1px solid var(--rule); vertical-align:top;
   font-variant-numeric:tabular-nums; line-height:1.5}
tbody tr:nth-child(even){background:color-mix(in srgb,var(--accent) 4%,transparent)}
td:first-child{white-space:nowrap}
td code{white-space:nowrap}

/* ── code ──────────────────────────────────────────────────────────────── */
code{
  font-family:var(--mono); font-size:.86em; background:var(--code-bg);
  padding:.12em .35em; border-radius:3px; color:var(--code-ink);
}
pre{
  margin:1.5rem 0; padding:1rem 1.15rem; background:var(--code-bg);
  border:1px solid var(--rule); border-radius:4px; overflow-x:auto;
}
pre code{background:none; padding:0; font-size:13px; line-height:1.62; display:block}
.tok-c{color:var(--muted); font-style:italic}
.tok-k{color:var(--accent); font-weight:600}
.tok-s{color:var(--seal)}
:root[data-theme="dark"] .tok-s,
@media (prefers-color-scheme:dark){.tok-s{color:#D9959B}}

/* ── utility ───────────────────────────────────────────────────────────── */
.toolbar{
  position:fixed; right:1.25rem; bottom:1.25rem; display:flex; gap:.5rem; z-index:20;
}
.toolbar button{
  font-family:var(--sans); font-size:12.5px; padding:.5rem .85rem; cursor:pointer;
  background:var(--surface); color:var(--ink); border:1px solid var(--rule);
  border-radius:4px; box-shadow:0 1px 3px rgba(0,0,0,.08);
}
.toolbar button:hover{border-color:var(--accent); color:var(--accent)}
.railtoggle{display:none}

@media (max-width:1020px){
  .shell{grid-template-columns:1fr}
  .rail{position:static; height:auto; border-right:0; border-bottom:1px solid var(--rule)}
  .rail nav{display:none}
  .rail nav.open{display:block}
  .railtoggle{
    display:block; width:100%; text-align:left; font-family:var(--sans); font-size:13px;
    background:none; border:1px solid var(--rule); border-radius:4px; padding:.55rem .75rem;
    color:var(--ink); cursor:pointer;
  }
  .main{padding:2rem 1.35rem 5rem}
  .masthead h1{font-size:1.95rem}
}

@media (prefers-reduced-motion:reduce){*{animation:none!important; transition:none!important}}

@media print{
  :root{--paper:#fff; --surface:#fff; --ink:#000; --muted:#444; --rule:#bbb;
        --accent:#0F625C; --accent-soft:#f2f6f5; --code-bg:#f6f6f6}
  .rail,.toolbar{display:none}
  .shell{display:block}
  .main{padding:0}
  .wrap{max-width:none}
  body{font-size:10.5pt}
  h2,h3,h4{break-after:avoid}
  pre,blockquote,.tablewrap{break-inside:avoid}
  thead th{background:#0F625C!important; -webkit-print-color-adjust:exact; print-color-adjust:exact}
  a{color:#000; text-decoration:none}
}
"""

JS = """
(function(){
  var links=[].slice.call(document.querySelectorAll('.rail a[href^="#"]'));
  var map={}; links.forEach(function(a){map[a.getAttribute('href').slice(1)]=a});
  var targets=Object.keys(map).map(function(id){return document.getElementById(id)})
                              .filter(Boolean);
  function sync(){
    var best=null, top=120;
    targets.forEach(function(el){
      var r=el.getBoundingClientRect();
      if(r.top<=top) best=el;
    });
    links.forEach(function(a){a.classList.remove('active')});
    if(best&&map[best.id]) map[best.id].classList.add('active');
  }
  var tick=false;
  addEventListener('scroll',function(){
    if(tick) return; tick=true;
    requestAnimationFrame(function(){sync(); tick=false});
  },{passive:true});
  sync();

  var tgl=document.querySelector('.railtoggle');
  if(tgl) tgl.addEventListener('click',function(){
    var nav=document.querySelector('.rail nav');
    nav.classList.toggle('open');
    tgl.setAttribute('aria-expanded', nav.classList.contains('open'));
  });
  var pr=document.getElementById('printbtn');
  if(pr) pr.addEventListener('click',function(){window.print()});
})();
"""


# ── inline markdown ──────────────────────────────────────────────────────────
def inline(t):
    t = t.replace('\\|', '|')
    out, pos = [], 0
    pat = re.compile(r'(\*\*.+?\*\*)|(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(\*[^*\n]+\*)')
    for m in pat.finditer(t):
        if m.start() > pos:
            out.append(html.escape(t[pos:m.start()]))
        tok = m.group(0)
        if tok.startswith('**'):
            out.append('<strong>' + html.escape(tok[2:-2]) + '</strong>')
        elif tok.startswith('`'):
            out.append('<code>' + html.escape(tok[1:-1]) + '</code>')
        elif tok.startswith('['):
            label = tok[1:tok.index(']')]
            href = tok[tok.index('(') + 1:-1]
            if href.startswith('http'):
                out.append(f'<a href="{html.escape(href)}" rel="noopener">'
                           f'{html.escape(label)}</a>')
            else:                       # internal doc refs have no web target
                out.append('<em>' + html.escape(label) + '</em>')
        else:
            out.append('<em>' + html.escape(tok[1:-1]) + '</em>')
        pos = m.end()
    out.append(html.escape(t[pos:]))
    return ''.join(out)


def highlight(code):
    """Conservative JSON/HTTP tinting — comments, keys, string values."""
    esc = html.escape(code)
    esc = re.sub(r'(//[^\n]*)', r'<span class="tok-c">\1</span>', esc)
    esc = re.sub(r'(&quot;[\w\-.]+&quot;)(\s*:)', r'<span class="tok-k">\1</span>\2', esc)
    return esc


def slug(text):
    s = re.sub(r'`|\*', '', text)
    s = re.sub(r'[^\w\s.-]', '', s).strip().lower()
    return re.sub(r'[\s_]+', '-', s)


SECNUM = re.compile(r'^([A-G]\.\d+(?:\.\d+)*)\s+(.*)$')


def convert(md, title, standfirst):
    lines = md.split('\n')
    body, toc = [], []
    i, n = 0, len(lines)
    front = []
    seen_h1 = False
    in_front = False

    while i < n:
        line = lines[i]

        if line.startswith('```'):
            i += 1
            buf = []
            while i < n and not lines[i].startswith('```'):
                buf.append(lines[i]); i += 1
            i += 1
            body.append('<pre><code>' + highlight('\n'.join(buf)) + '</code></pre>')
            continue

        if line.startswith('|') and i + 1 < n and re.match(r'^\|[\s:|-]+\|?$', lines[i + 1].strip()):
            rows = []
            while i < n and lines[i].startswith('|'):
                cells = re.split(r'(?<!\\)\|', lines[i].strip())
                if cells and not cells[0].strip():
                    cells = cells[1:]
                if cells and not cells[-1].strip():
                    cells = cells[:-1]
                rows.append([c.strip() for c in cells])
                i += 1
            head, data = rows[0], rows[2:]
            # the leading metadata table becomes the front matter list
            if not in_front and all(not h for h in head) and len(head) == 2:
                front = data
                in_front = True
                continue
            th = ''.join(f'<th>{inline(c)}</th>' for c in head)
            trs = ''.join('<tr>' + ''.join(
                f'<td>{inline(r[k] if k < len(r) else "")}</td>'
                for k in range(len(head))) + '</tr>' for r in data)
            body.append(f'<div class="tablewrap"><table><thead><tr>{th}</tr></thead>'
                        f'<tbody>{trs}</tbody></table></div>')
            continue

        s = line.strip()

        if s in ('---', '***', '___'):
            body.append('<hr>')
            i += 1
            continue

        m = re.match(r'^(#{1,6})\s+(.*)$', s)
        if m:
            lvl, text = len(m.group(1)), m.group(2)
            if lvl == 1 and not seen_h1:
                seen_h1 = True
                i += 1
                continue
            if lvl == 1:                                   # a PART divider
                label = text.replace('PART ', 'Part ')
                pid = slug(text)
                # "Annex A — title" splits into eyebrow + title; a divider with
                # no em dash is all title, and gets no eyebrow.
                if '—' in label:
                    lbl, ttl = (s.strip() for s in label.split('—', 1))
                    eyebrow = f'<span class="label">{html.escape(lbl)}</span>'
                else:
                    lbl, ttl, eyebrow = '', label.strip(), ''
                body.append(f'<section class="parthead" id="{pid}">'
                            f'{eyebrow}<h2>{inline(ttl)}</h2></section>')
                toc.append(('part', lbl or ttl, ttl, pid))
                i += 1
                continue
            sm = SECNUM.match(re.sub(r'^#+\s*', '', text))
            hid = slug(text)
            if sm and lvl == 2:
                body.append(f'<h2 id="{hid}"><span class="num">§{html.escape(sm.group(1))}'
                            f'</span>{inline(sm.group(2))}</h2>')
                toc.append(('sec', sm.group(1), sm.group(2), hid))
            elif sm:
                body.append(f'<h{lvl} id="{hid}"><span class="num">§{html.escape(sm.group(1))}'
                            f'</span>{inline(sm.group(2))}</h{lvl}>')
            else:
                body.append(f'<h{min(lvl,4)} id="{hid}">{inline(text)}</h{min(lvl,4)}>')
                if lvl == 2:
                    toc.append(('sec', '', text, hid))
            i += 1
            continue

        if s.startswith('>'):
            buf = []
            while i < n and lines[i].strip().startswith('>'):
                buf.append(re.sub(r'^\s*>\s?', '', lines[i])); i += 1
            txt = ' '.join(x.strip() for x in buf if x.strip())
            cls = ' class="risk"' if re.search(
                r'highest-risk|heavier privacy load|not a formality|legal determination', txt) else ''
            body.append(f'<blockquote{cls}><p>{inline(txt)}</p></blockquote>')
            continue

        if re.match(r'^-\s+\[[ xX]\]\s+', s):
            items = []
            while i < n:
                mm = re.match(r'^-\s+\[[ xX]\]\s+(.*)$', lines[i].strip())
                if not mm:
                    break
                txt = mm.group(1); i += 1
                while i < n and lines[i].startswith('      ') and lines[i].strip():
                    txt += ' ' + lines[i].strip(); i += 1
                items.append(f'<li>{inline(txt)}</li>')
            body.append('<ul class="checks">' + ''.join(items) + '</ul>')
            continue

        if re.match(r'^[-*]\s+', s) or re.match(r'^\d+\.\s+', s):
            ordered = bool(re.match(r'^\d+\.\s+', s))
            items = []
            while i < n:
                cur = lines[i]
                mm = re.match(r'^\s*(?:[-*]|\d+\.)\s+(.*)$', cur)
                if not cur.strip() or not mm:
                    break
                indent = len(cur) - len(cur.lstrip())
                txt = mm.group(1); i += 1
                while (i < n and lines[i].strip()
                       and not re.match(r'^\s*(?:[-*]|\d+\.)\s', lines[i])
                       and not lines[i].startswith(('|', '```'))
                       and (len(lines[i]) - len(lines[i].lstrip())) > indent):
                    txt += ' ' + lines[i].strip(); i += 1
                items.append(f'<li>{inline(txt)}</li>')
            tag = 'ol' if ordered else 'ul'
            body.append(f'<{tag}>' + ''.join(items) + f'</{tag}>')
            continue

        if not s:
            i += 1
            continue

        buf = [s]
        i += 1
        while i < n and lines[i].strip() and not re.match(
                r'^\s*(#{1,6}\s|[-*]\s|\d+\.\s|>|\||```|---$)', lines[i]):
            buf.append(lines[i].strip()); i += 1
        body.append(f'<p>{inline(" ".join(buf))}</p>')

    # ── nav ──
    nav = []
    for kind, num, text, hid in toc:
        if kind == 'part':
            nav.append(f'<li class="part">{html.escape(num)}</li>')
        else:
            label = re.sub(r'\s*—\s*`.*`$', '', text)
            nav.append(f'<li><a href="#{hid}"><span class="n">'
                       f'{html.escape("§" + num if num else "")}</span>'
                       f'<span>{html.escape(label)}</span></a></li>')

    fm = ''.join(f'<dt>{inline(r[0])}</dt><dd>{inline(r[1] if len(r) > 1 else "")}</dd>'
                 for r in front)

    return f"""<title>{html.escape(title)}</title>
<style>{CSS}</style>
<div class="shell">
  <aside class="rail">
    <p class="brand">BIZDATA</p>
    <p class="brand-sub">Revenue Data Interface Requirements</p>
    <button class="railtoggle" aria-expanded="false">Contents</button>
    <nav aria-label="Document contents"><ul>{''.join(nav)}</ul></nav>
  </aside>
  <main class="main">
    <div class="wrap">
      <header class="masthead">
        <p class="eyebrow">Interface requirements · Draft for review</p>
        <h1>{html.escape(title)}</h1>
        <p class="standfirst">{html.escape(standfirst)}</p>
        <div class="frontmatter"><dl>{fm}</dl></div>
      </header>
      {''.join(body)}
    </div>
  </main>
</div>
<div class="toolbar"><button id="printbtn">Print / Save as PDF</button></div>
<script>{JS}</script>
"""


def build(key='combined'):
    spec = MANIFEST[key]
    md = load_markdown(spec)
    title = spec.get('title') or re.search(r'^# (.+)$', md, flags=re.M).group(1)
    standfirst = spec['tagline']
    OUT_DIR.mkdir(exist_ok=True)
    out = OUT_DIR / (Path(spec['out']).stem + '.html')
    out.write_text(convert(md, title, standfirst), encoding='utf-8')
    print(f'{key:>16}  ->  {out.relative_to(ROOT)}  ({out.stat().st_size // 1024} KB)')
    return out


if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else 'combined')
