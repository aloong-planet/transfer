// A file or link dropped anywhere on the page but a drop target does nothing (electron-security::CON-002, ADR-0025).
// Chromium's default for an unhandled drop is to navigate the window to what was dropped; the main process cancels such a
// navigation anyway, and this keeps the page from starting one. It does not stop the event, so a drop target's own
// handler (the chat's message list) still receives it.
document.addEventListener('dragover', (event) => event.preventDefault())
document.addEventListener('drop', (event) => event.preventDefault())
