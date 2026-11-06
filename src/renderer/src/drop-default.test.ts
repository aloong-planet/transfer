// Which drags keep their default when the page takes stray drops (electron-security::CON-002). The targets are plain
// objects with the properties the rule reads from a DOM element; that the page-level guard hands the rule a real event's
// types and target is held by e2e/electron-security.spec.ts.
import { describe, expect, it } from 'vitest'
import { keepsDefaultDrop } from './drop-default'

const TEXT = ['text/plain']
const LINK = ['text/uri-list', 'text/plain']

describe('which drags keep their default (electron-security::CON-002)', () => {
  it.each([
    ['a text area', { tagName: 'TEXTAREA' }],
    ['a text input (also an input with no type, which reads as text)', { tagName: 'INPUT', type: 'text' }],
    ['a search input', { tagName: 'INPUT', type: 'search' }],
    ['a number input', { tagName: 'INPUT', type: 'number' }]
  ])('text or a link dragged onto %s keeps its default, which inserts it', (_name, target) => {
    expect(keepsDefaultDrop(TEXT, target)).toBe(true)
    expect(keepsDefaultDrop(LINK, target)).toBe(true)
  })

  it.each([
    ['a range slider', { tagName: 'INPUT', type: 'range' }],
    ['a checkbox', { tagName: 'INPUT', type: 'checkbox' }],
    ['any other element', { tagName: 'DIV' }],
    ['no element', null],
    ['a read-only text area', { tagName: 'TEXTAREA', readOnly: true }],
    ['a disabled input', { tagName: 'INPUT', type: 'text', disabled: true }]
  ])('text or a link dragged onto %s is taken by the page', (_name, target) => {
    expect(keepsDefaultDrop(TEXT, target)).toBe(false)
    expect(keepsDefaultDrop(LINK, target)).toBe(false)
  })

  it.each([
    ['files alone', ['Files']],
    ['files from the desktop, which also carry their URLs', ['Files', 'text/uri-list']]
  ])('a drag of %s is taken by the page, even onto a text area', (_name, types) => {
    expect(keepsDefaultDrop(types, { tagName: 'TEXTAREA' })).toBe(false)
  })
})
