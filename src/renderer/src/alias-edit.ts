/**
 * Whether committing the alias input stores nothing (device-alias::REQ-001/AC-02): what is in it is the
 * name the row showed when the input opened, with surrounding spaces ignored on both sides.
 *
 * An empty input is never unchanged: committing it clears the alias, whatever the row showed.
 */
export function isUnchangedCommit(value: string, openedWith: string): boolean {
  const typed = value.trim()
  return typed !== '' && typed === openedWith.trim()
}
