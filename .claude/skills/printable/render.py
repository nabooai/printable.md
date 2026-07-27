#!/usr/bin/env python3
"""Render a markdown file in any printable.md style, then open it to view/print.

Usage:
  render.py <file.md> [--style NAME] [--a4] [--print] [--send [PRINTER]]
    --style NAME  one of: scientific editorial magazine newspaper hipster
                  technical scholarly modernist brutalist zine manuscript
                  minimal   (default: minimal)
    --a4          A4 page size (default: US Letter)
    --print       auto-open the browser print dialog on load
    --send [PRINTER]  print from the terminal: headless Chrome -> PDF -> lp.
                  PRINTER optional; falls back to the system default, then the
                  first printer lpstat lists. Skips opening the browser.
    --selftest    run the leading-title parser self-check

Markdown -> HTML is done offline (pandoc, falling back to python-markdown).
Styling is the vendored printable.md theme CSS (themes.css, next to this file);
theme fonts + syntax highlighting load from CDNs and degrade gracefully offline.
"""
import sys, os, re, html, shutil, tempfile, subprocess, webbrowser

THEMES = ["scientific", "editorial", "magazine", "newspaper", "hipster",
          "technical", "scholarly", "modernist", "brutalist", "zine",
          "manuscript", "minimal"]

HERE = os.path.dirname(os.path.abspath(__file__))

# All theme fonts the styles reference (next/font equivalents), one request.
FONTS = ("https://fonts.googleapis.com/css2"
         "?family=Instrument+Serif:ital@0;1"
         "&family=Source+Serif+4:ital,wght@0,400;0,600;0,700;1,400"
         "&family=JetBrains+Mono:wght@400;700"
         "&family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700"
         "&family=Bebas+Neue"
         "&family=Inter:wght@400;600;700;800"
         "&family=Fraunces:ital,wght@0,400;0,600;0,700;1,400"
         "&family=Space+Grotesk:wght@400;500;700"
         "&family=Archivo+Black"
         "&display=swap")

TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__DOCTITLE__</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="__FONTS__" rel="stylesheet">
<style>__CSS__</style>
</head>
<body>
<div class="print-stage">
  <article class="page-paper page-paper--__STYLE__" data-size="__SIZE__" data-theme="__STYLE__">
    <div class="page-paper__inner">
__HEADER__
      <div class="prose-print prose-print--__STYLE__">
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
        import markdown  # ponytail: stdlib has no md parser; installed fallback
        return markdown.markdown(md, extensions=["extra", "sane_lists"])


def selftest():
    assert extract_title("# Hi\n\nbody")[0] == "Hi"
    assert extract_title("# Hi\n\nbody")[1].strip() == "body"
    assert extract_title("no title\n# later")[0] is None      # H1 not at top
    assert extract_title("﻿  # BOM\n\nx")[0] == "BOM"    # BOM + whitespace
    print("selftest ok")


def send_to_printer(html_path, printer):
    """html -> PDF (headless Chrome) -> lp. Returns lp's exit code."""
    chrome = next((c for c in [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        shutil.which("google-chrome"), shutil.which("chromium")]
        if c and os.path.exists(c)), None)
    if not chrome:
        print("--send needs Chrome/Chromium for the HTML->PDF step"); return 1
    pdf = os.path.splitext(html_path)[0] + ".pdf"
    subprocess.run([chrome, "--headless", "--disable-gpu", "--no-pdf-header-footer",
                    "--print-to-pdf=" + pdf, "file://" + html_path],
                   capture_output=True, check=True)
    if not printer:  # lp default, else first printer lpstat knows
        r = subprocess.run(["lp", pdf], capture_output=True, text=True)
        if r.returncode == 0:
            print(r.stdout.strip()); return 0
        found = re.search(r"^printer (\S+)", subprocess.run(
            ["lpstat", "-p"], capture_output=True, text=True).stdout, re.M)
        if not found:
            print("no default printer and none found by lpstat -p"); return 1
        printer = found.group(1)
    r = subprocess.run(["lp", "-d", printer, pdf], capture_output=True, text=True)
    print(r.stdout.strip() or r.stderr.strip())
    return r.returncode


def get_opt(argv, name):
    """--name VALUE or --name=VALUE -> value, else None."""
    for i, a in enumerate(argv):
        if a == name and i + 1 < len(argv):
            return argv[i + 1]
        if a.startswith(name + "="):
            return a.split("=", 1)[1]
    return None


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__); return 0
    if argv[0] == "--selftest":
        selftest(); return 0

    path = argv[0]
    style = (get_opt(argv, "--style") or "minimal").lower()
    if style not in THEMES:
        print("Unknown style {!r}. Choose one of:\n  {}".format(style, " ".join(THEMES)))
        return 2
    a4 = "--a4" in argv
    autoprint = "--print" in argv
    send = any(a == "--send" or a.startswith("--send=") for a in argv)
    printer = get_opt(argv, "--send")
    if printer and printer.startswith("-"):  # bare --send followed by another flag
        printer = None

    with open(path, encoding="utf-8") as f:
        md = f.read()

    title, body = extract_title(md)
    header = ""
    if title:
        header = ('      <header class="doc-header doc-header--{}">'
                  '<h1 class="doc-title">{}</h1></header>').format(style, html.escape(title))
    doctitle = html.escape(title or os.path.basename(path))

    with open(os.path.join(HERE, "themes.css"), encoding="utf-8") as f:
        css = f.read()
    if a4:  # the vendored @page hardcodes letter; honor --a4 for print too
        css += "\n@media print{@page{size:A4;margin:22mm 24mm;}}\n"

    out_html = (TEMPLATE
                .replace("__CSS__", css)
                .replace("__FONTS__", FONTS)
                .replace("__STYLE__", style)
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

    if send:
        return send_to_printer(out, printer)

    if sys.platform == "darwin":
        subprocess.run(["open", out])
    elif sys.platform.startswith("linux"):
        subprocess.run(["xdg-open", out])
    else:
        webbrowser.open("file://" + out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
