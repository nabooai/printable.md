---
name: printable
description: Render a markdown file in any printable.md style (Scientific, Editorial, Magazine, Newspaper, Hipster, Technical, Scholarly, Modernist, Brutalist, Zine, Manuscript, Minimal) and open it in the browser to view or print. Use when the user wants to view, render, preview, print, or "make beautiful/printable" a .md file, or asks for printable.md format.
---

# printable

Renders a given markdown file as a styled HTML page (any printable.md theme) and
opens it in the default browser to read or print (⌘P → Save as PDF / print).

## Choosing a style

If the user didn't name a style, ask which one (default **Minimal**). The 12
styles map 1:1 to `--style` values:

| value | look | value | look |
|---|---|---|---|
| `scientific` | IEEE research paper | `modernist` | Swiss grid, sans-serif |
| `editorial` | magazine essay, drop cap | `brutalist` | hard black, raw |
| `magazine` | glossy display serif | `zine` | photocopy punk |
| `newspaper` | condensed broadsheet | `manuscript` | typewritten, double-spaced |
| `hipster` | mixed type, kraft paper | `minimal` | clean (default) |
| `technical` | spec / API docs | `scholarly` | classical book, small caps |

## Usage

```bash
python3 ~/.claude/skills/printable/render.py "<path/to/file.md>" --style <name>
```

Flags:
- `--style <name>` — one of the values above (default `minimal`)
- `--print` — auto-open the browser's print dialog on load
- `--a4` — A4 page size (default is US Letter)
- `--send [printer]` — print from the terminal, no browser: headless Chrome
  renders the HTML to PDF, then `lp` sends it. Printer name optional — falls
  back to the system default, then the first printer in `lpstat -p`. Needs
  Chrome/Chromium installed.

The script prints the generated HTML path and opens it. Markdown→HTML is done
offline (pandoc, falling back to python-markdown). Theme fonts and syntax colors
load from CDNs and degrade gracefully when offline. Styling lives in
`themes.css` (next to the script), vendored from the printable.md app.

If neither `pandoc` nor python `markdown` is installed, tell the user to
`brew install pandoc` (or `pip install markdown`).
