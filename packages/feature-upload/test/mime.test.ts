import { describe, it, expect } from 'bun:test'
import { mimeMatches } from '../src/mime.js'

describe('mimeMatches', () => {
  it('allows everything when no patterns are configured', () => {
    expect(mimeMatches('application/x-msdownload', undefined)).toBe(true)
    expect(mimeMatches('application/x-msdownload', [])).toBe(true)
    expect(mimeMatches('anything/at-all', null)).toBe(true)
  })

  it('matches exact types', () => {
    expect(mimeMatches('image/jpeg', ['image/jpeg', 'application/pdf'])).toBe(true)
    expect(mimeMatches('image/png', ['image/jpeg', 'application/pdf'])).toBe(false)
  })

  it('matches type wildcards', () => {
    expect(mimeMatches('image/png', ['image/*'])).toBe(true)
    expect(mimeMatches('video/mp4', ['image/*'])).toBe(false)
  })

  it('matches the catch-all', () => {
    expect(mimeMatches('anything/here', ['*/*'])).toBe(true)
    expect(mimeMatches('anything/here', ['*'])).toBe(true)
  })

  it('ignores parameters and is case-insensitive', () => {
    expect(mimeMatches('IMAGE/JPEG; charset=binary', ['image/jpeg'])).toBe(true)
    expect(mimeMatches('image/jpeg', ['IMAGE/*'])).toBe(true)
  })

  it('rejects an empty / malformed declared type against a restriction', () => {
    expect(mimeMatches('', ['image/*'])).toBe(false)
  })
})
