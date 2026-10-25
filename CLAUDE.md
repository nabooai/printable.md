# printable.md

Paste markdown → typeset, printable page (12 themes). Pure client-side
Next.js 16 / React 19 / Tailwind 4 app, built as a static export.

@AGENTS.md

## Layout

- `app/page.tsx` — shell: sidebar (themes, page size, typography, header & footer, document, recent), view modes
  (Preview / Source / Split / Pages, Cmd/Ctrl+E cycles in that order), paste/open/drop handling, undo of
  whole-document replacements, shortcuts, print.
- `components/print-document.tsx` — markdown rendering (react-markdown + remark-gfm + rehype-highlight).
  `#print-root` stays mounted in every view mode (hidden on screen in Source) so printing always prints it.
- `components/source-editor.tsx` — plain `<textarea>` markdown source editor.
- `lib/history.ts` — recent documents in IndexedDB (device-local, last 30; no-ops when IndexedDB is unavailable).
- `app/globals.css` — all theme CSS, print CSS (`@media print`), typography overrides at the end.
- `hooks/use-local-storage.ts` — settings persistence. The open document is not restored on reload
  (clean start); past documents are one click away in the Recent list.
- `scripts/write-headers.mjs` — runs after `next build` (part of `pnpm build`): writes `out/_headers`
  (Cloudflare Pages response headers) with a CSP that allows Next's inline scripts by sha256 hash,
  plus Referrer-Policy, nosniff, COOP, Permissions-Policy. Check locally with
  `pnpm exec wrangler pages dev out --port <port>` (it applies `_headers`).
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

## Print engine

Two print paths; which one `window.print()` uses is decided by `html[data-pp-print]`.

**Native (Preview / Source / Split):** `#print-root` is one long sheet and Chrome fragments it.
`lib/print-settings.ts` `buildPageRule()` → `<style id="pp-page-size-style">` (via `usePrintStyles` in
`components/page-furniture.tsx`): `@page { size; margin: 0.5in 0.25in }` is a fixed edge band, the user's
margin is padding on `.page-paper` repeated per page with `box-decoration-break: clone` (so the dialog's
Margins choice can't change layout), and page numbers / header / footer are `@page` margin boxes
(Chrome 131+). Chrome has no `string-set`, so the header is a literal. The dashed `~p.N` lines on the
sheet are estimates from content height (`PageFurnitureOverlay`) and are labelled approximate.

**Pages view (`components/pages-view.tsx`, `lib/paged/`):** real pages via Paged.js (`pagedjs` 0.4.3,
pinned; lazy-loaded with `import()` only when the view opens — its own ~96 KB gzip chunk).
- A deep clone of `#print-root .print-stage` (never the React DOM; ids prefixed `pg-`) is wrapped in
  `.pp-scope` and paginated into an invisible, unscaled staging host; finished pages move into the
  live host, which is scaled with `transform` (never `zoom`: zoom re-lays out text) to fit the column.
- CSS given to Paged.js is built from the loaded stylesheets through the CSSOM
  (`lib/paged/content-css.ts`): style rules + `@media print` rules flattened in place (the print
  cascade), every selector prefixed `.pp-scope `, layers/screen-only rules skipped, rules matching
  nothing dropped. Passed inline (no `fetch()`), so the CSP (`connect-src 'self'`) is untouched.
  Paged.js re-inserts it globally, which is why it must be scoped.
- `buildPagedPageRule()` makes the `@page` CSS: true page margins (= native band + padding), margin
  boxes for numbers/header/footer, `@page :first` skip, and the "Current section (H2)" header via
  `string-set` (title seeds it, each `.prose-print > h2` replaces it). Margin-box text is pinned to the
  outer 0.5in band in `globals.css` to match native print.
- When the pagination is current, `html[data-pp-print="pages"]`: `#print-root` is hidden in print,
  Paged.js's styles are enabled for print (`@page { margin: 0 }`, one page box per sheet) and
  `#pp-page-size-style` is disabled (`media="not all"`). While re-paginating (any DOM mutation in
  `#print-root` or a furniture/page setting change, debounced 300 ms), or if pagination fails or
  exceeds `MAX_PAGES` (400), printing falls back to the native path. The Print button and Cmd/Ctrl+P
  in Pages view wait for the pagination first.
- Tables: `lib/paged/paginate.ts` measures each table once and pins its column widths (`<colgroup>`
  + `table-layout: fixed`), because Paged.js lays out each page's fragment as its own table, and
  re-inserts `<thead>` on continuation pages (Paged.js 0.4 drops it; native print repeats it).
- Paged.js is aliased to its prebuilt `dist/paged.esm.js` in `next.config.mjs` (its source entry's
  CommonJS deps break under Turbopack). Its breaks differ from Chrome's native ones (no
  orphans/widows), so Pages and Preview's dashed guides can disagree, but Pages == print by
  construction.

## Verifying print output

Render a PDF with headless Chrome (CDP `Page.printToPDF` with `preferCSSPageSize: true`) against a
static server on `out/` and look at the pages. For the Pages view, switch to it first and wait for
`.pages-view[data-pages]` (no `data-busy`); then the PDF has exactly the pages shown. Restart
`wrangler pages dev` after each build: it caches `_headers`, and stale CSP hashes block the new
build's inline scripts.
