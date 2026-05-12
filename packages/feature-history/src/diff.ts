// Diff utilities have moved to `@modern-admin/core` so the React layer
// can render the same field-level diff without round-tripping through
// the network. This file is kept as a thin re-export for backwards
// compatibility with existing imports inside this package.

export {
  computeFieldDiff,
  omitFields,
  stableStringify,
  valuesEqual,
  type FieldDiffEntry,
} from '@modern-admin/core'
