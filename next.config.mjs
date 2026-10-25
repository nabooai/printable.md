/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pure client-side app: build a static site into out/ for Cloudflare Pages.
  output: 'export',
  turbopack: {
    resolveAlias: {
      // Paged.js's package entry is its ES source, whose CommonJS deps
      // (event-emitter → d → es5-ext) require paths like
      // "es5-ext/string/#/contains" that Turbopack mis-resolves. Its prebuilt
      // ESM bundle has those deps inlined (no polyfills, no eval). The
      // package's "exports" map hides dist/, hence the file path.
      pagedjs: './node_modules/pagedjs/dist/paged.esm.js',
    },
  },
}

export default nextConfig
