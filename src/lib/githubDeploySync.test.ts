import { describe, expect, it } from 'vitest'
import { DEFAULT_GITHUB_REPO, MAX_GIST_BYTES, resolveGitHubRepo } from '@/lib/githubDeploySync'

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
