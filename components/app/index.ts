// WS-4.5 — I-6 frozen UI surface.
//
// This barrel is the *only* path WS-5 / WS-6 may import app-level primitives
// from. Renaming, removing, or changing the call signature of any export
// listed here is a breaking change to the I-6 seam and requires a
// coordinated WS-5/WS-6 update (see `plan/architecture.md`).
//
// Frozen surface (additions are non-breaking; removals/renames are):
//   - Header        — app shell brand bar (`<header>` landmark).
//   - PageHeader    — top-of-page title + description + actions slot (`<h1>`).
//   - EmptyState    — friendly placeholder for empty collections.
//   - ErrorState    — assertive inline error surface (`role=alert`).
//   - ListSkeleton  — loading placeholder for list fallbacks (`role=status`).
//   - Section       — labelled `<section>` region with `<h2>` + actions slot.

// The `*Props` interfaces re-exported below are part of the I-6 contract:
// downstream workstreams type their consumers against them, so changes to
// these shapes require a coordinated I-6 update (see file header).
export { Header } from "./Header"
export { PageHeader } from "./PageHeader"
export type { PageHeaderProps } from "./PageHeader"
export { EmptyState } from "./EmptyState"
export type { EmptyStateProps } from "./EmptyState"
export { ErrorState } from "./ErrorState"
export type { ErrorStateProps } from "./ErrorState"
export { ListSkeleton } from "./ListSkeleton"
export type { ListSkeletonProps } from "./ListSkeleton"
export { Section } from "./Section"
export type { SectionProps } from "./Section"
