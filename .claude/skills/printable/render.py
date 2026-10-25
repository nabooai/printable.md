#!/usr/bin/env python3
"""Render a markdown file in printable.md "Minimal" style, then open it to view/print.

Usage:
  render.py <file.md> [--a4] [--print] [--no-open] [--allow-remote-images]
    --a4                   A4 page size (default: US Letter)
    --print                auto-open the browser print dialog on load
    --no-open              write the HTML and print its path, but don't open it
    --allow-remote-images  let http(s) images load (default: blocked, so a
                           rendered doc can't phone home)
  render.py --selftest     run the parser + security self-checks

Fully offline and self-contained: markdown -> HTML via pandoc (GFM, with
pandoc's own syntax highlighting), falling back to python-markdown (no
highlighting). Raw HTML in the markdown is sanitized (only attribute-less
formatting tags like <kbd>/<sub>/<sup>/<details> survive), unsafe link schemes
are neutralized, and a strict Content-Security-Policy blocks scripts, network
requests and remote images. Relative local images are embedded as data: URIs.
Output goes to a fresh private (0600) file in the temp dir.
"""
import sys, os, re, json, html, base64, hashlib, tempfile, subprocess, webbrowser
from urllib.parse import unquote

# CSS lifted from printable.md globals.css: page-paper + base prose + the
# Minimal theme (with the app's typography-knob defaults baked in). Fonts are
# local only (no web-font fetch): Source Serif 4 / JetBrains Mono when installed,
# else Georgia / the system monospace.
CSS = r"""
:root{
  --paper:oklch(1 0 0);--ink:oklch(0.18 0.01 60);--rule:oklch(0.85 0.01 60);
  --primary:oklch(0.42 0.13 35);--secondary:oklch(0.95 0.01 80);
  --border:oklch(0.88 0.01 70);--muted-foreground:oklch(0.5 0.02 60);
  --workbench:oklch(0.93 0.008 80);
  --sans:'Source Serif 4',Georgia,'Times New Roman',serif;
  --mono:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace;
}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;}
body{background:var(--workbench);}
.print-stage{display:flex;flex-direction:column;align-items:center;background:var(--workbench);padding:1.5rem 0;min-height:100vh;}
.page-paper{background:var(--paper);width:8.5in;padding:0.85in 0.95in;position:relative;border:1px solid oklch(0.88 0.005 80);box-shadow:0 1px 2px rgba(0,0,0,.05),0 6px 18px rgba(0,0,0,.06),0 24px 50px rgba(0,0,0,.08);}
.page-paper[data-size='a4']{width:210mm;padding:22mm 24mm;}
.page-paper__inner{font-size:11pt;}

.doc-header{margin-bottom:1.6em;text-align:left;}
.doc-title{color:var(--ink);line-height:1.1;text-wrap:balance;font-family:var(--sans);font-weight:700;letter-spacing:-0.02em;font-size:2.6em;margin:0;}
.doc-header::after{content:'';display:block;height:1px;width:40px;background:var(--ink);margin:1em 0 0;}

.prose-print{color:var(--ink);font-family:var(--sans);font-size:1em;line-height:1.6;text-align:justify;hyphens:auto;-webkit-hyphens:auto;text-rendering:optimizeLegibility;font-feature-settings:'kern','liga','onum';}
.prose-print>*:first-child{margin-top:0;}
.prose-print>*:last-child{margin-bottom:0;}
.prose-print h1,.prose-print h2,.prose-print h3,.prose-print h4{font-family:inherit;font-weight:700;letter-spacing:-0.01em;break-after:avoid;page-break-after:avoid;color:var(--ink);text-align:start;}
.prose-print h5,.prose-print h6{break-after:avoid;page-break-after:avoid;color:var(--ink);text-align:start;font-weight:700;font-size:.95em;line-height:1.35;margin:1em 0 .25em;}
.prose-print h6{font-size:.85em;text-transform:uppercase;letter-spacing:.04em;color:var(--muted-foreground);}
.prose-print h1,.prose-print h2,.prose-print h3,.prose-print h4,.prose-print h5,.prose-print h6,.prose-print a{hyphens:manual;-webkit-hyphens:manual;overflow-wrap:anywhere;}
.prose-print p,.prose-print li,.prose-print h1,.prose-print h2,.prose-print h3,.prose-print h4,.prose-print h5,.prose-print h6,.prose-print td,.prose-print th,.prose-print blockquote,.doc-title{unicode-bidi:plaintext;}
.prose-print h1{font-size:2.4em;margin:1em 0 .4em;}
.prose-print h2{font-size:1.6em;margin:1.4em 0 .4em;}
.prose-print h3{font-size:1.25em;margin:1.1em 0 .3em;}
.prose-print h4{font-size:1.05em;margin:.9em 0 .2em;}
.prose-print p{margin:0 0 .85em;}
.prose-print a{color:var(--primary);text-decoration:underline;text-decoration-thickness:.5px;text-underline-offset:2px;}
.prose-print strong{font-weight:700;}
.prose-print em{font-style:italic;}
.prose-print ul,.prose-print ol{margin:0 0 1em;padding-left:1.6em;}
.prose-print li{margin:.25em 0;}
.prose-print li>p{text-indent:0;margin:0;text-align:start;}
.prose-print .contains-task-list,.prose-print ul.task-list{list-style:none;padding-left:.3em;}
.prose-print .contains-task-list .contains-task-list,.prose-print .task-list .task-list{padding-left:1.6em;}
.prose-print .task-list-item,.prose-print ul.task-list>li{display:block;list-style:none;}
.prose-print input[type='checkbox']{appearance:none;-webkit-appearance:none;display:inline-grid;place-content:center;width:.9em;height:.9em;margin:0 .5em 0 0;vertical-align:-.1em;border:1.2px solid var(--ink);border-radius:2px;background:transparent;}
.prose-print input[type='checkbox']:checked::before{content:'\2713';font-family:system-ui,sans-serif;font-size:.85em;font-weight:700;line-height:1;color:var(--ink);}
.prose-print kbd{font-family:var(--mono);font-size:.82em;padding:.05em .4em;border:1px solid var(--border);border-bottom-width:2px;border-radius:3px;white-space:nowrap;}
.prose-print sub,.prose-print sup{font-size:.75em;line-height:0;}
.footnotes,.footnote{margin-top:2.2em;font-size:.85em;line-height:1.45;}
.prose-print .footnotes>hr,.prose-print .footnote>hr{border:none;border-top:1px solid var(--border);margin:0 0 .5em;padding-top:.6em;text-align:start;}
.prose-print .footnotes>hr::before,.prose-print .footnote>hr::before{content:'Notes';text-transform:uppercase;letter-spacing:.08em;font-size:.85em;font-weight:700;color:var(--muted-foreground);}
.footnotes ol,.footnote ol{margin:0;padding-left:1.4em;}
.footnotes li,.footnotes p,.footnote li,.footnote p{margin:0 0 .3em;text-align:start;}
.prose-print hr{border:none;text-align:center;margin:2em 0;break-after:avoid;}
.prose-print hr::before{content:'\00b7 \00b7 \00b7';letter-spacing:.6em;color:var(--muted-foreground);}
.prose-print code{font-family:var(--mono);font-size:.88em;background:var(--secondary);padding:.1em .35em;border-radius:3px;border:1px solid var(--border);hyphens:manual;-webkit-hyphens:manual;overflow-wrap:anywhere;}
.prose-print pre{font-family:var(--mono);font-size:.85em;line-height:1.55;background:var(--secondary);border:1px solid var(--border);border-radius:6px;padding:.9em 1.1em;margin:1.1em 0;break-inside:avoid;white-space:pre;overflow-x:auto;max-width:100%;}
.prose-print pre code{background:transparent;border:none;padding:0;font-size:inherit;}
.prose-print blockquote{margin:1em 0;padding:.4em 1em;border-left:3px solid var(--primary);color:var(--muted-foreground);break-inside:avoid;}
.prose-print blockquote p{margin:0;}
.prose-print table{width:100%;border-collapse:collapse;margin:1.2em 0;font-size:.92em;}
.prose-print thead{display:table-header-group;}
.prose-print tr{break-inside:avoid;}
.prose-print th,.prose-print td{text-align:start;padding:.45em .7em;border-bottom:1px solid var(--border);overflow-wrap:break-word;}
.prose-print th{font-weight:700;border-bottom:2px solid var(--ink);}
.prose-print img{max-width:100%;height:auto;display:inline;vertical-align:middle;break-inside:avoid;}
.prose-print p>img:only-child,.prose-print>img,.prose-print figure img{display:block;margin:1.2em auto;}

.hljs-comment,.hljs-quote{color:oklch(0.55 0.02 60);font-style:italic;}
.hljs-keyword,.hljs-selector-tag,.hljs-built_in,.hljs-name,.hljs-tag{color:oklch(0.4 0.15 280);}
.hljs-string,.hljs-attr,.hljs-template-variable,.hljs-addition{color:oklch(0.45 0.13 145);}
.hljs-number,.hljs-literal,.hljs-symbol{color:oklch(0.5 0.15 35);}
.hljs-title,.hljs-section,.hljs-attribute{color:oklch(0.4 0.15 250);font-weight:600;}
.hljs-variable,.hljs-link{color:oklch(0.45 0.15 35);}

@media print{
  @page{__PAGERULE__}
  html,body{background:white !important;}
  .print-stage{background:white !important;padding:0 !important;min-height:0 !important;}
  .page-paper{width:100% !important;padding:0 !important;margin:0 !important;box-shadow:none !important;border:none !important;background:white !important;}
  .prose-print a{color:var(--ink);}
  .prose-print pre,.prose-print pre code{white-space:pre-wrap !important;overflow-wrap:anywhere !important;overflow:visible !important;max-height:none !important;}
  .prose-print pre{break-inside:auto !important;}
  .footnote-back,.footnote-backref,[data-footnote-backref]{display:none;}
}
"""

