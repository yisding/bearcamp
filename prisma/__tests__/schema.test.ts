// T0.12 — prisma validate exits 0 + every required model is declared.
// At WS-0 the schema is a stub; the impl agent fills in the models. So this
// test will fail (red) on the missing-model assertions and stay green on
// `prisma validate` (the bare stub validates).

import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const SCHEMA_PATH = resolve(__dirname, '..', 'schema.prisma')

const REQUIRED_MODELS = ['Campsite', 'Trip', 'TripItem', 'Participant', 'Claim']
const REQUIRED_ENUMS = [
  'TripStyle',
  'ItemScope',
  'ItemSource',
  'ItemCategory',
]

describe('T0.12 prisma schema', () => {
  it('schema.prisma file exists', () => {
    expect(existsSync(SCHEMA_PATH)).toBe(true)
  })

  it('`prisma validate` exits 0', () => {
    // If prisma isn't installed yet this throws — that's still a meaningful
    // red ("prisma not found").
    expect(() => {
      execSync('pnpm exec prisma validate', {
        cwd: resolve(__dirname, '..', '..'),
        stdio: 'pipe',
      })
    }).not.toThrow()
  })

  it.each(REQUIRED_MODELS)('declares model %s', (name) => {
    const src = readFileSync(SCHEMA_PATH, 'utf8')
    const re = new RegExp(`(^|\\n)\\s*model\\s+${name}\\s*\\{`)
    expect(src).toMatch(re)
  })

  it.each(REQUIRED_ENUMS)('declares enum %s', (name) => {
    const src = readFileSync(SCHEMA_PATH, 'utf8')
    const re = new RegExp(`(^|\\n)\\s*enum\\s+${name}\\s*\\{`)
    expect(src).toMatch(re)
  })

  it('Trip.tentCapacity is declared (DR-21)', () => {
    const src = readFileSync(SCHEMA_PATH, 'utf8')
    expect(src).toMatch(/tentCapacity\s+Int/)
  })

  it('Trip.ownerToken is @unique (DR-22 / DR-53)', () => {
    const src = readFileSync(SCHEMA_PATH, 'utf8')
    expect(src).toMatch(/ownerToken\s+String\s+@unique/)
  })

  it('Participant has composite index on [tripId, token] (DR-22)', () => {
    const src = readFileSync(SCHEMA_PATH, 'utf8')
    expect(src).toMatch(/@@index\s*\(\s*\[\s*tripId\s*,\s*token\s*\]/)
  })

  it('TripItem has soft-delete removed boolean (DR-19)', () => {
    const src = readFileSync(SCHEMA_PATH, 'utf8')
    expect(src).toMatch(/removed\s+Boolean/)
  })
})
