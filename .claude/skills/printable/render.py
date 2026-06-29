#!/usr/bin/env python3
"""Render a markdown file in printable.md "Minimal" style, then open it to view/print.

Usage:
  render.py <file.md> [--a4] [--print]
    --a4      A4 page size (default: US Letter)
    --print   auto-open the browser print dialog on load
    --selftest  run the leading-title parser self-check

Markdown -> HTML is done offline (pandoc, falling back to python-markdown).
Syntax colors are added client-side by highlight.js from a CDN (degrades to
plain code blocks when offline). Styling is the printable.md "Minimal" theme.
"""
import sys, os, re, html, base64, tempfile, subprocess, webbrowser

# CSS lifted from printable.md globals.css: page-paper + base prose + the
# Minimal theme (with the app's typography-knob defaults baked in) + the
# highlight.js token palette. Fonts mirror the live site: Source Serif 4 body,
# JetBrains Mono code (the app's @theme maps --font-sans onto the serif chain,
# so "Minimal" actually renders serif — matched here on purpose).
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
.prose-print h1,.prose-print h2,.prose-print h3,.prose-print h4{font-family:inherit;font-weight:700;letter-spacing:-0.01em;break-after:avoid;page-break-after:avoid;color:var(--ink);text-align:left;}
.prose-print h5,.prose-print h6{break-after:avoid;page-break-after:avoid;color:var(--ink);text-align:left;font-size:.95em;}
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
.prose-print li>p{text-indent:0;margin:0;text-align:left;}
.prose-print hr{border:none;text-align:center;margin:2em 0;break-after:avoid;}
.prose-print hr::before{content:'\00b7 \00b7 \00b7';letter-spacing:.6em;color:var(--muted-foreground);}
.prose-print code{font-family:var(--mono);font-size:.88em;background:var(--secondary);padding:.1em .35em;border-radius:3px;border:1px solid var(--border);}
.prose-print pre{font-family:var(--mono);font-size:.85em;line-height:1.55;background:var(--secondary);border:1px solid var(--border);border-radius:6px;padding:.9em 1.1em;margin:1.1em 0;break-inside:avoid;white-space:pre;overflow-x:auto;max-width:100%;}
.prose-print pre code{background:transparent;border:none;padding:0;font-size:inherit;}
.prose-print blockquote{margin:1em 0;padding:.4em 1em;border-left:3px solid var(--primary);color:var(--muted-foreground);break-inside:avoid;}
.prose-print blockquote p{margin:0;}
.prose-print table{width:100%;border-collapse:collapse;margin:1.2em 0;font-size:.92em;break-inside:avoid;}
.prose-print th,.prose-print td{text-align:left;padding:.45em .7em;border-bottom:1px solid var(--border);}
.prose-print th{font-weight:700;border-bottom:2px solid var(--ink);}
.prose-print img{max-width:100%;height:auto;display:block;margin:1.2em auto;break-inside:avoid;}

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
}
"""

TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__DOCTITLE__</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,700;1,8..60,400;1,8..60,700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
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
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/highlight.min.js"></script>
<script>
if (window.hljs) document.querySelectorAll('pre code').forEach(function(el){try{hljs.highlightElement(el)}catch(e){}});
__AUTOPRINT__
</script>
</body>
</html>
"""


def extract_title(md):
    """Pull a leading '# Title' out so it renders as the styled header block,
    matching printable.md. Returns (title|None, body)."""
    t = md.lstrip("﻿").lstrip()
    m = re.search(r"^#\s+(.+?)\s*$", t, re.M)
    if not m or t.index(m.group(0)) != 0:
        return None, md
    return m.group(1).strip(), t[m.end():].lstrip("\n")


def to_html(md):
    """Markdown -> HTML fragment. pandoc (best GFM fidelity), else python-markdown."""
    try:
        return subprocess.run(
            ["pandoc", "-f", "gfm", "-t", "html", "--wrap=none", "--no-highlight"],
            input=md, capture_output=True, text=True, check=True).stdout
    except (FileNotFoundError, subprocess.CalledProcessError):
        import markdown  # ponytail: stdlib has no md parser; this is the installed fallback
        return markdown.markdown(md, extensions=["extra", "sane_lists"])


def selftest():
    assert extract_title("# Hi\n\nbody")[0] == "Hi"
    assert extract_title("# Hi\n\nbody")[1].strip() == "body"
    assert extract_title("no title\n# later")[0] is None      # H1 not at top
    assert extract_title("﻿  # BOM\n\nx")[0] == "BOM"    # BOM + whitespace
    print("selftest ok")


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__); return 0
    if argv[0] == "--selftest":
        selftest(); return 0

    path = argv[0]
    a4 = "--a4" in argv
    autoprint = "--print" in argv
    with open(path, encoding="utf-8") as f:
        md = f.read()

    title, body = extract_title(md)
    header = ""
    if title:
        header = '      <header class="doc-header"><h1 class="doc-title">{}</h1></header>'.format(
            html.escape(title))
    doctitle = html.escape(title or os.path.basename(path))
    pagerule = "size:A4;margin:22mm 24mm;" if a4 else "size:letter;margin:0.85in 0.95in;"

    out_html = (TEMPLATE
                .replace("__CSS__", CSS.replace("__PAGERULE__", pagerule))
                .replace("__SIZE__", "a4" if a4 else "letter")
                .replace("__DOCTITLE__", doctitle)
                .replace("__HEADER__", header)
                .replace("__BODY__", to_html(body))
                .replace("__AUTOPRINT__",
                         "setTimeout(function(){window.print()},500);" if autoprint else ""))

    out = os.path.join(tempfile.gettempdir(),
                       os.path.splitext(os.path.basename(path))[0] + ".printable.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(out_html)
    print(out)

    if sys.platform == "darwin":
        subprocess.run(["open", out])
    elif sys.platform.startswith("linux"):
        subprocess.run(["xdg-open", out])
    else:
        webbrowser.open("file://" + out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
