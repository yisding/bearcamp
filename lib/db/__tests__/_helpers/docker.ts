// Docker availability probe — WS-2 test helper.
//
// `dockerAvailable()` is a cheap, synchronous check that returns true when a
// local Docker daemon is reachable (so Testcontainers can start an ephemeral
// `postgres:16`). We use `docker info` and short-circuit when the binary
// isn't on $PATH at all.
//
// Used as the predicate for `describe.skipIf(...)` so the suite runs (real
// failures) when Docker is up, and skips (rather than hanging) when it
// isn't — see plan/tasks/ws-2-persistence-layer.md "Practical guidance".

import { execSync } from 'node:child_process'

let cached: boolean | null = null

export function dockerAvailable(): boolean {
  if (cached !== null) return cached
  if (process.env.BEARCAMP_SKIP_DOCKER_TESTS === '1') {
    cached = false
    return cached
  }
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 5000 })
    cached = true
  } catch {
    cached = false
  }
  return cached
}

export function skipUnlessDocker(): boolean {
  return !dockerAvailable()
}
