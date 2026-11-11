import type { Manifest } from './manifest.ts'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { buildSchedule, sha256 } from './manifest.ts'

const run = promisify(execFile)

interface Termination {
  unit: string
  completed: string
}

export type SupervisedOutcome = Termination & ({
  _tag: 'Completed'
  result: 'success'
  exitCode: 1
  exitStatus: 0
} | {
  _tag: 'Failed'
  result: string
  exitCode: number
  exitStatus: number
})

function parseOutcome(value: unknown, unit: string): SupervisedOutcome {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid supervisor outcome.')
  const row = value as Partial<SupervisedOutcome>
  if (row.unit !== unit || typeof row.completed !== 'string' || !['Completed', 'Failed'].includes(row._tag!) || typeof row.result !== 'string' || !Number.isInteger(row.exitCode) || !Number.isInteger(row.exitStatus))
    throw new Error('Invalid supervisor outcome.')
  if (row._tag === 'Completed' && (row.result !== 'success' || row.exitCode !== 1 || row.exitStatus !== 0))
    throw new Error('Invalid successful supervisor outcome.')
  return row as SupervisedOutcome
}

export function supervisorDeadline(manifest: Manifest): number {
  const commands = manifest.versions.length + buildSchedule(manifest).reduce((count, entry) => {
    const task = manifest.tasks.find(task => task.id === entry.task)!
    return count + (task.source._tag === 'Git' ? 2 : 0) + task.setup.length + (manifest.repairs + 1) * (1 + task.checks.length + task.qualityGates.length)
  }, 0)
  // Allow recorder shutdown and independent grading beyond each registered command timeout.
  const deadline = 60000 + commands * (manifest.timeoutMs + 10000)
  if (!Number.isSafeInteger(deadline))
    throw new TypeError('The supervisor deadline exceeds the supported integer range.')
  return deadline
}

interface Registration {
  unit: string
  command: string[]
  cwd: string
  deadlineMs: number
  started: string
}

function registration(directory: string): Registration {
  const value: unknown = JSON.parse(readFileSync(join(directory, 'supervisor.json'), 'utf8'))
  if (!value || typeof value !== 'object')
    throw new Error('Invalid supervisor registration.')
  const row = value as Partial<Registration>
  if (row.unit !== unitName(directory) || !Array.isArray(row.command) || row.command.some(arg => typeof arg !== 'string') || typeof row.cwd !== 'string' || typeof row.started !== 'string' || !Number.isSafeInteger(row.deadlineMs))
    throw new Error('Invalid supervisor registration.')
  return row as Registration
}

function unitName(directory: string) {
  return `ripide-eval-${sha256(resolve(directory)).slice(0, 24)}.service`
}

async function managerState(unit: string) {
  const { stdout } = await run('systemctl', ['--user', 'show', unit, '--property=LoadState,ActiveState,SubState,Result,ExecMainCode,ExecMainStatus'], { timeout: 10000 })
  return Object.fromEntries(stdout.trim().split('\n').map((line) => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1)]
  }))
}

async function stopUnit(unit: string) {
  await run('systemctl', ['--user', 'stop', unit], { timeout: 10000 }).catch(async (error: unknown) => {
    // Another watcher can finish cleanup between our observation and stop request.
    if ((await managerState(unit)).LoadState !== 'not-found')
      throw error
  })
  if ((await managerState(unit)).ActiveState === 'failed') {
    // Stopping a failed transient unit does not unload it. Preserve its outcome before clearing the manager entry.
    await run('systemctl', ['--user', 'reset-failed', unit], { timeout: 10000 }).catch(async (error: unknown) => {
      if ((await managerState(unit)).LoadState !== 'not-found')
        throw error
    })
  }
}