# pandoc's syntax-highlighting token classes (skylighting), colored with the
# Minimal theme's highlight.js palette from globals.css.
HIGHLIGHT_CSS = r"""
pre>code.sourceCode{white-space:pre;}
code.sourceCode>span{color:inherit;text-decoration:inherit;}
div.sourceCode{margin:1.1em 0;}
div.sourceCode>pre{margin:0;}
code span.co,code span.do,code span.an,code span.cv,code span.in,code span.wa{color:oklch(0.55 0.02 60);font-style:italic;}
code span.kw,code span.cf,code span.im,code span.bu,code span.ot,code span.pp,code span.ex{color:oklch(0.4 0.15 280);}
code span.st,code span.ch,code span.vs,code span.ss,code span.sc,code span.at{color:oklch(0.45 0.13 145);}
code span.dv,code span.bn,code span.fl,code span.cn{color:oklch(0.5 0.15 35);}
code span.fu,code span.dt{color:oklch(0.4 0.15 250);font-weight:600;}
code span.va{color:oklch(0.45 0.15 35);}
code span.al,code span.er{color:oklch(0.5 0.2 25);font-weight:700;}
@media print{pre>code.sourceCode{white-space:pre-wrap;}}
"""

TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="__CSP__">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__DOCTITLE__</title>
<style>__CSS__</style>
</head>
<body>
<div class="print-stage">
  <article class="page-paper" data-size="__SIZE__">
    <div class="page-paper__inner">
