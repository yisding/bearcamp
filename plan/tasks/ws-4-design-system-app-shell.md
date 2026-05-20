# WS-4 — Design System & App Shell

**Wave:** 2 (parallel — land early; WS-5/WS-6 polish depends on its
primitives) · **Critical path:** no · **Depends on:** WS-0 routes
**Start when:** WS-0 merged

**Owned paths:** `app/layout.tsx`, `app/globals.css`, `components/ui/*`,
`components/app/*`, `lib/utils.ts` (pre-exists from shadcn scaffold; WS-4
owns any regeneration — review I-D).

> Owns the root layout and theme. WS-5/WS-6 import a frozen barrel
> (`components/app/index.ts`) and can scaffold against placeholders until
> this lands.

## Tasks

- [ ] **WS-4.1** Add primitives — via the configured shadcn registry
  (`radix-maia`/olive): `input`, `card`, `checkbox`, `dialog`, `tabs`,
  `badge`, `select`, `sonner`, `skeleton`, `separator`, `label`, `tooltip`
  (`button` exists). **DoD:** each builds with Tailwind v4 + the existing
  `globals.css` imports; sane in light/dark.
- [ ] **WS-4.2** Root layout — `app/layout.tsx`: keep configured fonts; set
  `metadata` (Bearcamp title/description); add `components/app/Header`
  (brand + link to `/campsites`) and `<Toaster/>`. Do **not** add an
  app-wide empty `<Suspense>` above `<body>` (kills the static shell — see
  `../architecture.md` / caching doc). **DoD:** shell renders on every route;
  no global instant opt-out.
- [ ] **WS-4.3** Theme tokens — `app/globals.css`: confirm olive base; add
  app-level CSS vars; verify dark variant. **DoD:** no contrast regressions;
  tokens documented.
- [ ] **WS-4.4** App primitives — `components/app/`: `PageHeader`,
  `EmptyState`, `ErrorState`, `ListSkeleton`, `Section`. **DoD:** typed
  props.
- [ ] **WS-4.5** Stable UI surface — `components/app/index.ts` barrel + short
  usage note (the **I-6** contract for WS-5/WS-6). **DoD:** UI streams import
  a frozen surface; later internal changes don't break them.
- [ ] **WS-4.6** Visual check — dev-only `/styleguide` page (or a checklist)
  rendering all primitives. **DoD:** one place to eyeball the system;
  excluded from prod nav.

## Acceptance criteria — write these tests first (red → green)

@testing-library/react + one Playwright shell check. Author first.

- [ ] **T4.1** primitives render — each added shadcn primitive mounts
  without error and exposes its expected ARIA role. _(WS-4.1)_
- [ ] **T4.2** app primitives — `PageHeader/EmptyState/ErrorState/
  ListSkeleton/Section` render given props with expected text/roles.
  _(WS-4.4)_
- [ ] **T4.3** barrel — `components/app/index.ts` exports every documented
  symbol (import-each test). _(WS-4.5)_
- [ ] **T4.4** layout metadata — root `metadata.title` is "Bearcamp …";
  Header + Toaster present. _(WS-4.2)_
- [ ] **T4.5** static shell intact — Playwright: `/` returns non-empty
  static HTML before hydration (no app-wide empty Suspense). _(WS-4.2)_
- [ ] **T4.6** theme — dark vs light yields a different resolved token
  value. _(WS-4.3)_

## Seams you participate in

- **I-6** (producer): UI primitives surface. Freeze the barrel in WS-4.5;
  WS-5/WS-6 depend only on it.
