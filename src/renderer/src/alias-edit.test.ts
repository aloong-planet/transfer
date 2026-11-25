import { describe, test, expect } from 'vitest'
import { isUnchangedCommit } from './alias-edit'

// Every expected value below is worked out by hand from device-alias::REQ-001/AC-02. The untouched input
// (the same text, no spaces) is driven through the whole app in e2e/device-alias.spec.ts.
describe('isUnchangedCommit', () => {
  test.each([
    ['the same text with spaces around it', '  Alice-PC ', 'Alice-PC'],
    ['the same text over an announced name that has spaces around it', 'Alice-PC', ' Alice-PC ']
  ])('%s saves nothing', (_case, typed, opened) => {
    expect(isUnchangedCommit(typed, opened)).toBe(true)
  })

  test.each([
    ['the name with one letter changed', 'Alice-Pc', 'Alice-PC'],
    ['the name with a character added', 'Alice-PC2', 'Alice-PC'],
    ['an input of spaces only, which clears the alias even over a row that showed spaces only', '   ', '   ']
  ])('%s is saved', (_case, typed, opened) => {
    expect(isUnchangedCommit(typed, opened)).toBe(false)
  })
})
