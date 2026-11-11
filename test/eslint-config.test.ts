import { ESLint } from 'eslint'
import { expect, it } from 'vitest'

it('accepts compact expressions used in repository fixtures', async () => {
  const eslint = new ESLint()
  const results = await eslint.lintText([
    'export const compilerOptions = { target: \'ES2022\', module: \'ESNext\', moduleResolution: \'bundler\', strict: true }',
    'export const options = Object.assign({}, { compilerOptions })',
    'export const selected = compilerOptions.strict ? Object.keys(compilerOptions) : []',
    '',
  ].join('\n'), { filePath: 'test/lint-fixture.ts' })

  expect(results.flatMap(result => result.messages)).toEqual([])
})

it('still rejects loose equality in compact expressions', async () => {
  const eslint = new ESLint()
  const results = await eslint.lintText('export const equal = (value: unknown) => value == 1\n', {
    filePath: 'test/lint-fixture.ts',
  })

  expect(results.flatMap(result => result.messages).map(message => message.ruleId)).toContain('eqeqeq')
})

it.each([
  'evals/experiment/manifest.ts',
  'evals/experiment/report.ts',
  'evals/experiment/supervisor.ts',
  'packages/cli/src/test-worker.ts',
  'packages/core/src/delete.ts',
])('lints the type checks in %s', async (file) => {
  const eslint = new ESLint()
  const results = await eslint.lintFiles([file])

  expect(results.flatMap(result => result.messages)).toEqual([])
})
