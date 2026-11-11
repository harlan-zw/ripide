import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { it } from 'vitest'
import { makeFixture } from './helpers.ts'

it('checks proposed edits through the built API on the host Node runtime', () => {
  const before = 'export const value: string = "valid"\n'
  const fx = makeFixture({ 'value.ts': before })
  try {
    const entry = pathToFileURL(resolve('packages/core/dist/index.mjs')).href
    const script = `
import { findRegressions, startTsServer } from ${JSON.stringify(entry)}
import { resolve } from 'node:path'
const server = await startTsServer(process.cwd())
try {
  const path = resolve('value.ts')
  const before = ${JSON.stringify(before)}
  const change = { path, rel: 'value.ts', before, after: 'export const value: string = 1\\n' }
  const regressions = await findRegressions(server, [change], [path])
  const unchanged = await findRegressions(server, [], [path])
  process.stdout.write(JSON.stringify({ codes: regressions.map(item => item.code), unchanged, live: server.textOf(path) }))
}
finally { server.dispose() }
`
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { cwd: fx.dir, encoding: 'utf8', timeout: 20_000 })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), { codes: [2322], unchanged: [], live: before })
    assert.equal(fx.read('value.ts'), before)
  }
  finally { fx.cleanup() }
})
