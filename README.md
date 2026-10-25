# printable.md

Paste markdown, get a beautifully typeset page you can print or save as PDF.

Paste anywhere on the page (Cmd/Ctrl+V) or type straight into the document.
GitHub-flavoured markdown is supported (tables, task lists, strikethrough),
with syntax-highlighted code blocks. Pick a page size (US Letter or A4), tune
the typography (font scale, line height, spacing, margins, justification,
hyphenation), then hit Print. Settings are remembered in `localStorage`.

## Themes

Scientific, Editorial, Magazine, Newspaper, Hipster, Technical, Scholarly,
Modernist, Brutalist, Zine, Manuscript and Minimal.

## Development

Requires Node 22+ and pnpm.

```bash
pnpm install
pnpm dev     # http://localhost:3000
pnpm build   # production build (type errors fail the build)
pnpm lint    # ESLint (eslint-config-next)
```

Code lives in `app/` (page, layout, theme CSS in `globals.css`),
`components/print-document.tsx`, `hooks/` and `lib/`.

## Claude Code skill

`.claude/skills/printable/` is a [Claude Code](https://claude.com/claude-code)
skill that renders a local `.md` file in the Minimal style as a standalone
HTML page and opens it in the browser for viewing or printing. See its
`SKILL.md` for usage.

---

Originally bootstrapped with [v0](https://v0.app).
