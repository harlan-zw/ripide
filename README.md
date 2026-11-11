<div align="center">

<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./branding/logo-dark.svg?v=ripide">
    <img src="./branding/logo-light.svg?v=ripide" alt="RipIDE" width="432" height="112">
  </picture>
</h1>

[![npm version](https://img.shields.io/npm/v/ripide?style=flat-square&labelColor=334155&color=334155)](https://npmjs.com/package/ripide)
[![npm downloads](https://img.shields.io/npm/dm/ripide?style=flat-square&labelColor=334155&color=334155)](https://npm.chart.dev/ripide)
[![license](https://img.shields.io/github/license/harlan-zw/ripide?style=flat-square&labelColor=334155&color=334155)](https://github.com/harlan-zw/ripide/blob/main/LICENSE.md)
[![Agent skill on skilld.dev](https://img.shields.io/badge/Skill_repo-skilld.dev-334155?style=flat-square&labelColor=334155)](https://skilld.dev/gh/harlan-zw/ripide)

> Typesafe IDE-like refactoring for agents.

<p><sub>Made possible by my <a href="https://github.com/sponsors/harlan-zw">Sponsor Program 💖</a><br>
Follow me <a href="https://twitter.com/harlan_zw">@harlan_zw</a> 🐦 • Join <a href="https://discord.gg/275MBUBvgP">Discord</a> for help</sub></p>

</div>

## Why RipIDE?

When you rename a function in your IDE, it updates the references for you.
RipIDE aims to bring that same refactoring magic to your agent.

One command handles the references and edits.
Recorded source-slice tasks used fewer total tokens. Results depend on the task and model.

<img src="./branding/refactor-menu.png" alt="WebStorm refactoring actions mapped to RipIDE terminal commands" width="1600">

## Features

- ✂️ **IDE refactoring for your agent.** Rename functions, move files, and automatically update references across your project.
- 📉 **Measured mechanical tasks.** [Local source-slice tests](./bench/README.md) recorded token and time reductions for symbol and static class renames.
- 🪨 Built on [TypeScript 7.1 (beta)](https://github.com/microsoft/TypeScript), [Oxc](https://oxc.rs), [Ripgrep](https://github.com/BurntSushi/ripgrep), and [Volar](https://volarjs.dev).
- 🦎 Works with **Vue, Nuxt, React, and Solid**, plus plain TypeScript and JavaScript. Optional [Octane TSRX support](./packages/tsrx/README.md) covers authored-source scans and semantic renames.
- 🧰 **One command, many files.** Move exports, replace imports, delete unused declarations, or migrate CSS classes across your project.
- 🪂 **Preview first.** Dry runs show the diff; [type checking](#verify) blocks supported refactors that introduce errors.

## Installation

Requires Node 24+.

1. Install RipIDE:

   ```bash
   npm install -g ripide
   ```

2. Install the [RipIDE Agent Skill](./packages/cli/skills/ripast/SKILL.md) in your project with your preferred installer:

   With [skilld](https://skilld.dev/gh/harlan-zw/ripide):

   ```bash
   npx skilld add ripide
   ```

   Or with [skills.sh](https://skills.sh):

   ```bash
   npx skills add harlan-zw/ripide --skill ripast
   ```

3. Ask your coding agent:

   ```text
   Find better names for functions.
   ```

RipIDE uses ripgrep when available. You do not need to install it.
If ripgrep is missing, Git discovers tracked and untracked files in the working tree.
Searches read current file contents, including local edits. Git ignore rules exclude untracked files.
Globs filter candidate paths. Git does not apply `.ignore` or `.rgignore`, or exclude tracked files through ignore rules.
Run separately inside submodules and nested repositories when using the Git fallback.

If both tools are missing, or Git has no working tree, RipIDE searches files in Node.
This fallback can be slower. It supports fixed-string searches, file listing, globs, and standard ignore files.
Programmatic regex searches use ripgrep syntax when available, or Git extended regular expressions with the Git fallback.
Regex searches require ripgrep, or Git and a Git working tree.

### Cursor and Claude Code

Requires Node 24+, pnpm, and an agent with shell access.
Run from your project root:

```bash
npm install -g ripide
pnpm dlx skills add harlan-zw/ripide --skill ripast --agent cursor claude-code --yes
```

Then ask in Agent chat or Claude Code:

```text
/ripast Preview renaming useStore to useAppStore.
```

The CLI is named `ripide`. The Agent Skill is named `ripast`.
The installer adds the Skill and its references for both clients.
For manual installation, copy the whole [Skill directory](./packages/cli/skills/ripast), including `references/`:

| Client | Project directory |
| --- | --- |
| [Cursor](https://cursor.com/docs/skills) | `.cursor/skills/ripast/` |
| [Claude Code and its IDE extension](https://code.claude.com/docs/en/skills) | `.claude/skills/ripast/` |

RipIDE runs through the agent's shell. It includes no MCP server or MCP configuration.
Each CLI invocation uses its current working directory.
If you switch projects or monorepo packages, run from the intended root.

## Usage

Run commands from your project root. Preview changes, then pass `--apply` to write them:

```bash
ripide rename useStore useAppStore
ripide rename useStore useAppStore --apply
```

Use `--profile full` to see the full diff in an agent environment.
See the [Usage reference](./docs/usage.md) for advanced options, output formats, and saved evidence.

### What can RipIDE do?

<details>
<summary><b>🔍 Find every usage of a symbol</b></summary>

Find matching identifiers, strings, properties, and JSX references.
The scan includes Vue template interpolations and directive expressions.

```bash
ripide scan useStore
ripide scan useStore --kind identifier-reference,import-specifier
ripide scan useStore --graph mermaid
```

`--graph mermaid|dot` draws relative import/export edges between hit files for quick triage.

</details>

<details>
<summary><b>✏️ Rename a symbol across the repo</b></summary>

Rename references using the native TypeScript 7 language server, including imports, JSX, types, and aliases.
Property keys change only when they refer to the same symbol.

```bash
# Preview the changes
ripide rename useStore useAppStore

# Write changes after type checking
ripide rename useStore useAppStore --apply

# Ambiguous declarations? Pick one or rename all
ripide rename useStore useAppStore --scope src/store.ts --apply
ripide rename useStore useAppStore --all --apply
```

Imports and references change together. The unrelated string keeps its spelling:

```diff
# src/store.ts
-export function useStore() { return 1 }
+export function useAppStore() { return 1 }
# src/consumer.ts
-import { useStore } from './store.js'
-export const value = useStore()
+import { useAppStore } from './store.js'
+export const value = useAppStore()
 export const label = 'useStore'
```

</details>

<details>
<summary><b>🔁 Replace an imported symbol with another export</b></summary>

Replace an imported binding with a project export, such as replacing `eventHandler(...)` with `defineAdminApiHandler(...)`.
RipIDE updates references and imports, then removes the old import.
It preserves the call arguments and function body.

```bash
ripide replace eventHandler defineAdminApiHandler --apply

# If several exports match, select the target file
ripide replace eventHandler defineAdminApiHandler --target-scope server/admin.ts --apply
```

Use `--source-scope` to select the original provider and `--target-import` to set an import path.
Review import paths in the preview. See the [Usage reference](./docs/usage.md#what-can-ripide-do) for provider selection and supported source shapes.

</details>

<details>
<summary><b>🏔️ Refactor Nuxt auto-imports</b></summary>

Run `nuxi prepare` first to generate Nuxt's type declarations.
RipIDE uses these files to resolve auto-imported composables, utilities, and components used in pages and other consumers.
If a move requires an explicit import in a Vue file without a script block, RipIDE refuses it.

```bash
# A composable used in pages with no explicit import
ripide rename useCounter useTally --tsconfig .nuxt/tsconfig.json --apply

# Moving out of utils/composables/components adds explicit imports to consumers
ripide move format --from utils/format.ts --to lib/format.ts --apply
```

</details>

<details>
<summary><b>📦 Move an exported declaration</b></summary>

Move a top-level export and update its imports.
RipIDE splits declarations such as `export const a = 1, b = 2` and preserves aliases.
It copies required imports and removes unused ones. If the symbol depends on a local, unexported helper, it refuses the move.

```bash
ripide move helper --from src/utils/a.ts --to src/utils/helpers.ts --apply
```

</details>

<details>
<summary><b>📁 Rename a file and update every import</b></summary>

Update import paths when moving or renaming a file.
The Vue adapter also updates component tags in PascalCase and kebab-case.

```bash
ripide rename-file src/utils.ts src/lib/helpers.ts --apply
```

</details>

<details>
<summary><b>🧹 Delete an unused declaration</b></summary>

Delete a top-level declaration after checking for references, then remove imports used only by that declaration.
If references remain, RipIDE prints their locations and refuses the deletion.
Omit `--apply` to preview the changes.

```bash
ripide delete helper --from src/utils.ts
ripide delete helper --from src/utils.ts --apply
```

</details>

<details>
<summary><b>🎨 Migrate Tailwind / CSS class tokens</b></summary>

Rename class tokens in string literals, Vue `class` and `:class` attributes, and CSS `@apply` directives.
RipIDE preserves variant prefixes (`hover:`, `dark:md:`), `!` important markers, and arbitrary values.

```bash
# Single pair
ripide css-class-rename bg-gray-500 bg-neutral-500 --apply

# Bulk design-token migration
ripide css-class-rename --map tokens.json --apply

# Seed the map by listing every class in the repo
ripide css-class-scan --json > tokens.raw.json

# Find barely used classes to clean up
ripide css-class-scan --sort count-asc

# Find files introducing the most unique class tokens
ripide css-class-scan --by file
```

</details>

<details>
<summary><b>🎨 Rename CSS custom properties</b></summary>

Rename declarations, `@property` registrations, and `var()` references in styles and static JS/TS strings.
Use `--` before custom property names so the CLI does not read them as options.

```bash
ripide css-custom-property-rename -- --foo-a --theme-b
ripide css-custom-property-rename --apply -- --foo-a --theme-b
```

Dynamic names stay unchanged. Review warnings and result `limitations`, then run your project's checks after applying.
Value-only strings such as `"--foo-a 1s"` stay unchanged and receive source warnings for review.
This command does not typecheck or compile styles.
See the [Usage reference](./docs/usage.md#what-can-ripide-do) for supported sources and warning examples.

</details>

<details>
<summary><b>🌳 Print a project declaration tree</b></summary>

List declarations by file. Use `--exports exported` for exports or `--exports local` for declarations without exports.

```bash
ripide tree --exports exported
ripide tree --exports local --glob '*.ts'
```

In agent environments (`std-env`'s `isAgent`), defaults to a compact architecture summary.

</details>

<details>
<summary><b>🔎 Find unreferenced top-level declarations</b></summary>

Report top-level declarations with no semantic project references.
Review each result before deleting it. External callers, frameworks, dynamic registries, and entrypoints may still use these declarations.

```bash
ripide unused
ripide unused --exports local
ripide unused --exports all --json
```

</details>

<details>
<summary><b>🔎 Check app/server runtime imports</b></summary>

An app/server runtime import connects files classified as app and server code.
The check reports resolved relative runtime imports across those groups.
Classification uses file paths and `.server` or `.client` filename suffixes.
Type-only imports, aliases, unresolved imports, and unclassified files are excluded.
App code can also run on the server. The check does not prove runtime isolation.

```bash
ripide doctor --checks cross-realm-import
```

</details>

<details>
<summary><b>🤖 Drive from an AI agent</b></summary>

Use `--json` for machine-readable output. Add `--profile full` for complete source content.
The `_tag` field reports the outcome: `Preview`, `Applied`, `Refused`, `Empty`, `Result`, or `Error`.
If verification finds new type errors, RipIDE refuses `--apply` and exits with a non-zero status.

```bash
ripide rename useStore useAppStore --apply --json
```

See the [JSON contract](./docs/api-contracts.md) for response fields and verification receipts.

</details>

### Verify

`rename`, `replace`, `move`, `delete`, and `rename-file` check for new type errors before writing.
Replacement checks the project by default. Other refactors check touched files.
Use `--verify-mode project` to include unchanged consumers, or `--verify-mode none` to skip checks.

Verification compares TypeScript or Vue diagnostics. It does not run a build or tests.
CSS renames do not run a typecheck. Run your project's checks after applying them.
See [verification details](./docs/usage.md#verify) for scope and receipts.

### Profiles

Text output uses compact summaries in agent environments and full diffs in terminals.
JSON output is compact by default. Use `--profile agent` or `--profile full` to choose explicitly.

### Output limits

Limits affect displayed results. Discovery, verification, and applied changes remain complete.
If output is incomplete, follow `nextOffset` or save complete evidence with `--json --artifact <new-file.json>`.
The artifact path must be new.

See [output limits](./docs/usage.md#output-limits) for paging options and byte ceilings.

### Read saved evidence

Save the result once, then inspect it without repeating the operation:

```bash
ripide tree --json --artifact /tmp/ripide-tree.json
ripide page --input /tmp/ripide-tree.json
ripide page --input /tmp/ripide-tree.json --path /files/0/declarations
```

Choose paths from the page menu. Follow `data.view.nextOffset` for more results.
See [saved evidence](./docs/usage.md#read-saved-evidence) for filters, source ranges, and sessions.

## Commands

| Command | Purpose |
| --- | --- |
| `ripide scan <pattern>` | Classify every occurrence (identifier vs string vs property vs JSX). Optional `--graph mermaid\|dot`. |
| `ripide tree` | Print a project declaration tree, grouped by file. |
| `ripide unused` | Find unreferenced top-level declarations. |
| `ripide page --input <file.json>` | Page saved JSON evidence without repeating its operation. |
| `ripide rename <from> <to>` | Scope-aware symbol rename via the native TypeScript server. |
| `ripide replace <from> <to>` | Replace an imported symbol with another project export; rewrites imports and references. |
| `ripide move <symbol> --from <a> --to <b>` | Move a top-level export and rewrite every import site. |
| `ripide delete <symbol> --from <file>` | Delete an unused top-level declaration; refuses if references remain. |
| `ripide rename-file <old> <new>` | Rename a file and rewrite every import site (including `.vue` consumers). |
| `ripide css-class-rename <from> <to> \| --map <file.json>` | Rename tailwind/CSS utility class tokens repo-wide. |
| `ripide css-custom-property-rename -- <from> <to>` | Rename exact custom properties. Review dynamic warnings. |
| `ripide css-class-scan` | List class tokens; use `--sort count-asc` for rare tokens or `--by file` for files with the most unique classes. |

Run `ripide --help` for all commands, or `ripide <command> --help` for its options.

## Programmatic API

The SDK uses an isolated engine. Core supports TypeScript and JavaScript without framework dependencies.

```ts
import { createEngine } from 'ripide-api'

const engine = createEngine()
const hits = engine.scan('useStore', { cwd: process.cwd() })
const result = await engine.rename('useStore', 'useAppStore', { cwd: process.cwd() })
engine.commit(result)
```

Supply framework extensions explicitly:

```ts
import { createEngine } from 'ripide-api'
import { createVueExtension } from 'ripide-vue'

const engine = createEngine({ extensions: [createVueExtension()] })
const result = await engine.rename('useStore', 'useAppStore', { cwd: process.cwd() })
engine.commit(result)
```

The CLI loads relevant optional packages. The SDK never loads optional packages automatically.
Read the [extension contract and migration guide](./docs/engine.md) before adding a language.

The optional SDK `profile` callback receives phase timing events during rename and move operations.
Each `ProfileEvent` provides `phase` and elapsed milliseconds in `ms`.
CLI `--profile auto|agent|full` selects output detail; it does not collect phase timings.

Reuse declaration analysis during repeated SDK inspection:

```ts
import { buildDeclarationTree, createDeclarationCache } from 'ripide-api'

const cache = createDeclarationCache({ maxEntries: 1024, maxBytes: 16 * 1024 * 1024 })
const tree = buildDeclarationTree({ cwd: process.cwd(), cache })
const exported = buildDeclarationTree({ cwd: process.cwd(), cache, exports: 'exported' })
console.log(cache.stats())
cache.clear()
```

Each inspection discovers files again and checks their current content.
The cache retains declaration metadata, imports, and re-exports. It does not retain type or reference results.
It also works with `buildUnusedDeclarations`; only declaration analysis is cached.
Instances belong to the caller. Independent CLI processes do not share this cache.

## Limitations

**CSS custom properties.** Use `css-custom-property-rename` for declarations, `var()` references, and static JS/TS strings.
Review source warnings and result `limitations`. Opaque runtime names require a separate search and project checks.

**Scoping with `--glob`.** Pass comma-separated patterns. Prefix a pattern with `!` to exclude matching files:

```bash
ripide tree --exports exported --glob '*.ts,*.vue,!.nuxt/**,!**/*.d.ts,!**/dist/**'
```

**Nuxt projects.** Point `--tsconfig` at the generated config so path aliases and layer references resolve correctly:

```bash
# After `nuxi prepare`
ripide rename useFoo useBar --tsconfig .nuxt/tsconfig.json --apply
ripide tree --exports exported --glob '*.ts,*.vue,!.nuxt/**'
```

`ripide components` reads `.nuxt/components.d.ts` when available. Without it, the command discovers components from file paths.

**Encoding.** RipIDE assumes UTF-8 + LF. CRLF and BOM files are untested; convert with `dos2unix` / strip BOM before running mutating commands.

## Credits

- [TypeScript 7](https://github.com/microsoft/TypeScript): native language server behind rename, references, file renames, and verification.
- [Volar](https://github.com/volarjs/volar.js) + [@vue/language-tools](https://github.com/vuejs/language-tools): cross-`.vue` rename and diagnostics.
- [oxc](https://github.com/oxc-project/oxc): fast parser for template-expression classification.
- [Ripgrep](https://github.com/BurntSushi/ripgrep): finds candidate files before parsing, with Git and Node fallbacks.

## License

Licensed under the [MIT license](https://github.com/harlan-zw/ripide/blob/main/LICENSE.md).

## Agent benchmarks

Forty runs compared RipIDE with ordinary editing on ten matched source-slice tasks using both models.
Five tasks renamed TypeScript symbols. Five migrated static Vue class tokens.
RipIDE passed **20/20** runs. Ordinary editing passed **19/20**.

| Model | Completed pairs | Fewer total tokens | Less total time |
| --- | --- | --- | --- |
| GPT-6 Luna, medium | 9 | 60.4% | 15.4% |
| GLM 5.3 Flash | 10 | 73.9% | 55.4% |

Percentages compare completed pairs within each model. One run per combination used source slices, with fixed method order per model.
Total tokens include cached input once. Installation, Skill loading, generated state, and full builds were excluded.
These observations do not establish architecture gains or dollar savings.
See [full results, methods, and limits](./bench/README.md) and the [recovery protocol](./evals/experiment/README.md).
