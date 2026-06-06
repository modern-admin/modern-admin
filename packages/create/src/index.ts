// Programmatic entry for @modern-admin/create. The CLI lives in src/cli.ts.

export { scaffold, renderTemplate, type ScaffoldOptions } from './scaffold.js'
export {
  generate,
  parsePrismaModels,
  listPrismaModels,
  appendPrismaModels,
  type GenerateOptions,
  type GenerateResult,
  type Orm,
} from './generate.js'
