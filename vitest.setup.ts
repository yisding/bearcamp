// Test-only polyfills for jsdom-based suites.
//
// jsdom doesn't implement `matchMedia` (sonner reads it during mount to pick
// system theme) or `ResizeObserver` (Radix's positioning hooks read it during
// mount). We polyfill both here so production components stay free of test
// infrastructure. Guarded so node-environment suites (no `window`) stay
// untouched.
if (typeof window !== "undefined") {
  if (typeof window.matchMedia !== "function") {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  }
  if (typeof window.ResizeObserver === "undefined") {
    window.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof window.ResizeObserver
  }
}