__HEADER__
      <div class="prose-print">
__BODY__
      </div>
    </div>
  </article>
</div>
__SCRIPT__
</body>
</html>
"""

AUTOPRINT_JS = "setTimeout(function(){window.print()},500);"

# ---------------------------------------------------------------------------
# Raw-HTML sanitizer. Markdown may embed raw HTML; a hostile README could use it
# to run script or exfiltrate the document. Everything that is not an
# attribute-less tag from this allowlist is removed (text between tags is kept,
# with any stray '<' / '>' escaped). Shared by the pandoc and fallback paths.
# ---------------------------------------------------------------------------
ALLOWED_TAGS = frozenset("""
    kbd sub sup b i u s em strong small mark del ins abbr cite q dfn var samp
    code pre tt br wbr hr p div span blockquote center details summary
    ul ol li dl dt dd h1 h2 h3 h4 h5 h6
    table caption thead tbody tfoot tr th td
""".split())
VOID_TAGS = frozenset(("br", "wbr", "hr"))
# Elements whose whole content is dropped, not just the tags.
_DROP_WITH_CONTENT = re.compile(
    r"<(script|style|textarea|title|xmp|iframe|noembed|noframes|noscript|"
    r"template|plaintext|object|embed|svg|math|select)\b[^>]*>.*?</\1\s*>",
    re.I | re.S)
_TOKEN = re.compile(r"(<!--.*?(?:-->|\Z)|<[!?][^>]*>?|</?[A-Za-z][^>]*>?)", re.S)
_TAGNAME = re.compile(r"<(/?)([A-Za-z][A-Za-z0-9]*)")


def sanitize_html(s):
    s = _DROP_WITH_CONTENT.sub("", s)
    out = []
    for i, tok in enumerate(_TOKEN.split(s)):
        if i % 2 == 0:                       # text between tags
            out.append(tok.replace("<", "&lt;").replace(">", "&gt;"))
            continue
        m = _TAGNAME.match(tok)
        if not m:                            # comment, doctype, PI
            continue
        slash, name = m.group(1), m.group(2).lower()
        if name in ALLOWED_TAGS and not (slash and name in VOID_TAGS):
            out.append("<%s%s>" % (slash, name))
    return "".join(out)


# ---------------------------------------------------------------------------
# URL neutralization on the generated HTML (both converters emit double-quoted
# attributes; raw HTML has no attributes left after sanitize_html).
# ---------------------------------------------------------------------------
SAFE_HREF_SCHEMES = ("http", "https", "mailto", "tel")
_SCHEME = re.compile(r"^([A-Za-z][A-Za-z0-9+.\-]*):")
_URL_ATTR = re.compile(r'(\s(href|src)=)"([^"]*)"')
_IMG_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
              ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
              ".avif": "image/avif"}
_MAX_IMG = 15 * 1024 * 1024


def _url_scheme(value):
    u = html.unescape(value)
    u = re.sub(r"[\x00-\x20\x7f]", "", u)    # browsers ignore these in schemes
    m = _SCHEME.match(u)
    return (m.group(1).lower() if m else None), u


def embed_local_image(url, base_dir):
    """Relative image path under the markdown file's directory -> data: URI."""
    if not base_dir:
        return None
    rel = unquote(url.split("#", 1)[0].split("?", 1)[0])
    if not rel or rel.startswith("/"):
        return None
    root = os.path.realpath(base_dir)
    p = os.path.realpath(os.path.join(root, rel))
    mime = _IMG_TYPES.get(os.path.splitext(p)[1].lower())
    if (not mime or not p.startswith(root + os.sep) or not os.path.isfile(p)
            or os.path.getsize(p) > _MAX_IMG):
        return None
    with open(p, "rb") as f:
        return "data:%s;base64,%s" % (mime, base64.b64encode(f.read()).decode())


