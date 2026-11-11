import type { EngineServices } from './engine.ts'
import type { TsServer } from './ts-server.ts'
import type { FileChange } from './util.ts'
import type { DiagnosticRecorder } from './verification.ts'
import { diagnosticRegressions } from './diagnostic-matching.ts'
import { findFiles } from './util.ts'

export interface Regression {
  file: string
  line: number
  col: number
  code: number
  message: string
}

/** Verify every relevant extension, including unchanged authored consumers. */
export async function findExtensionRegressions(cwd: string, changes: FileChange[], tsconfigPath: string | null, engine?: EngineServices, recorder?: (name: string) => DiagnosticRecorder): Promise<Regression[]> {
  if (!changes.length || !engine?.extensions.length)
    return []
  const regressions: Regression[] = []
  for (const extension of engine.extensions) {
    // Custom verifiers run after hooks at the engine's final verification boundary.
    if (extension.verify)
      continue
    if (!findFiles('', { cwd, glob: extension.suffixes.map(suffix => `*${suffix}`), listAll: true }).length)
      continue
    if (!extension.semantic)
      throw new Error(`Extension ${extension.name} cannot verify consumers`)
    if (!tsconfigPath)
      throw new Error('Extension verification requires a tsconfig. Prepare the project before applying changes.')
    regressions.push(...await extension.semantic.regressions(tsconfigPath, cwd, changes, recorder?.(extension.semantic.name)))
  }
  return regressions
}

/**
 * Compare native compiler snapshots of the original and proposed source.
 * Files that do not exist on disk are supplied through filesystem layers.
 * The live language server and files on disk stay unchanged.
 */
export async function findRegressions(server: TsServer, changes: FileChange[], files: string[], onChecked?: DiagnosticRecorder): Promise<Regression[]> {
  const scope = [...new Set([...files, ...changes.map(c => c.path)])]
  const { before, after } = await server.compareDiagnostics(changes, scope)
  const out = diagnosticRegressions(before, after, changes)
  onChecked?.({ files: scope.length, newErrors: out.length })
  return out
}
