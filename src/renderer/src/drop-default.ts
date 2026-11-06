// Which drags keep the browser's own handling when the page takes stray drops (electron-security::CON-002, ADR-0025): a
// drag that carries no files, over a field the user types into, where dropping inserts the dragged text. Every other drag
// is taken by the page.

/** The parts of a drop target the rule reads; a DOM element supplies them */
interface DropTarget {
  tagName?: unknown
  type?: unknown
  readOnly?: unknown
  disabled?: unknown
}

/** Input types whose field takes typed text, and so dropped text (an input's `type` reads in lower case, `text` when unset) */
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'email', 'tel', 'password', 'number'])

export function keepsDefaultDrop(types: ArrayLike<string>, target: unknown): boolean {
  if (Array.from(types).includes('Files')) return false
  if (typeof target !== 'object' || target === null) return false
  const { tagName, type, readOnly, disabled } = target as DropTarget
  if (readOnly === true || disabled === true) return false
  if (tagName === 'TEXTAREA') return true
  return tagName === 'INPUT' && typeof type === 'string' && TEXT_INPUT_TYPES.has(type)
}