def neutralize_urls(fragment, base_dir=None):
    def fix(m):
        prefix, attr, value = m.group(1), m.group(2), m.group(3)
        scheme, url = _url_scheme(value)
        if attr == "href":
            if scheme is None or scheme in SAFE_HREF_SCHEMES:
                return m.group(0)
            return prefix + '"#"'
        # src (images)
        if scheme in ("http", "https"):
            return m.group(0)                # CSP decides (blocked by default)
        if scheme == "data" and url[5:].lower().startswith("image/"):
            return m.group(0)
        if scheme is None:
            data = embed_local_image(url, base_dir)
            if data:
                return prefix + '"%s"' % data
        return prefix + '""'
    return _URL_ATTR.sub(fix, fragment)


# ---------------------------------------------------------------------------
# Markdown -> HTML
# ---------------------------------------------------------------------------
def _sanitize_ast(node):
    """Sanitize every RawBlock/RawInline in a pandoc JSON AST, in place.
    (Note: `-f gfm-raw_html` does NOT stop pandoc's commonmark reader from
    passing raw HTML through, so this walk is what actually protects us.)"""
    if isinstance(node, dict):
        if node.get("t") in ("RawBlock", "RawInline"):
            fmt, text = node["c"]
            node["c"] = ["html", sanitize_html(text) if fmt in ("html", "html5") else ""]
            return
        for v in node.values():
            _sanitize_ast(v)
    elif isinstance(node, list):
        for v in node:
            _sanitize_ast(v)


# pandoc's empty per-line anchors in highlighted code (<a href="#cb1-1" ...></a>).
_LINE_ANCHOR = re.compile(r'<a href="#cb\d+-\d+" aria-hidden="true" tabindex="-1"></a>')


def to_html_pandoc(md):
    ast = json.loads(subprocess.run(
        ["pandoc", "-f", "gfm", "-t", "json"],
        input=md, capture_output=True, text=True, check=True).stdout)
    _sanitize_ast(ast)
    out = subprocess.run(
        ["pandoc", "-f", "json", "-t", "html", "--wrap=none"],
        input=json.dumps(ast), capture_output=True, text=True, check=True).stdout
    return _LINE_ANCHOR.sub("", out)


def to_html_markdown(md):
    import markdown  # ponytail: stdlib has no md parser; this is the installed fallback
    from markdown.postprocessors import RawHtmlPostprocessor

    class SanitizingRawHtml(RawHtmlPostprocessor):
        # Every raw-HTML chunk python-markdown stashed (inline tags, HTML blocks)
        # passes through here on its way back into the output.
        def stash_to_string(self, text):
            return sanitize_html(str(text))

    # Not "extra": its attr_list lets markdown set arbitrary attributes
    # ({: onclick=...}) and md_in_html re-enables raw HTML parsing.
    md_ = markdown.Markdown(extensions=["abbr", "def_list", "fenced_code",
                                        "footnotes", "tables", "sane_lists"])
    md_.postprocessors.register(SanitizingRawHtml(md_), "raw_html", 30)
    return md_.convert(md)


