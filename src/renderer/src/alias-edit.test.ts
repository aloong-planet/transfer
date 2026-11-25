import { describe, test, expect } from 'vitest'
import { isUnchangedCommit } from './alias-edit'

// Every expected value below is worked out by hand from device-alias::REQ-001/AC-02.
describe('isUnchangedCommit', () => {
  test.each([
    ['the same text', 'Alice-PC', 'Alice-PC'],
    ['the same text with spaces around it', '  Alice-PC ', 'Alice-PC'],
    ['the same text with the spaces of an announced name taken off', 'Alice-PC', ' Alice-PC '],
    ['an announced name with spaces around it, committed as it was filled in', ' Alice-PC ', ' Alice-PC ']
  ])('%s saves nothing', (_case, typed, opened) => {
    expect(isUnchangedCommit(typed, opened)).toBe(true)
  })

  test.each([
    ['another name', '老张的电脑', 'Alice-PC'],
    ['the name with one letter changed', 'Alice-Pc', 'Alice-PC'],
    ['the name with a letter added', 'Alice-PC2', 'Alice-PC'],
    ['an empty input, which clears the alias', '', 'Alice-PC'],
    ['an input of spaces, which clears the alias', '   ', 'Alice-PC'],
    ['an empty input over a row that showed only spaces', '', '   ']
  ])('%s is saved', (_case, typed, opened) => {
    expect(isUnchangedCommit(typed, opened)).toBe(false)
  })
})
