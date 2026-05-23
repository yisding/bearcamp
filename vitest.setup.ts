// Test-only polyfills for jsdom-based suites.
//
// jsdom doesn't implement `matchMedia` (sonner reads it during mount to pick
// system theme) or `ResizeObserver` (Radix's positioning hooks read it during
// mount). We polyfill both here so production components stay free of test
// infrastructure. Guarded so node-environment suites (no `window`) stay
// untouched.


// WS-6: @testing-library/user-event v14's `setup()` unconditionally calls
// `attachClipboardStubToView`, which overrides any test-installed
// `navigator.clipboard` with its own stub via `Object.defineProperty`. The
// T6.5 ShareLink tests install a `writeText` spy via `Object.defineProperty`
// and expect calls to surface there.
//
// We wrap `Object.defineProperty` so that a defineProperty call targeting
// `navigator` + `'clipboard'` from anywhere INSIDE
// `@testing-library/user-event` is a no-op when an existing
// `navigator.clipboard` value descriptor (i.e. a test-installed mock) is
// present. Other clipboard installs (tests, polyfills) still pass through.
;(() => {
  if (typeof window === "undefined" || typeof navigator === "undefined") return
  const realDefineProperty = Object.defineProperty
  // Most flexible: wrap globally; only intercept the very specific call path.
  // We re-resolve `navigator`/its prototype lazily on every call: jsdom tears
  // down the global between test files within a worker, so a captured
  // reference can dangle and (worse) a bare `navigator` reference inside the
  // wrapper throws `ReferenceError: navigator is not defined` during the
  // brief window when jsdom is bootstrapping the next environment but the
  // global hasn't been re-installed yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Object.defineProperty = function (target: any, prop: PropertyKey, descriptor: PropertyDescriptor) {
    if (prop === "clipboard") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nav: any = typeof globalThis !== "undefined" ? (globalThis as any).navigator : undefined
      if (nav && (target === nav || target === Object.getPrototypeOf(nav))) {
        // If a value descriptor (test-installed mock) is already present, keep
        // it. user-event's stub install (which uses a getter descriptor) is
        // ignored. Plain `value` descriptors (test mocks) pass through.
        const existing = Object.getOwnPropertyDescriptor(target, "clipboard")
        const userEventStubInstall =
          descriptor &&
          typeof descriptor.get === "function" &&
          !("value" in descriptor)
        if (existing && "value" in existing && userEventStubInstall) {
          return target
        }
      }
    }
    return realDefineProperty(target, prop, descriptor)
  } as typeof Object.defineProperty
})()

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
