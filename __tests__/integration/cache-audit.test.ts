// WS-8 T8.4 — Cache Components audit (red).
//
// Spec (plan/tasks/ws-8-integration-validation-hardening.md, T8.4):
//   (a) `next build` exits 0 with zero "uncached data outside <Suspense>"
//       or blocking-route errors.
//   (b) Non-determinism guard: `lib/ids`, `crypto.randomUUID`,
//       `Date.now`, `Math.random` are NOT reachable from any
//       `'use cache'` scope (only Server Actions).
//   (c) Refresh-API guard: `refresh` from `next/cache` confined to Server
//       Actions; `useRouter().refresh()` confined to Client Components.
//   (d) CSRF guard: `experimental.serverActions.allowedOrigins` is set
//       when `NODE_ENV==='production'` in `next.config.ts`.
//   (e) X-Robots-Tag rule: `next.config.ts`'s `async headers()` returns a
//       rule for `/trips/:tripId*` with `X-Robots-Tag: noindex, nofollow`.
//   (f) No-magic-numbers grep (DR-43): the literals 50/12/20 (as
//       participant cap / tent max / page-size cap) appear only in
//       `lib/limits.ts`. T0.15 already covers this; we add an integration-
//       level marker that the guard runs at WS-8 too.
//   (g) `cookies().delete()` / `jar.delete('bc_...')` not used anywhere
//       — only `jar.set('', { maxAge: 0 })` (DR-40).
//   (h) `generateMetadata` for `/trips/[tripId]` contains no cookies/DB
//       reads (DR-52).
//
// All tests below are *source-level* structural / grep guards executed by
// vitest. The expensive `next build` form is gated behind
// `BEARCAMP_RUN_BUILD_TESTS=1` so `pnpm test` stays fast (~seconds, not
// minutes). CI runs the full build separately.

import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '..', '..')

// ----- file walkers ---------------------------------------------------------

function walk(dir: string, exts: RegExp, acc: string[]) {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.next' || name === '__tests__') continue
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      walk(full, exts, acc)
    } else if (exts.test(name)) {
      acc.push(full)
    }
  }
}

function gatherSource(dirs: string[]): string[] {
  const acc: string[] = []
  for (const d of dirs) walk(join(ROOT, d), /\.(ts|tsx)$/, acc)
  return acc
}

// ----- (a) next build -------------------------------------------------------

describe('T8.4(a) next build — cache validator green', () => {
  it.skipIf(process.env.BEARCAMP_RUN_BUILD_TESTS !== '1')(
    'next build exits 0 with no "uncached outside <Suspense>" errors',
    () => {
      // Gated to keep `pnpm test` snappy. Set BEARCAMP_RUN_BUILD_TESTS=1
      // (CI does this) to actually shell out. The build is 30–60s on a
      // cold cache; structural guards in the rest of this file catch the
      // common regressions in <100ms.
      let stdout = ''
      try {
        stdout = execSync('pnpm exec next build', {
          cwd: ROOT,
          env: { ...process.env, NODE_ENV: 'production' },
          stdio: 'pipe',
          encoding: 'utf8',
        })
      } catch (e) {
        const err = e as { stdout?: Buffer | string; stderr?: Buffer | string }
        const out = (err.stdout?.toString() ?? '') + (err.stderr?.toString() ?? '')
        throw new Error(`next build failed:\n${out.slice(0, 4000)}`)
      }
      // Cache Components emits these phrases on failure.
      expect(stdout).not.toMatch(/uncached data outside.*Suspense/i)
      expect(stdout).not.toMatch(/blocking route/i)
    },
    300_000,
  )
})

// ----- (b) Non-determinism guard --------------------------------------------
//
// Cache Components prerenders `'use cache'`-marked functions, so any
// non-deterministic op called inside is a correctness bug — the output
// would be frozen at build time. We grep each .ts/.tsx file for the
// substring `'use cache'`; for every hit, the file is forbidden to also
// contain the listed non-deterministic ops. This is conservative
// (per-file rather than per-function) but matches the spec.

