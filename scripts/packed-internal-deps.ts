type DependencySection = 'dependencies' | 'peerDependencies' | 'optionalDependencies'

export type DependencyManifest = Partial<Record<DependencySection, Record<string, string>>>

/** Compare the packed ranges with the source workspace protocols and current versions. */
export function packedInternalDependencyProblems(
  source: DependencyManifest,
  packed: DependencyManifest,
  versions: ReadonlyMap<string, string>,
): string[] {
  const problems: string[] = []
  for (const section of ['dependencies', 'peerDependencies', 'optionalDependencies'] as const) {
    const declared = source[section] ?? {}
    const published = packed[section] ?? {}
    const names = new Set([...Object.keys(declared), ...Object.keys(published)])
    for (const name of names) {
      if (!name.startsWith('@modern-admin/')) continue
      const version = versions.get(name)
      if (!version) {
        problems.push(`${section}.${name} has no current workspace version`)
        continue
      }
      if (declared[name] === undefined) {
        problems.push(`${section}.${name} was not declared in the source manifest`)
        continue
      }
      // Bun expands workspace:* to an exact version, and preserves the range
      // operator for workspace:^ and workspace:~. Keep rejecting stale versions.
      const expected =
        declared[name] === 'workspace:*'
          ? version
          : `${declared[name] === 'workspace:~' ? '~' : '^'}${version}`
      if (published[name] !== expected) {
        problems.push(`${section}.${name} = "${published[name]}" (expected "${expected}")`)
      }
    }
  }
  return problems
}
