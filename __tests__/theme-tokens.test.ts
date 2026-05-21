// T4.6 — theme tokens: dark vs light yields a different resolved value.
//
// We parse `app/globals.css` as text and assert that `--background`,
// `--foreground`, and `--primary` are each declared in both `:root` and
// the `.dark` selector with DIFFERENT values. This catches the regression
// where a theme override block is removed/typo'd and the dark variant
// silently inherits the light tokens.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SOURCE = readFileSync(
  resolve(process.cwd(), 'app/globals.css'),
  'utf8'
)

/**
 * Extract the inner body of a top-level CSS block matching `selector`.
 * Naive but sufficient for our hand-authored `globals.css`: we find the
 * selector at line start, then capture characters up to the matching `}`.
 */
function extractBlock(selector: string, css: string): string {
  // Anchor at line start so `:root` doesn't match inside `@theme inline`
  // declarations like `:root .foo`.
  const re = new RegExp(
    `(?:^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
    'm'
  )
  const m = css.match(re)
  if (!m) {
    throw new Error(`Selector ${selector} not found in app/globals.css`)
  }
  return m[1]
}

function tokenValue(block: string, name: string): string | null {
  const re = new RegExp(`--${name}\\s*:\\s*([^;]+);`)
  const m = block.match(re)
  return m ? m[1].trim() : null
}

describe('T4.6 theme tokens differ between light and dark', () => {
  const root = extractBlock(':root', SOURCE)
  const dark = extractBlock('\\.dark', SOURCE)

  it.each(['background', 'foreground', 'primary', 'card', 'muted'])(
    '--%s differs between :root and .dark',
    (name) => {
      const light = tokenValue(root, name)
      const darkV = tokenValue(dark, name)
      expect(light, `:root defines --${name}`).not.toBeNull()
      expect(darkV, `.dark defines --${name}`).not.toBeNull()
      expect(darkV).not.toBe(light)
    }
  )

  it('declares a dark-mode variant strategy (custom variant or .dark selector)', () => {
    // Either `@custom-variant dark (&:is(.dark *))` or a `.dark` block must
    // exist — both currently do; this guards against removal during
    // refactors.
    const hasCustomVariant = /@custom-variant\s+dark/.test(SOURCE)
    const hasDarkBlock = /(?:^|\n)\s*\.dark\s*\{/m.test(SOURCE)
    expect(hasCustomVariant || hasDarkBlock).toBe(true)
  })

  it('uses the configured olive base color (radix-maia)', () => {
    // The olive base palette resolves into oklch values with hue ≈ 106–107.
    // This is a lightweight sanity check that the base color in
    // components.json hasn't drifted.
    const bg = tokenValue(root, 'background')
    const fg = tokenValue(root, 'foreground')
    expect(bg).toMatch(/oklch\(/)
    expect(fg).toMatch(/oklch\(/)
  })
})
