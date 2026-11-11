import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { findRegressions, startTsServer } from 'ripide-api'
import { it } from 'vitest'
import { makeFixture } from './helpers.ts'

it('disposes the server while document writes are queued without crashing', () => {
  const fx = makeFixture()
  try {
    const entry = pathToFileURL(resolve('packages/core/dist/index.mjs')).href
    const script = fx.write('dispose.ts', `
import { startTsServer } from ${JSON.stringify(entry)}
import process from 'node:process'
const server = await startTsServer(process.cwd())
server.open('large.ts', 'export const value = 1\\n'.repeat(200_000))
server.dispose()
process.stdout.write('disposed\\n')
`)
    const result = spawnSync(process.execPath, [script], { cwd: fx.dir, encoding: 'utf8', timeout: 10_000 })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), 'disposed')
  }
  finally { fx.cleanup() }
})

it.each(['diagnostics', 'snapshot verification'])('rejects pending %s when the server is disposed', async (operation) => {
  const fx = makeFixture({ 'value.ts': 'export const value = 1\n' })
  const server = await startTsServer(fx.dir)
  try {
    const files = [join(fx.dir, 'value.ts')]
    const diagnostics = operation === 'diagnostics' ? server.diagnostics(files) : server.compareDiagnostics([], files)
    server.dispose()
    await assert.rejects(diagnostics, /TypeScript server disposed/)
  }
  finally {
    server.dispose()
    fx.cleanup()
  }
})

it('snapshot verification retains the selected generated project options', async () => {
  const fx = makeFixture({
    'deck/.nuxt/tsconfig.app.json': JSON.stringify({
      compilerOptions: { strictNullChecks: true, noEmit: true },
      files: ['../consumer.ts'],
    }),
    'deck/consumer.ts': 'export const value: string = "valid"\n',
  }, false)
  const server = await startTsServer(fx.dir, { tsconfig: 'deck/.nuxt/tsconfig.app.json' })
  try {
    const path = join(fx.dir, 'deck/consumer.ts')
    const regressions = await findRegressions(server, [{ path, rel: 'deck/consumer.ts', before: fx.read('deck/consumer.ts'), after: 'export const value: string = null\n' }], [path])
    assert.deepEqual(regressions.map(({ file, code }) => ({ file, code })), [{ file: path, code: 2322 }])
    assert.equal(server.textOf(path), fx.read('deck/consumer.ts'))
  }
  finally {
    server.dispose()
    fx.cleanup()
  }
})

it('uses compiler options from a selected generated config', async () => {
  const fx = makeFixture({
    'deck/.nuxt/tsconfig.app.json': JSON.stringify({
      compilerOptions: { strictNullChecks: true, noEmit: true },
      files: ['../consumer.ts'],
    }),
    'deck/consumer.ts': 'export const value: string = null\n',
  }, false)
  const server = await startTsServer(fx.dir, { tsconfig: 'deck/.nuxt/tsconfig.app.json' })
  try {
    const configPath = join(fx.dir, 'deck/.nuxt/tsconfig.app.json')
    const configDiagnostics = await server.diagnostics([configPath])
    assert.deepEqual(configDiagnostics.get(configPath), [])
    const path = join(fx.dir, 'deck/consumer.ts')
    const diagnostics = await server.diagnostics([path])
    assert.deepEqual(diagnostics.get(path)?.map(diagnostic => diagnostic.code), [2322])
  }
  finally {
    server.dispose()
    fx.cleanup()
  }
})

it('rejects a missing selected config', async () => {
  const fx = makeFixture()
  try {
    await assert.rejects(startTsServer(fx.dir, { tsconfig: 'missing.json' }), { code: 'ENOENT' })
  }
  finally { fx.cleanup() }
})

it('findRegressions reports errors introduced by in-memory changes only', async () => {
  const fx = makeFixture({
    'a.ts': 'export function add(n: number): number { return n + 1 }\n',
    'b.ts': 'import { add } from \'./a.ts\'\nexport const r: number = add(2)\n',
  })
  const server = await startTsServer(fx.dir)
  try {
    const a = join(fx.dir, 'a.ts')
    const b = join(fx.dir, 'b.ts')
    const breaking = [{
      path: a,
      rel: 'a.ts',
      before: fx.read('a.ts'),
      after: 'export function add(n: number): string { return String(n) }\n',
    }]
    const regressions = await findRegressions(server, breaking, [a, b])
    assert.equal(regressions.length, 1, `expected one regression, got ${JSON.stringify(regressions)}`)
    assert.equal(regressions[0]!.file, b)
    assert.equal(regressions[0]!.code, 2322)
    assert.equal(fx.read('a.ts'), breaking[0]!.before, 'disk untouched')
  }
  finally {
    server.dispose()
    fx.cleanup()
  }
})

it('findRegressions checks proposed edits without changing the live server', async () => {
  const fx = makeFixture({
    'a.ts': 'export function add(n: number): number { return n + 1 }\n',
    'b.ts': 'import { add } from \'./a.ts\'\nexport const r: number = add(2)\n',
  })
  const server = await startTsServer(fx.dir)
  try {
    const a = join(fx.dir, 'a.ts')
    const b = join(fx.dir, 'b.ts')
    const breaking = [{ path: a, rel: 'a.ts', before: fx.read('a.ts'), after: 'export function add(n: number): string { return String(n) }\n' }]
    const regressions = await findRegressions(server, breaking, [a, b])
    assert.deepEqual(regressions.map(({ file, code }) => ({ file, code })), [{ file: b, code: 2322 }])
    assert.equal(server.textOf(a), breaking[0]!.before)
    const again = await server.diagnostics([b])
    assert.deepEqual(again.get(b), [])
  }
  finally {
    server.dispose()
    fx.cleanup()
  }
})

it('snapshot verification retains nested type error explanations', async () => {
  const before = 'interface Expected { child: { required: string } }\nconst actual = { child: { required: "valid" } }\nexport const value: Expected = actual\n'
  const after = before.replace('required: "valid"', 'required: 1')
  const fx = makeFixture({ 'value.ts': before })
  const server = await startTsServer(fx.dir)
  try {
    const path = join(fx.dir, 'value.ts')
    const regressions = await findRegressions(server, [{ path, rel: 'value.ts', before, after }], [path])
    assert.equal(regressions.length, 1)
    assert.match(regressions[0]!.message, /Type 'number' is not assignable to type 'string'/)
  }
  finally {
    server.dispose()
    fx.cleanup()
  }
})

it('rename follows named re-export barrels instead of aliasing the export', async () => {
  const fx = makeFixture({
    'a.ts': 'export function target(): number { return 1 }\n',
    'index.ts': 'export { target } from \'./a.ts\'\n',
    'b.ts': 'import { target } from \'./index.ts\'\nexport const v = target()\n',
  })
  const server = await startTsServer(fx.dir)
  try {
    const edits = await server.rename(join(fx.dir, 'a.ts'), 'export function '.length, 'renamed')
    const texts = [...edits.values()].flat().map(e => e.newText)
    assert.equal(edits.size, 3, 'declaration, barrel, and consumer all change')
    assert.ok(texts.every(t => t === 'renamed'), `no alias edits expected, got ${JSON.stringify(texts)}`)
  }
  finally {
    server.dispose()
    fx.cleanup()
  }
})
