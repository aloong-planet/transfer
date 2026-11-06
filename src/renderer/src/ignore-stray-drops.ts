// The page takes every drop it does not handle itself, so a file or link dropped anywhere but a drop target can never
// start a navigation of the window (electron-security::CON-002, ADR-0025); the main process cancels such a navigation
// anyway. The event is not stopped, so a drop target's own handler (the chat's message list) still receives it.
document.addEventListener('dragover', (event) => event.preventDefault())
document.addEventListener('drop', (event) => event.preventDefault())
