// The page takes every drop it does not handle itself, so a file or link dropped anywhere but a drop target can never
// start a navigation of the window (electron-security::CON-002, ADR-0025); the main process cancels such a navigation
// anyway. Text dragged into a text field keeps its default, which inserts it (drop-default.ts). The event is not stopped,
// so a drop target's own handler (the chat's message list) still receives it.
import { keepsDefaultDrop } from './drop-default'

function takeStrayDrag(event: DragEvent): void {
  if (!keepsDefaultDrop(event.dataTransfer?.types ?? [], event.target)) event.preventDefault()
}

document.addEventListener('dragover', takeStrayDrag)
document.addEventListener('drop', takeStrayDrag)
