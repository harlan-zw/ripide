import type { API, Diagnostic, Snapshot } from 'typescript-native/async'
import type { LspDiagnostic } from './ts-server.ts'
import type { FileChange } from './util.ts'
import { createFileSystemLayer } from 'typescript-native/fs'

function diagnosticMessage(diagnostic: Diagnostic, depth = 0): string {
  return [`${'  '.repeat(depth)}${diagnostic.text}`, ...(diagnostic.messageChain ?? []).map(child => diagnosticMessage(child, depth + 1))].join('\n')
}

async function diagnostics(snapshot: Snapshot, files: string[]): Promise<Map<string, LspDiagnostic[]>> {
  return new Map(await Promise.all(files.map(async (file) => {
    const project = await snapshot.getDefaultProjectForFile(file)
    if (!project)
      throw new Error(`ripide: no TypeScript project can check ${file}.`)
    const groups = await Promise.all([
      project.program.getSyntacticDiagnostics(file),
      project.program.getSemanticDiagnostics(file),
    ])
    return [file, groups.flat().filter(diagnostic => diagnostic.category === 1).map((diagnostic) => {
      if (!diagnostic.startPosition || !diagnostic.endPosition)
        throw new Error(`ripide: TypeScript returned an error without a source range for ${file}.`)
      return {
        range: { start: diagnostic.startPosition, end: diagnostic.endPosition },
        severity: 1,
        code: diagnostic.code,
        message: diagnosticMessage(diagnostic),
      }
    })] as const
  })))
}

/** Derive temporary programs from the live project without adopting the proposed edits. */
export async function snapshotDiagnostics(api: API<true>, changes: FileChange[], files: string[]) {
  await using base = await api.getCurrentLanguageServerSnapshot()
  await using before = await base.update({
    fileSystem: createFileSystemLayer(changes.map(change => [change.path, change.before])),
    openFiles: files,
    ensurePrograms: true,
  })
  await using after = await before.update({
    fileSystem: createFileSystemLayer(changes.map(change => [change.path, change.after])),
    ensurePrograms: true,
  })
  return { before: await diagnostics(before, files), after: await diagnostics(after, files) }
}
