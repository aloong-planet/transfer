/**
 * Whether committing `value` is the unchanged commit of device-alias::REQ-001/AC-04, given the name the row
 * showed when the input opened. An empty `value` never is: committing it clears the alias.
 */
export function isUnchangedCommit(value: string, openedWith: string): boolean {
  const typed = value.trim()
  return typed !== '' && typed === openedWith.trim()
}
