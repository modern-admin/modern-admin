#!/usr/bin/env bun
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { scaffold } from './scaffold.js'

interface ParsedArgs {
  name?: string
  target?: string
  help?: boolean
}

const parseArgs = (argv: string[]): ParsedArgs => {
  const args: ParsedArgs = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--help' || a === '-h') args.help = true
    else if (a === '--name') args.name = argv[++i]
    else if (a === '--target') args.target = argv[++i]
    else if (!a.startsWith('-')) args.name = args.name ?? a
  }
  return args
}

const usage = (): string =>
  `create-modern-admin <name> [--target ./dir]

Scaffold a new Modern Admin project from the bundled template.

Options:
  --name <name>       Project name (also written to package.json).
  --target <dir>      Target directory. Defaults to ./<name>.
  -h, --help          Show this help.`

const main = async (argv: string[]): Promise<number> => {
  const args = parseArgs(argv)
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

const code = await main(process.argv.slice(2))
process.exit(code)
