// Which drags keep their default when the page takes stray drops (electron-security::CON-002). The targets are plain
// objects with the properties the rule reads from a DOM element; that the page-level guard hands the rule a real event's
// types and target is held by e2e/electron-security.spec.ts.
import { describe, expect, it } from 'vitest'
import { keepsDefaultDrop } from './drop-default'

const TEXT = ['text/plain']
const LINK = ['text/uri-list', 'text/plain']

describe('which drags keep their default (electron-security::CON-002)', () => {
  it.each([
    ['a text area', true, { tagName: 'TEXTAREA' }],
    ['a text input (also an input with no type, which reads as text)', true, { tagName: 'INPUT', type: 'text' }],
    ['a search input', true, { tagName: 'INPUT', type: 'search' }],
    ['a number input', true, { tagName: 'INPUT', type: 'number' }],
    ['a range slider', false, { tagName: 'INPUT', type: 'range' }],
    ['a checkbox', false, { tagName: 'INPUT', type: 'checkbox' }],
    ['any other element', false, { tagName: 'DIV' }],
    ['no element', false, null],
    ['a read-only text area', false, { tagName: 'TEXTAREA', readOnly: true }],
    ['a disabled input', false, { tagName: 'INPUT', type: 'text', disabled: true }]
  ])('text or a link dragged onto %s keeps its default, so it is inserted: %s', (_name, keeps, target) => {
    expect(keepsDefaultDrop(TEXT, target)).toBe(keeps)
    expect(keepsDefaultDrop(LINK, target)).toBe(keeps)
  })

  it.each([
    ['files alone', ['Files']],
    ['files from the desktop, which also carry their URLs', ['Files', 'text/uri-list']]
  ])('a drag of %s is taken by the page, even onto a text area', (_name, types) => {
    expect(keepsDefaultDrop(types, { tagName: 'TEXTAREA' })).toBe(false)
  })
})
