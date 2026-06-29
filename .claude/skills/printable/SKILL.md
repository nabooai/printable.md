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

The script prints the generated HTML path and opens it. Markdown→HTML is done
offline (pandoc, falling back to python-markdown). Syntax highlighting loads
from a CDN and degrades to plain code blocks when offline.

If neither `pandoc` nor python `markdown` is installed, tell the user to
`brew install pandoc` (or `pip install markdown`).
