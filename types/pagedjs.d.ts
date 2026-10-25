// Minimal typings for the parts of Paged.js (pagedjs@0.4.3, untyped) we use.
declare module 'pagedjs' {
  type HookFn = (...args: never[]) => unknown
  interface Hook {
    register(...fns: HookFn[]): void
  }
  export interface ChunkerHooks {
    afterPageLayout: Hook
    afterRendered: Hook
    [name: string]: Hook
  }
  export interface Chunker {
    hooks: ChunkerHooks
    pages: unknown[]
    total: number
    /** The parsed content being paginated (set once flow() starts). */
    source: unknown
    destroy(): void
    stop(): void
  }
  export interface Polisher {
    inserted: HTMLStyleElement[]
    styleEl: HTMLStyleElement
    destroy(): void
  }
  export interface Flow {
    total: number
    performance: number
  }
  export class Previewer {
    constructor(options?: Record<string, unknown>)
    chunker: Chunker
    polisher: Polisher
    preview(
      content: DocumentFragment | Element,
      stylesheets: Array<string | Record<string, string>>,
      renderTo: Element,
    ): Promise<Flow>
  }
}