def to_html(md, base_dir=None, force_fallback=None):
    """Markdown -> sanitized HTML fragment. pandoc (best GFM fidelity), else
    python-markdown."""
    if force_fallback is None:
        force_fallback = os.environ.get("PRINTABLE_FORCE_FALLBACK") == "1"
    frag = None
    if not force_fallback:
        try:
            frag = to_html_pandoc(md)
        except (FileNotFoundError, subprocess.CalledProcessError):
            pass
    if frag is None:
        frag = to_html_markdown(md)
    return neutralize_urls(frag, base_dir)


def csp_for(script, remote_images=False):
    script_src = ("'sha256-%s'" % base64.b64encode(
        hashlib.sha256(script.encode()).digest()).decode()) if script else "'none'"
    img = "data:" + (" https: http:" if remote_images else "")
    return ("default-src 'none'; script-src %s; style-src 'unsafe-inline'; "
            "img-src %s; base-uri 'none'; form-action 'none'" % (script_src, img))


def extract_title(md):
    """Pull a leading '# Title' out so it renders as the styled header block,
    matching printable.md. Returns (title|None, body)."""
    t = md.lstrip("﻿").lstrip()
    m = re.search(r"^#\s+(.+?)\s*$", t, re.M)
    if not m or t.index(m.group(0)) != 0:
        return None, md
    return m.group(1).strip(), t[m.end():].lstrip("\n")


def build_page(md, name, a4=False, autoprint=False, remote_images=False,
               base_dir=None, force_fallback=None):
    title, body = extract_title(md)
    header = ""
    if title:
        header = '      <header class="doc-header"><h1 class="doc-title">{}</h1></header>'.format(
            html.escape(title))
    pagerule = "size:A4;margin:22mm 24mm;" if a4 else "size:letter;margin:0.85in 0.95in;"
    script = AUTOPRINT_JS if autoprint else ""
    # Fill __BODY__ last so document text can't inject template placeholders.
    return (TEMPLATE
            .replace("__CSP__", csp_for(script, remote_images))
            .replace("__CSS__", CSS.replace("__PAGERULE__", pagerule) + HIGHLIGHT_CSS)
            .replace("__SIZE__", "a4" if a4 else "letter")
            .replace("__DOCTITLE__", html.escape(title or name))
            .replace("__SCRIPT__", "<script>%s</script>" % script if script else "")
            .replace("__HEADER__", header)
            .replace("__BODY__", to_html(body, base_dir, force_fallback)))


def write_private(page, src_path):
    """Write to a fresh, unpredictable, 0600 file in the temp dir."""
    stem = os.path.splitext(os.path.basename(src_path))[0]
    prefix = (re.sub(r"[^A-Za-z0-9._-]", "_", stem)[:60] or "doc") + "-"
    fd, out = tempfile.mkstemp(suffix=".printable.html", prefix=prefix)
    with os.fdopen(fd, "w", encoding="utf-8") as f:   # mkstemp: O_EXCL, mode 0600
        f.write(page)
    return out


EVIL_MD = """# Title <script>t()</script>

hi <kbd>Ctrl</kbd> H<sub>2</sub>O x<sup>2</sup> <b onclick="x()">bold</b>

<script>alert('blk')</script>

inline <script>alert('inl')</script> and <img src=x onerror="alert('img')">

<iframe src="file:///etc/passwd"></iframe>

<meta http-equiv="refresh" content="0;url=https://evil.example/">

<div align="center"><a href="javascript:alert('raw')">raw</a></div>

<details><summary>More</summary>

hidden **md**

</details>

[e2](&#106;avascript:alert(1)) [e3](javascript&colon;alert(1)) [js](javascript:alert('md')) [jsws]( JaVaScRiPt:alert(1)) [ent](jav&#x09;ascript:alert(1))
[data](data:text/html,<script>alert(1)</script>) [file](file:///etc/passwd)
[ok](https://example.com/a) [mail](mailto:a@b.c) [frag](#title)
<javascript:alert('auto')>

![remote](https://evil.example/pixel.png) ![local](file:///etc/hosts)

```python
def f(x):
    return "<script>"  # c
```

<!-- <script>alert('comment')</script> -->
<scr<script>ipt>alert('nest')</script>
<style>body{display:none}</style>
"""


