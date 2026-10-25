---
name: printable
description: Render a markdown file in printable.md "Minimal" style and open it in the browser to view or print. Use when the user wants to view, render, preview, print, or "make beautiful/printable" a .md file, or asks for printable.md / minimal format.
---

# printable

Renders a given markdown file as a styled HTML page (printable.md **Minimal**
theme) and opens it in the default browser so the user can read it or print it
(⌘P → Save as PDF / print).

## Usage

Resolve the markdown file path from the user's request, then run:

```bash
python3 ~/.claude/skills/printable/render.py "<path/to/file.md>"
```

Flags:
- `--print` — auto-open the browser's print dialog on load
- `--a4` — A4 page size (default is US Letter)
- `--no-open` — only write the file and print its path (don't open a browser)
- `--allow-remote-images` — let `http(s)` images load; by default they are
  blocked so rendering a confidential doc makes no network requests

The script prints the generated HTML path and opens it. The output is fully
offline and self-contained: markdown→HTML via pandoc (with pandoc's own syntax
highlighting), falling back to python-markdown (no highlighting); local fonts
only; relative local images are embedded. It is written to a fresh private
(0600) file in the temp dir.

Untrusted markdown is safe to render: raw HTML is sanitized (only
attribute-less formatting tags such as `<kbd>`, `<sub>`, `<sup>`,
`<details>`, tables survive; scripts, event handlers, iframes, `<meta>`,
`<img>` tags etc. are removed), `javascript:`/`data:`/`file:` links are
neutralized, and a strict Content-Security-Policy blocks scripts (except the
hashed `--print` snippet) and all network loads. `--selftest` checks this for
both converters.

If neither `pandoc` nor python `markdown` is installed, tell the user to
`brew install pandoc` (or `pip install markdown`).