export async function startSupervisedCommand(options: { command: string[], cwd: string, directory: string, deadlineMs: number, input?: string }) {
  if (process.platform !== 'linux')
    throw new Error('Durable experiments require Linux and a systemd user manager.')
  if (!options.command.length || !isAbsolute(options.command[0]) || !isAbsolute(options.cwd) || !isAbsolute(options.directory))
    throw new Error('Provide an absolute executable, working directory, and supervisor directory.')
  if (!Number.isSafeInteger(options.deadlineMs) || options.deadlineMs < 1)
    throw new Error('Provide a positive supervisor deadline in milliseconds.')
  // Check availability before reserving a registration. Never fall back to foreground execution.
  await run('systemctl', ['--user', 'show-environment'], { timeout: 10000 })
  mkdirSync(options.directory, { mode: 0o700 })
  const row: Registration = { command: options.command, cwd: options.cwd, deadlineMs: options.deadlineMs, unit: unitName(options.directory), started: new Date().toISOString() }
  writeFileSync(join(options.directory, 'supervisor.json'), `${JSON.stringify(row, null, 2)}\n`, { flag: 'wx', mode: 0o400 })
  if (options.input !== undefined)
    writeFileSync(join(options.directory, 'input.json'), options.input, { flag: 'wx', mode: 0o400 })
  // The user manager may have a different PATH or provider environment. Keep values out of command arguments.
  const environment = Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined).map(([key, value]) => `${key}="${value.replace(/[\\"$`]/g, '\\$&')}"`).join('\n')
  const environmentPath = join(options.directory, 'environment')
  writeFileSync(environmentPath, `${environment}\n`, { flag: 'wx', mode: 0o600 })
  const stdout = join(options.directory, 'stdout.log')
  const stderr = join(options.directory, 'stderr.log')
  writeFileSync(stdout, '', { flag: 'wx', mode: 0o600 })
  writeFileSync(stderr, '', { flag: 'wx', mode: 0o600 })
  await run('systemd-run', [
    '--user',
    '--quiet',
    '--service-type=exec',
    '--remain-after-exit',
    '--expand-environment=no',
    `--unit=${row.unit}`,
    `--working-directory=${row.cwd}`,
    `--property=RuntimeMaxSec=${row.deadlineMs}ms`,
    '--property=TimeoutStopSec=5s',
    '--property=KillMode=control-group',
    `--property=EnvironmentFile=${environmentPath}`,
    `--property=StandardOutput=append:${stdout}`,
    `--property=StandardError=append:${stderr}`,
    '--',
    ...row.command,
  ], { timeout: 10000 })
  return row
}

export async function watchSupervisedCommand(directory: string): Promise<SupervisedOutcome> {
  const row = registration(directory)
  const outcomePath = join(directory, 'outcome.json')
  while (true) {
    const state = await managerState(row.unit)
    if (existsSync(outcomePath)) {
      const outcome = parseOutcome(JSON.parse(readFileSync(outcomePath, 'utf8')), row.unit)
      if (state.LoadState !== 'not-found')
        await stopUnit(row.unit)
      return outcome
    }
    if (state.LoadState === 'not-found')
      throw new Error('The supervisor unit is unavailable. Preserve partial evidence; do not redispatch this registration.')
    if (state.SubState === 'exited' || state.ActiveState === 'failed' || state.ActiveState === 'inactive') {
      const exitCode = Number(state.ExecMainCode)
      const exitStatus = Number(state.ExecMainStatus)
      const outcome = parseOutcome({
        _tag: state.Result === 'success' && exitCode === 1 && exitStatus === 0 ? 'Completed' : 'Failed',
        unit: row.unit,
        result: state.Result,
        exitCode,
        exitStatus,
        completed: new Date().toISOString(),
      }, row.unit)
      try {
        writeFileSync(outcomePath, `${JSON.stringify(outcome, null, 2)}\n`, { flag: 'wx', mode: 0o400 })
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
          throw error
        // Reconnects can overlap. Return the first immutable observation without redispatching.
        continue
      }
      await stopUnit(row.unit)
      return outcome
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}
