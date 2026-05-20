// T0.15 — limits.
// 1) lib/limits.ts exports the 5 documented constants with documented values
//    (DR-43).
// 2) Grep heuristic: no other source file contains the literal `50`, `12`,
//    or `20` in a participant-cap / tent-max / page-size context. The
//    heuristic looks for `\b<N>\b` near keywords like "participant", "tent",
//    "page" within the same line in lib/, app/, components/. Documented
//    limitations: schema.prisma can use `@default(2)` (different number)
//    but not `50`/`12`/`20`; comments and doc strings can mention the
//    numbers verbatim only inside lib/limits.ts itself or this test file.

import { describe, it, expect } from 'vitest'
import * as limits from '../limits'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

describe('T0.15 limits', () => {
  it('exports PARTICIPANT_CAP_PER_TRIP = 50', () => {
    expect(limits.PARTICIPANT_CAP_PER_TRIP).toBe(50)
  })
  it('exports TENT_CAPACITY_MIN = 1', () => {
    expect(limits.TENT_CAPACITY_MIN).toBe(1)
  })
  it('exports TENT_CAPACITY_MAX = 12', () => {
    expect(limits.TENT_CAPACITY_MAX).toBe(12)
  })
  it('exports SEARCH_PAGE_SIZE_DEFAULT = 20', () => {
    expect(limits.SEARCH_PAGE_SIZE_DEFAULT).toBe(20)
  })
  it('exports SEARCH_PAGE_SIZE_MAX = 50', () => {
    expect(limits.SEARCH_PAGE_SIZE_MAX).toBe(50)
  })
  it('exports exactly these 5 constants and nothing else', () => {
    expect(Object.keys(limits).sort()).toEqual(
      [
        'PARTICIPANT_CAP_PER_TRIP',
        'TENT_CAPACITY_MIN',
        'TENT_CAPACITY_MAX',
        'SEARCH_PAGE_SIZE_DEFAULT',
        'SEARCH_PAGE_SIZE_MAX',
      ].sort(),
    )
  })

  // ---- grep heuristic ----

  const ROOT = resolve(__dirname, '..', '..')
  const SCAN_DIRS = ['lib', 'app', 'components']
  const ALLOW_FILES = new Set([
    resolve(ROOT, 'lib/limits.ts'),
    // This test file itself is allowed to mention the literals.
    resolve(ROOT, 'lib/__tests__/limits.test.ts'),
  ])
  const SKIP_DIR_NAMES = new Set(['__tests__', 'node_modules', '.next'])

  function walk(dir: string, acc: string[]) {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      const full = join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) {
        if (SKIP_DIR_NAMES.has(name)) continue
        walk(full, acc)
      } else if (/\.(ts|tsx)$/.test(name)) {
        acc.push(full)
      }
    }
  }

  function gatherFiles(): string[] {
    const acc: string[] = []
    for (const d of SCAN_DIRS) walk(join(ROOT, d), acc)
    return acc.filter((f) => !ALLOW_FILES.has(f))
  }

  // Heuristic: a literal X appears in a participant-cap / tent / page context
  // if the same line contains both the number (bounded by \b) AND a hint
  // keyword.
  function hasContextualLiteral(
    src: string,
    n: number,
    hints: RegExp,
  ): { line: number; text: string } | null {
    const re = new RegExp(`\\b${n}\\b`)
    const lines = src.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i]) && hints.test(lines[i])) {
        return { line: i + 1, text: lines[i] }
      }
    }
    return null
  }

  it('no file outside lib/limits.ts restates 50 in a participant-cap context', () => {
    const files = gatherFiles()
    const offenders: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      const hit = hasContextualLiteral(src, 50, /participant|cap/i)
      if (hit) offenders.push(`${f}:${hit.line}: ${hit.text.trim()}`)
    }
    expect(offenders).toEqual([])
  })

  it('no file outside lib/limits.ts restates 12 in a tent-max context', () => {
    const files = gatherFiles()
    const offenders: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      const hit = hasContextualLiteral(src, 12, /tent/i)
      if (hit) offenders.push(`${f}:${hit.line}: ${hit.text.trim()}`)
    }
    expect(offenders).toEqual([])
  })

  it('no file outside lib/limits.ts restates 20 in a page-size context', () => {
    const files = gatherFiles()
    const offenders: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      const hit = hasContextualLiteral(src, 20, /page|search/i)
      if (hit) offenders.push(`${f}:${hit.line}: ${hit.text.trim()}`)
    }
    expect(offenders).toEqual([])
  })
})
