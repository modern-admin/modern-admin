#!/usr/bin/env bun
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { readOwnVersion, scaffold, validateProjectName } from './scaffold.js'
import { generate, type Orm } from './generate.js'
import { setupUi } from './setup-ui.js'

interface ScaffoldArgs {
  command: 'scaffold'
  name?: string
  target?: string
  help?: boolean
}

interface GenerateArgs {
  command: 'generate'
  orm?: Orm
  schema?: string
  cwd?: string
  dryRun?: boolean
  help?: boolean
}

interface SetupUiArgs {
  command: 'setup-ui'
  cwd?: string
  dir?: string
  module?: string
  apiProxy?: string
  basePath?: string
  authBasePath?: string
  help?: boolean
}

interface HelpArgs {
  command: 'help'
}

type Args = ScaffoldArgs | GenerateArgs | SetupUiArgs | HelpArgs

const usage = (): string => `Modern Admin CLI

Commands:
  bun create @modern-admin <name> [--target ./dir]   Scaffold a new admin service.
  modern-admin generate [options]                    Add system tables to an existing project.
  modern-admin setup-ui [options]                    Create and connect a custom admin UI.

generate options:
  --orm prisma|drizzle    Force ORM (otherwise auto-detected).
  --schema <path>         Override target file.
                            Prisma default:  prisma/schema.prisma
                            Drizzle default: src/db/modern-admin-schema.ts
  --cwd <path>            Working directory (defaults to process.cwd()).
  --dry-run               Print the plan without writing.
  -h, --help              Show this help.

setup-ui options:
  --cwd <path>            Host project root (defaults to process.cwd()).
  --dir <path>            UI directory relative to cwd (default: ui).
  --module <path>         Nest module to patch (otherwise auto-detected under src/).
  --api-proxy <origin>    Backend origin for Vite dev (default: http://localhost:3001).
  --base-path <path>      Admin mount path (inferred from the Nest module; default: /admin).
  --auth-base-path <path> Better Auth mount path (inferred from runtimeConfig; default: /admin/api/auth).
  -h, --help              Show this help.`

const parse = (argv: string[]): Args => {
  if (argv.length === 0) return { command: 'help' }

  // Support both invocations:
  //   bun create @modern-admin <name>     → scaffold (via @modern-admin/create bin)
  //   modern-admin generate ...           → generate
  //   modern-admin setup-ui ...           → custom host-owned SPA
  const head = argv[0]!
  if (head === '--help' || head === '-h') return { command: 'help' }
  if (head === 'generate') return parseGenerate(argv.slice(1))
  if (head === 'setup-ui') return parseSetupUi(argv.slice(1))

  // Default: scaffold (matches the `bun create @modern-admin <name>` entry
  // point and the legacy `create-modern-admin <name>` bin still exposed for
  // back-compat).
  return parseScaffold(argv)
}

const takeValue = (argv: string[], index: number, option: string): string => {
  const value = argv[index + 1]
  if (!value || value.startsWith('-')) throw new Error(`${option} requires a value.`)
  return value
}

const parseScaffold = (argv: string[]): ScaffoldArgs => {
  const args: ScaffoldArgs = { command: 'scaffold' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--help' || a === '-h') args.help = true
    else if (a === '--name') args.name = argv[++i]
    else if (a === '--target') args.target = argv[++i]
    else if (!a.startsWith('-')) args.name = args.name ?? a
  }
  return args
}

const parseGenerate = (argv: string[]): GenerateArgs => {
  const args: GenerateArgs = { command: 'generate' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--help' || a === '-h') args.help = true
    else if (a === '--orm') {
      const v = argv[++i]
      if (v !== 'prisma' && v !== 'drizzle') {
        throw new Error(`--orm must be 'prisma' or 'drizzle', got ${v ?? '<missing>'}`)
      }
      args.orm = v
    } else if (a === '--schema') args.schema = argv[++i]
    else if (a === '--cwd') args.cwd = argv[++i]
    else if (a === '--dry-run') args.dryRun = true
  }
  return args
}

