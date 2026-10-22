import { describe, expect, test } from 'bun:test'
import { packedInternalDependencyProblems } from '../packed-internal-deps.js'

const dependency = '@modern-admin/auth-better-auth'
const versions = new Map([[dependency, '0.13.0']])

describe('packed internal dependencies', () => {
  test.each([
    ['workspace:*', '0.13.0'],
    ['workspace:^', '^0.13.0'],
    ['workspace:~', '~0.13.0'],
  ])('accepts the current Bun expansion of %s', (protocol, range) => {
    expect(
      packedInternalDependencyProblems(
        { dependencies: { [dependency]: protocol } },
        { dependencies: { [dependency]: range } },
        versions,
      ),
    ).toEqual([])
  })

  test.each(['dependencies', 'peerDependencies', 'optionalDependencies'] as const)(
    'rejects stale exact versions in %s',
    (section) => {
      expect(
        packedInternalDependencyProblems(
          { [section]: { [dependency]: 'workspace:*' } },
          { [section]: { [dependency]: '0.12.0' } },
          versions,
        ),
      ).toEqual([`${section}.${dependency} = "0.12.0" (expected "0.13.0")`])
    },
  )

  test.each(['^0.12.0', 'workspace:^', '0.13.0'])(
    'rejects stale or incorrectly expanded caret range %s',
    (range) => {
      expect(
        packedInternalDependencyProblems(
          { dependencies: { [dependency]: 'workspace:^' } },
          { dependencies: { [dependency]: range } },
          versions,
        ),
      ).toHaveLength(1)
    },
  )

  test('rejects a dependency omitted from the tarball', () => {
    expect(
      packedInternalDependencyProblems(
        { dependencies: { [dependency]: 'workspace:*' } },
        {},
        versions,
      ),
    ).toHaveLength(1)
  })

  test('rejects unknown or injected internal dependencies', () => {
    expect(
      packedInternalDependencyProblems(
        { dependencies: { [dependency]: 'workspace:*' } },
        { dependencies: { [dependency]: '0.13.0' } },
        new Map(),
      ),
    ).toHaveLength(1)
    expect(
      packedInternalDependencyProblems({}, { dependencies: { [dependency]: '^0.13.0' } }, versions),
    ).toHaveLength(1)
  })
})
