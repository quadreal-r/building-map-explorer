import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GITHUB_REPO,
  jsonArraySizeAfterAddingEntry,
  MAX_GIST_BYTES,
  MAX_PICTURE_CHUNK_BYTES,
  resolveGitHubRepo,
} from '@/lib/githubDeploySync'

describe('resolveGitHubRepo', () => {
  it('uses default when empty', () => {
    expect(resolveGitHubRepo()).toBe(DEFAULT_GITHUB_REPO)
    expect(resolveGitHubRepo('  ')).toBe(DEFAULT_GITHUB_REPO)
  })

  it('trims custom repo', () => {
    expect(resolveGitHubRepo(' org/repo ')).toBe('org/repo')
  })
})

describe('MAX_GIST_BYTES', () => {
  it('stays under GitHub gist guidance', () => {
    expect(MAX_GIST_BYTES).toBeLessThan(10 * 1024 * 1024)
  })
})

describe('jsonArraySizeAfterAddingEntry', () => {
  it('tracks JSON array growth for deploy picture entries', () => {
    expect(jsonArraySizeAfterAddingEntry(2, 0, 48)).toBe(50)
    expect(jsonArraySizeAfterAddingEntry(50, 1, 48)).toBe(99)
  })
})

describe('MAX_PICTURE_CHUNK_BYTES', () => {
  it('allows multiple photos per chunk without hitting the old 9 MB total cap', () => {
    expect(MAX_PICTURE_CHUNK_BYTES).toBeGreaterThan(7 * 1024 * 1024)
    expect(MAX_PICTURE_CHUNK_BYTES).toBeLessThan(MAX_GIST_BYTES)
  })
})