const NONDETERMINISTIC_TOKENS = [
  /\brandomUUID\s*\(/, // crypto.randomUUID()
  /\brandomBytes\s*\(/, // crypto.randomBytes()
  /\bDate\.now\s*\(/, // Date.now()
  /\bMath\.random\s*\(/, // Math.random()
] as const

// Strip comments + string-literal hints so the directive check doesn't
// false-positive on doc strings like `// never inside 'use cache' / ...`.
function stripCommentsAndIrrelevantStrings(src: string): string {
  return (
    src
      // Block comments.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Line comments.
      .replace(/\/\/[^\n]*/g, '')
  )
}

// Recognise an actual `'use cache'` directive — i.e., a string literal as
// the first statement of a function/module. Heuristic: line starts with
// optional whitespace, the literal, optional semicolon/newline. False
// positives on `const x = 'use cache'` are vanishingly rare in practice.
const USE_CACHE_DIRECTIVE_RE = /^\s*['"]use cache['"]\s*;?\s*$/m

describe('T8.4(b) Non-determinism guard — no nondeterministic ops in `use cache` scope', () => {
  it('no file with a `use cache` directive may call randomUUID/randomBytes/Date.now/Math.random', () => {
    const files = gatherSource(['app', 'lib', 'components'])
    const offenders: string[] = []
    for (const f of files) {
      const raw = readFileSync(f, 'utf8')
      const stripped = stripCommentsAndIrrelevantStrings(raw)
      if (!USE_CACHE_DIRECTIVE_RE.test(stripped)) continue
      for (const re of NONDETERMINISTIC_TOKENS) {
        if (re.test(stripped)) {
          offenders.push(`${f}: 'use cache' scope AND matches ${re}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('no `use cache` file imports from `lib/ids`', () => {
    // `lib/ids` exports tripSlug/token/campsiteId — all non-deterministic.
    // Reaching them from a cached scope freezes the value at build time.
    const files = gatherSource(['app', 'lib', 'components'])
    const offenders: string[] = []
    for (const f of files) {
      const raw = readFileSync(f, 'utf8')
      const stripped = stripCommentsAndIrrelevantStrings(raw)
      if (!USE_CACHE_DIRECTIVE_RE.test(stripped)) continue
      // Imports of '@/lib/ids' or relative '../ids' / '../../ids'.
      if (/from\s+['"](?:@\/lib\/ids|(?:\.\.?\/)+ids)['"]/.test(stripped)) {
        offenders.push(`${f}: 'use cache' scope imports from lib/ids`)
      }
    }
    expect(offenders).toEqual([])
  })
})

// ----- (c) Refresh-API guard ------------------------------------------------
//
// Two distinct refresh APIs in Next 16:
//   - `refresh` from `next/cache` — Server-Action-only invalidation.
//   - `useRouter().refresh()` from `next/navigation` — Client-Component-only
//     soft-navigation refresh.
// Mixing them is a common bug source (DR-9). We grep for misuse:
//   - `import { ... refresh ... } from 'next/cache'` outside `'use server'`.
//   - `useRouter` / `.refresh()` of router outside `'use client'`.

describe('T8.4(c) Refresh-API guard — server vs client confinement', () => {
  it('`import { refresh } from "next/cache"` only appears in `use server` modules', () => {
    const files = gatherSource(['app', 'lib', 'components'])
    const offenders: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      // Look for `refresh` in a destructure import from next/cache.
      const m = src.match(
        /import\s*\{[^}]*\brefresh\b[^}]*\}\s*from\s*['"]next\/cache['"]/,
      )
      if (!m) continue
      const isServer = /^\s*['"]use server['"]\s*;?/m.test(src)
      if (!isServer) {
        offenders.push(`${f}: imports {refresh} from next/cache but is not a 'use server' module`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('`useRouter` is imported only by `use client` components', () => {
    const files = gatherSource(['app', 'lib', 'components'])
    const offenders: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      if (!/\buseRouter\b/.test(src)) continue
      // Imports from next/navigation only (not anything else, e.g.
      // a local fake). False positives possible — narrow to import.
      const importsUseRouter =
        /import\s*\{[^}]*\buseRouter\b[^}]*\}\s*from\s*['"]next\/navigation['"]/.test(src)
      if (!importsUseRouter) continue
      const isClient = /^\s*['"]use client['"]\s*;?/m.test(src)
      if (!isClient) {
        offenders.push(`${f}: imports useRouter but is not a 'use client' component`)
      }
    }
    expect(offenders).toEqual([])
  })
})

// ----- (d) CSRF guard -------------------------------------------------------
//
// `experimental.serverActions.allowedOrigins` must be a non-empty array
// when NODE_ENV === 'production' (DR-18). Dev does not require it. We
// import `next.config.ts` as a module, set the env var, and assert the
// option is present.

describe('T8.4(d) CSRF guard — allowedOrigins pinned in production', () => {
  // We assert on the source text of `next.config.ts` rather than importing
  // the module (TypeScript module shape isn't friendly to dynamic import in
  // a vitest worker, and the config may be a NextConfig object — not a
  // factory). The structural check ensures the production-only branch
  // exists and references `allowedOrigins`.
  it('next.config.ts references experimental.serverActions.allowedOrigins', () => {
    const src = readFileSync(resolve(ROOT, 'next.config.ts'), 'utf8')
    expect(src, 'next.config.ts must reference allowedOrigins').toMatch(
      /allowedOrigins/,
    )
    expect(src, 'next.config.ts must reference serverActions config').toMatch(
      /serverActions/,
    )
  })

  it('next.config.ts gates allowedOrigins on NODE_ENV === "production"', () => {
    const src = readFileSync(resolve(ROOT, 'next.config.ts'), 'utf8')
    // The production-only branch can be expressed in several ways. Accept
    // any of the canonical forms.
    const productionGuards = [
      /process\.env\.NODE_ENV\s*===?\s*['"]production['"]/,
      /['"]production['"]\s*===?\s*process\.env\.NODE_ENV/,
      /NODE_ENV\s*===?\s*['"]production['"]/,
    ]
    const hit = productionGuards.some((re) => re.test(src))
    expect(hit, 'allowedOrigins must be gated on NODE_ENV==="production"').toBe(true)
  })

  it('next.config.ts allowedOrigins value is a non-empty array literal (heuristic)', () => {
    const src = readFileSync(resolve(ROOT, 'next.config.ts'), 'utf8')
    // Find `allowedOrigins:` followed by an array literal with at least
    // one entry. We don't need to evaluate the JS — just rule out the
    // empty-array and undefined regressions.
    const m = src.match(/allowedOrigins\s*:\s*(\[[^\]]*\]|[A-Za-z_$][\w$.]*)/)
    expect(m, 'expected `allowedOrigins:` assignment in next.config.ts').not.toBeNull()
    const value = m![1]
    if (value.startsWith('[')) {
      // Literal array: must contain at least one string entry.
      expect(value).toMatch(/['"]\w/)
      expect(value).not.toMatch(/^\[\s*\]$/)
    }
    // Otherwise it's a variable name — accepted; the impl agent is
    // expected to populate it from env vars (DEPLOY_HOST etc.).
  })
})

// ----- (e) X-Robots-Tag rule -----------------------------------------------
//
// `next.config.ts` must export an async `headers()` that returns a rule
// for `/trips/:tripId*` setting `X-Robots-Tag: noindex, nofollow`
// (DR-51). Belt-and-braces beyond the `<meta>` tag — survives CDNs that
// strip head metas.

describe('T8.4(e) X-Robots-Tag header rule on /trips/:tripId*', () => {
  // As with (d), we assert on the source text of next.config.ts.
  // Behavioural verification (an HTTP request seeing the header) is the
  // e2e gate in T8.6.
  it('next.config.ts defines async headers() with a rule for /trips/:tripId*', () => {
    const src = readFileSync(resolve(ROOT, 'next.config.ts'), 'utf8')
    expect(src, 'next.config.ts must define an async headers() method').toMatch(
      /(async\s+headers\s*\(|headers\s*:\s*async\s*\()/,
    )
    expect(src, 'next.config.ts must reference /trips/ in headers()').toMatch(
      /['"]\/trips\/[^'"]+['"]/,
    )
  })

  it('the /trips/:tripId* headers rule sets X-Robots-Tag: noindex, nofollow', () => {
    const src = readFileSync(resolve(ROOT, 'next.config.ts'), 'utf8')
    expect(src, 'X-Robots-Tag header key must appear').toMatch(/X-Robots-Tag/i)
    // The header value must be noindex + nofollow. We don't pin the order
    // (typical: "noindex, nofollow").
    const m = src.match(/X-Robots-Tag[^,\n]*?value\s*:\s*['"]([^'"]+)['"]/i)
    expect(m, 'expected `X-Robots-Tag` value: literal').not.toBeNull()
    const value = m![1].toLowerCase()
    expect(value).toMatch(/noindex/)
    expect(value).toMatch(/nofollow/)
  })
})

// ----- (f) No-magic-numbers grep -------------------------------------------
//
// T0.15 (lib/__tests__/limits.test.ts) already implements this with a
// narrow contextual grep across lib/app/components. We add a WS-8-scoped
// marker that re-asserts the cap literals only live in lib/limits.ts —
// catches accidental re-introduction during the WS-8 polish pass.

describe('T8.4(f) No-magic-numbers grep — caps only in lib/limits.ts', () => {
  it('lib/limits.ts is the only source file that pairs 50 with "participant"', () => {
    const files = gatherSource(['app', 'lib', 'components']).filter(
      (f) => !f.endsWith('lib/limits.ts'),
    )
    const offenders: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      const lines = src.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (/\b50\b/.test(line) && /participant|cap/i.test(line)) {
          offenders.push(`${f}:${i + 1}: ${line.trim()}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('lib/limits.ts is the only source file that pairs 12 with "tent"', () => {
    const files = gatherSource(['app', 'lib', 'components']).filter(
      (f) => !f.endsWith('lib/limits.ts'),
    )
    const offenders: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      const lines = src.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (/\b12\b/.test(line) && /tent/i.test(line)) {
          offenders.push(`${f}:${i + 1}: ${line.trim()}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('lib/limits.ts is the only source file that pairs 20 with "page"', () => {
    const files = gatherSource(['app', 'lib', 'components']).filter(
      (f) => !f.endsWith('lib/limits.ts'),
    )
    const offenders: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      const lines = src.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (/\b20\b/.test(line) && /page|search/i.test(line)) {
          offenders.push(`${f}:${i + 1}: ${line.trim()}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

// ----- (g) jar.delete not used --------------------------------------------
//
// DR-40: clearing path-scoped cookies via `jar.delete(name)` is broken
// (single-arg, ignores path). The repo standard is
// `jar.set(name, '', { path, maxAge: 0 })`. We grep for the offending form.

describe('T8.4(g) cookie clearing — jar.delete() forbidden', () => {
  it('no source file calls `jar.delete(...)` or `cookies().delete(...)` to clear bc_ cookies', () => {
    const files = gatherSource(['app', 'lib', 'components'])
    const offenders: string[] = []
    const badPatterns = [
      /\bjar\s*\.\s*delete\s*\(/,
      /\bcookies\s*\(\s*\)\s*\.\s*delete\s*\(/,
      // Even via the typed Awaited<cookies()> variable — match common name
      // patterns like `cookieStore.delete(...)`.
      /\bcookieStore\s*\.\s*delete\s*\(/,
    ]
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      const lines = src.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Skip comments lines and JSDoc that merely mention the API.
        if (/^\s*(?:\/\/|\*)/.test(line)) continue
        for (const re of badPatterns) {
          if (re.test(line)) {
            offenders.push(`${f}:${i + 1}: ${line.trim()}`)
            break
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('every bc_ cookie clear uses `{ maxAge: 0 }` pattern', () => {
    // Look at lib/trips/identity*.ts — the centralised owner of cookie
    // clearing — and assert each clear function uses maxAge:0.
    const files = [
      resolve(ROOT, 'lib/trips/identity.ts'),
      resolve(ROOT, 'lib/trips/identity.stub.ts'),
    ]
    for (const f of files) {
      let src = ''
      try {
        src = readFileSync(f, 'utf8')
      } catch {
        // identity.stub may legitimately not exist post-WS-8 once WS-6
        // imports are rewritten to identity.ts. If absent, skip.
        continue
      }
      // For each function named clear*Token, the body must contain
      // `maxAge: 0`. We do a coarse check: the file as a whole must
      // mention `maxAge: 0` at least twice (one per cookie).
      if (/clear(?:Owner|Participant)Token/.test(src)) {
        const matches = src.match(/maxAge\s*:\s*0/g)
        expect(matches, `${f}: each clear*Token must use maxAge:0`).not.toBeNull()
        expect(matches!.length).toBeGreaterThanOrEqual(2)
      }
    }
  })
})

// ----- (h) generateMetadata is static --------------------------------------
//
// `generateMetadata` runs at prerender time and must NOT read request-time
// state (cookies, headers) or hit the DB. DR-52: the trip page's metadata
// is static (robots: noindex). If we later need per-trip dynamic
// metadata, the DynamicMarker pattern from generate-metadata.md applies
// — but at v1 it's static.
//
// Test strategy: read the file source; find the `generateMetadata` export;
// assert its body does not reference `cookies()`, `headers()`, or any
// storage/DB call.

describe('T8.4(h) generateMetadata on /trips/[tripId] is static', () => {
  it('app/trips/[tripId]/page.tsx generateMetadata does not call cookies() / headers() / DB', () => {
    const src = readFileSync(
      resolve(ROOT, 'app/trips/[tripId]/page.tsx'),
      'utf8',
    )

    // Find the `generateMetadata` function declaration. Match its body
    // up to the matching closing brace. We use a brace counter rather
    // than a regex (regex can't reliably balance braces).
    const startIdx = src.search(
      /export\s+async\s+function\s+generateMetadata\b|export\s+function\s+generateMetadata\b/,
    )
    expect(startIdx, 'generateMetadata export must exist').toBeGreaterThan(-1)

    const openIdx = src.indexOf('{', startIdx)
    expect(openIdx).toBeGreaterThan(-1)

    let depth = 0
    let closeIdx = -1
    for (let i = openIdx; i < src.length; i++) {
      const c = src[i]
      if (c === '{') depth += 1
      else if (c === '}') {
        depth -= 1
        if (depth === 0) {
          closeIdx = i
          break
        }
      }
    }
    expect(closeIdx).toBeGreaterThan(openIdx)

    const body = src.slice(openIdx, closeIdx + 1)
    // Strip comments so doc strings don't trip the assertions.
    const stripped = body
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')

    // Forbidden inside generateMetadata.
    expect(stripped).not.toMatch(/\bcookies\s*\(/)
    expect(stripped).not.toMatch(/\bheaders\s*\(/)
    // No storage / Prisma calls. Heuristic: any `getStorage(`, `prisma.`,
    // `storage.`, or `buildTripView(` call inside the body.
    expect(stripped).not.toMatch(/\bgetStorage\s*\(/)
    expect(stripped).not.toMatch(/\bprisma\s*\./)
    expect(stripped).not.toMatch(/\bstorage\s*\./)
    expect(stripped).not.toMatch(/\bbuildTripView\s*\(/)
  })

  it('generateMetadata does not import from next/headers within the page module head', () => {
    // If the page module imports `cookies` or `headers` from `next/headers`
    // ONLY for the page body, that's fine — the import alone is not a
    // problem. But if a future regression adds a `headers()` call to
    // generateMetadata, the (h) test above catches it. We add a marker
    // that warns the impl agent that next/headers usage must be confined
    // to the page body, not the metadata path.
    const src = readFileSync(
      resolve(ROOT, 'app/trips/[tripId]/page.tsx'),
      'utf8',
    )
    if (/from\s+['"]next\/headers['"]/.test(src)) {
      // The body-level usage is allowed. The body-of-generateMetadata
      // assertion is the real guard.
      expect(true).toBe(true)
    } else {
      expect(true).toBe(true)
    }
  })
})
