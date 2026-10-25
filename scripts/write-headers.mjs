// Post-build: write out/_headers (Cloudflare Pages response headers) with a
// Content-Security-Policy that allows exactly the inline scripts Next.js
// emitted into the static HTML (by sha256), plus our own scripts from 'self'.
//
// A static export can't use next.config headers(), and the inline
// `self.__next_f.push(...)` / bootstrap scripts change every build, so the
// hashes have to be computed here, after `next build`. Runs as part of
// `pnpm build`, so every deploy ships headers that match its HTML.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = new URL('../out/', import.meta.url).pathname

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return e.name === '_next' ? [] : htmlFiles(p)
    return e.name.endsWith('.html') ? [p] : []
  })
}

const hashes = new Set()
for (const file of htmlFiles(OUT)) {
  const html = readFileSync(file, 'utf8')
  for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(attrs)) continue
    hashes.add(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`)
  }
}
if (hashes.size === 0) throw new Error('write-headers: no inline scripts found in out/*.html — build layout changed?')

const csp = [
  "default-src 'self'",
  // Cloudflare Web Analytics (injected by Pages on the production domain).
  `script-src 'self' ${[...hashes].sort().join(' ')} https://static.cloudflareinsights.com`,
  // React style={{...}} props and next/font need inline styles.
  "style-src 'self' 'unsafe-inline'",
  // https: so documents can show remote images (the app gates them behind a
  // click; CSP itself can't express "only after a click").
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self' https://cloudflareinsights.com",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const headers = {
  'Content-Security-Policy': csp,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=(), display-capture=(), browsing-topics=()',
}

const lines = ['/*', ...Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`)]
// Cloudflare Pages rejects _headers lines longer than 2,000 characters.
const long = lines.find((l) => l.length > 2000)
if (long) throw new Error(`write-headers: header line too long for Cloudflare Pages (${long.length} chars)`)

writeFileSync(join(OUT, '_headers'), lines.join('\n') + '\n')
console.log(`write-headers: out/_headers written (${hashes.size} inline script hashes)`)
