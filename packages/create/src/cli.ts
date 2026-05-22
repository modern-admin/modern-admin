#!/usr/bin/env bun
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { scaffold } from './scaffold.js'
import { generate, type Orm } from './generate.js'

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

interface HelpArgs {
  command: 'help'
}

type Args = ScaffoldArgs | GenerateArgs | HelpArgs

const usage = (): string => `Modern Admin CLI

Commands:
  bun create @modern-admin <name> [--target ./dir]   Scaffold a new admin service.
  modern-admin generate [options]                    Add system tables to an existing project.

generate options:
  --orm prisma|drizzle    Force ORM (otherwise auto-detected).
  --schema <path>         Override target file.
                            Prisma default:  prisma/schema.prisma
                            Drizzle default: src/db/modern-admin-schema.ts
  --cwd <path>            Working directory (defaults to process.cwd()).
  --dry-run               Print the plan without writing.
  -h, --help              Show this help.`

const parse = (argv: string[]): Args => {
  if (argv.length === 0) return { command: 'help' }

  // Support both invocations:
  //   bun create @modern-admin <name>     → scaffold (via @modern-admin/create bin)
  //   modern-admin generate ...           → generate
  const head = argv[0]!
  if (head === '--help' || head === '-h') return { command: 'help' }
  if (head === 'generate') return parseGenerate(argv.slice(1))

  // Default: scaffold (matches the `bun create @modern-admin <name>` entry
  // point and the legacy `create-modern-admin <name>` bin still exposed for
  // back-compat).
  return parseScaffold(argv)
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

const runScaffold = async (args: ScaffoldArgs): Promise<number> => {
  if (args.help) {
    // eslint-disable-next-line no-console
    console.log(usage())
    return 0
  }
  const name = args.name?.trim()
  if (!name) {
    // eslint-disable-next-line no-console
    console.error(usage())
    return 1
  }
  const here = dirname(fileURLToPath(import.meta.url))
  const templateDir = join(here, '..', 'template')
  const targetDir = resolve(args.target ?? `./${name}`)
  // eslint-disable-next-line no-console
  console.log(`Scaffolding "${name}" into ${targetDir}…`)
  const files = await scaffold({ name, templateDir, targetDir })
  // eslint-disable-next-line no-console
  console.log(`Wrote ${files.length} files. Next steps:`)
  // eslint-disable-next-line no-console
  console.log(`  cd ${targetDir}`)
  // eslint-disable-next-line no-console
  console.log(`  bun install`)
  // eslint-disable-next-line no-console
  console.log(`  bun run dev`)
  return 0
}

const runGenerate = async (args: GenerateArgs): Promise<number> => {
  if (args.help) {
    // eslint-disable-next-line no-console
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
  // eslint-disable-next-line no-console
  console.log(`Target (${result.orm}): ${result.schemaPath}`)
  if (result.added.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`${verb} (${result.added.length}): ${result.added.join(', ')}`)
  } else {
    // eslint-disable-next-line no-console
    console.log('Already up to date — nothing to add.')
  }
  if (result.skipped.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`Skipped (${result.skipped.length}): ${result.skipped.join(', ')}`)
  }
  return 0
}

const main = async (argv: string[]): Promise<number> => {
  let parsed: Args
  try {
    parsed = parse(argv)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error((err as Error).message)
    return 1
  }
  if (parsed.command === 'help') {
    // eslint-disable-next-line no-console
    console.log(usage())
    return 0
  }
  if (parsed.command === 'scaffold') return runScaffold(parsed)
  return runGenerate(parsed)
}

const code = await main(process.argv.slice(2))
process.exit(code)