def _check_fragment(frag, label):
    low = frag.lower()
    # (an autolink's visible text may still read "javascript:..."; its href may not)
    bad = ["<script", "onerror", "onclick", "<iframe", "<meta", '="javascript',
           "<style", '="data:text', '="file:', "alert('blk')", "alert('comment')"]
    for b in bad:
        assert b not in low, "%s: %r survived:\n%s" % (label, b, frag)
    assert "<kbd>Ctrl</kbd>" in frag and "<sub>2</sub>" in frag and "<sup>2</sup>" in frag, label
    assert "<details>" in frag and "<summary>More</summary>" in frag, label
    assert 'href="https://example.com/a"' in frag and 'href="mailto:a@b.c"' in frag, label
    assert 'href="#title"' in frag, label
    assert "&lt;script&gt;" in frag, label            # code block content kept, escaped


def selftest():
    assert extract_title("# Hi\n\nbody")[0] == "Hi"
    assert extract_title("# Hi\n\nbody")[1].strip() == "body"
    assert extract_title("no title\n# later")[0] is None      # H1 not at top
    assert extract_title("﻿  # BOM\n\nx")[0] == "BOM"    # BOM + whitespace

    assert sanitize_html('<img src=x onerror=alert(1)>') == ""
    assert sanitize_html('<kbd class="x">k</kbd>') == "<kbd>k</kbd>"
    assert sanitize_html('<a href="javascript:x">t</a>') == "t"
    assert "<" not in sanitize_html("<scr<script>ipt>x").replace("&lt;", "")
    assert sanitize_html('<img alt="a>b" onerror=y>') == 'b" onerror=y&gt;'

    ran = []
    try:
        subprocess.run(["pandoc", "--version"], capture_output=True, check=True)
        _check_fragment(to_html(EVIL_MD, force_fallback=False), "pandoc")
        assert 'class="sourceCode' in to_html(EVIL_MD, force_fallback=False)
        ran.append("pandoc")
    except FileNotFoundError:
        print("selftest: pandoc not installed, skipped pandoc path")
    try:
        import markdown  # noqa: F401
        _check_fragment(to_html(EVIL_MD, force_fallback=True), "python-markdown")
        assert "<h1>h {: onclick=x }</h1>" in to_html("# h {: onclick=x }\n", force_fallback=True)
        ran.append("python-markdown")
    except ImportError:
        print("selftest: python-markdown not installed, skipped fallback path")
    assert ran, "neither pandoc nor python-markdown is available"

    page = build_page(EVIL_MD, "evil.md", force_fallback=(ran[0] != "pandoc"))
    csp = re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"', page)
    assert csp and page.index(csp.group(0)) < page.index("<title>"), "CSP missing/late"
    for d in ("default-src 'none'", "script-src 'none'", "img-src data:;",
              "base-uri 'none'", "form-action 'none'"):
        assert d in csp.group(1), d
    assert "<script" not in page and "https://" not in page.split("<body>")[0]
    assert "googleapis" not in page and "jsdelivr" not in page
    p2 = build_page("x", "x.md", autoprint=True, force_fallback=(ran[0] != "pandoc"))
    h = base64.b64encode(hashlib.sha256(AUTOPRINT_JS.encode()).digest()).decode()
    assert "script-src 'sha256-%s'" % h in p2 and "<script>%s</script>" % AUTOPRINT_JS in p2

    out = write_private("x", "My Doc?.md")
    try:
        assert os.stat(out).st_mode & 0o777 == 0o600
        assert os.path.basename(out).startswith("My_Doc_-")
    finally:
        os.unlink(out)
    print("selftest ok (%s)" % ", ".join(ran))


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__); return 0
    if argv[0] == "--selftest":
        selftest(); return 0

    path = argv[0]
    with open(path, encoding="utf-8") as f:
        md = f.read()
    page = build_page(md, os.path.basename(path),
                      a4="--a4" in argv, autoprint="--print" in argv,
                      remote_images="--allow-remote-images" in argv,
                      base_dir=os.path.dirname(os.path.abspath(path)))
    out = write_private(page, path)
    print(out)

    if "--no-open" in argv:
        return 0
    if sys.platform == "darwin":
        subprocess.run(["open", out])
    elif sys.platform.startswith("linux"):
        subprocess.run(["xdg-open", out])
    else:
        webbrowser.open("file://" + out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
