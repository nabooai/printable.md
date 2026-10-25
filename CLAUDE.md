# printable.md

Paste markdown → typeset, printable page (12 themes). Pure client-side
Next.js 16 / React 19 / Tailwind 4 app, built as a static export.

@AGENTS.md

## Layout

- `app/page.tsx` — shell: sidebar (themes, page size, typography, document, recent), view modes
  (Preview / Source / Split), paste/open/drop handling, undo of whole-document replacements, shortcuts, print.
- `components/print-document.tsx` — markdown rendering (react-markdown + remark-gfm + rehype-highlight).
  `#print-root` stays mounted in every view mode (hidden on screen in Source) so printing always prints it.
- `components/source-editor.tsx` — plain `<textarea>` markdown source editor.
- `lib/history.ts` — recent documents in IndexedDB (device-local, last 30; no-ops when IndexedDB is unavailable).
- `app/globals.css` — all theme CSS, print CSS (`@media print`), typography overrides at the end.
- `hooks/use-local-storage.ts` — settings persistence. The open document is not restored on reload
  (clean start); past documents are one click away in the Recent list.
- `.claude/skills/printable/` — Claude Code skill; `render.py` carries a hand-copied subset of the Minimal theme CSS. Keep it in sync when changing base prose/table/code styles.

## Commands

```bash
pnpm dev          # dev server
pnpm build        # static export into out/ — type errors fail the build
pnpm lint
pnpm exec tsc --noEmit --incremental false   # type check without writing tsbuildinfo
pnpm run deploy   # deploy to production (see below)
```

`typescript` is aliased to TypeScript 6 (`@typescript/typescript6`) because
typescript-eslint can't load TS 7; `tsc` itself is TS 7 via `@typescript/native`.

## Git workflow

Commit directly to `main` and push. No feature branches, no PRs.

## Deploy (Cloudflare Pages)

- Production: https://printable.md (also https://printable-md.pages.dev)
- Cloudflare Pages project `printable-md`, account `0c086f4093829cf5c303752825406df2`
  (Dror@naboo.ai's Account). Direct upload — no Git integration, so pushing does NOT deploy.
- DNS: zone `printable.md` on Cloudflare, proxied CNAME `printable.md → printable-md.pages.dev`.
- Deploy: `pnpm run deploy` (`scripts/deploy.sh`). It requires a clean tree with
  `HEAD == origin/main`, builds `out/`, and runs `wrangler pages deploy` tagged with the commit hash.
  Auth: `wrangler login` (OAuth) or `CLOUDFLARE_API_TOKEN` with Pages:Edit.
- Check: `pnpm exec wrangler pages deployment list --project-name printable-md`
- Rollback: Cloudflare dashboard → Pages → printable-md → Deployments → "Rollback" on an earlier one.
- Not on Vercel/AWS. The old Vercel project (`v0-markdown-to-printable`) is unused.

## Verifying print output

Screen preview is one long sheet; real pagination only shows when printing.
To check print layout, render a PDF with headless Chrome (CDP
`Page.printToPDF` against the dev server or a static server on `out/`) and
look at the pages.