const parseSetupUi = (argv: string[]): SetupUiArgs => {
  const args: SetupUiArgs = { command: 'setup-ui' }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '--help' || arg === '-h') args.help = true
    else if (arg === '--cwd') args.cwd = takeValue(argv, i++, arg)
    else if (arg === '--dir') args.dir = takeValue(argv, i++, arg)
    else if (arg === '--module') args.module = takeValue(argv, i++, arg)
    else if (arg === '--api-proxy') args.apiProxy = takeValue(argv, i++, arg)
    else if (arg === '--base-path') args.basePath = takeValue(argv, i++, arg)
    else if (arg === '--auth-base-path') args.authBasePath = takeValue(argv, i++, arg)
    else throw new Error(`Unknown setup-ui option: ${arg}`)
  }
  return args
}

const runScaffold = async (args: ScaffoldArgs): Promise<number> => {
  if (args.help) {

    console.log(usage())
    return 0
  }
  const name = args.name?.trim()
  if (!name) {

    console.error(usage())
    return 1
  }
  // Reject unsafe names before they are used to build a filesystem path
  // (`../../x` escaping cwd) or substituted into generated JSON.
  try {
    validateProjectName(name)
  } catch (err) {

    console.error((err as Error).message)
    return 1
  }
  const here = dirname(fileURLToPath(import.meta.url))
  const templateDir = join(here, '..', 'template')
  const targetDir = resolve(args.target ?? `./${name}`)

  // Pin the scaffolded project's @modern-admin/* deps to the CLI's own
  // release line (see readOwnVersion) — the template carries a
  // `{{modernAdminVersion}}` token instead of a hardcoded version.
  const modernAdminVersion = await readOwnVersion(join(here, '..'))

  console.log(`Scaffolding "${name}" into ${targetDir}…`)
  const files = await scaffold({
    name,
    templateDir,
    targetDir,
    variables: { modernAdminVersion },
  })

  console.log(`Wrote ${files.length} files. Next steps:`)

  console.log(`  cd ${targetDir}`)

  console.log(`  bun install`)

  console.log(`  bun run dev`)
  return 0
}

const runGenerate = async (args: GenerateArgs): Promise<number> => {
  if (args.help) {

    console.log(usage())
    return 0
  }
  const result = await generate({
    orm: args.orm,
    schemaPath: args.schema,
    cwd: args.cwd,
    dryRun: args.dryRun,
  })
  const verb = args.dryRun ? 'Would add' : 'Added'

  console.log(`Target (${result.orm}): ${result.schemaPath}`)
  if (result.added.length > 0) {

    console.log(`${verb} (${result.added.length}): ${result.added.join(', ')}`)
  } else {

    console.log('Already up to date — nothing to add.')
  }
  if (result.skipped.length > 0) {

    console.log(`Skipped (${result.skipped.length}): ${result.skipped.join(', ')}`)
  }
  return 0
}

const runSetupUi = async (args: SetupUiArgs): Promise<number> => {
  if (args.help) {
    console.log(usage())
    return 0
  }
  const result = await setupUi({
    cwd: args.cwd,
    uiDir: args.dir,
    modulePath: args.module,
    apiProxy: args.apiProxy,
    basePath: args.basePath,
    authBasePath: args.authBasePath,
  })
  if (result.createdFiles.length > 0) {
    console.log(`Created custom UI in ${result.uiDir} (${result.createdFiles.length} files).`)
  } else {
    console.log(`Custom UI already exists in ${result.uiDir}; preserved its files.`)
  }
  if (result.packageJsonChanged) console.log('Updated host package.json dependencies and scripts.')
  if (result.moduleChanged) console.log(`Connected the bundle in ${result.modulePath}.`)
  console.log('Next steps:')
  console.log('  bun install')
  console.log('  bun run ui:build')
  console.log('  bun run dev')
  console.log('For React Fast Refresh, run `bun run ui:dev` alongside the backend.')
  return 0
}

const main = async (argv: string[]): Promise<number> => {
  let parsed: Args
  try {
    parsed = parse(argv)
  } catch (err) {

    console.error((err as Error).message)
    return 1
  }
  if (parsed.command === 'help') {

    console.log(usage())
    return 0
  }
  try {
    if (parsed.command === 'scaffold') return await runScaffold(parsed)
    if (parsed.command === 'generate') return await runGenerate(parsed)
    return await runSetupUi(parsed)
  } catch (err) {
    console.error((err as Error).message)
    return 1
  }
}

const code = await main(process.argv.slice(2))
process.exit(code)
