// Test infrastructure for language.spec.ts. Loaded into the main process before the app's own code (`electron -r`), it
// wraps ipcMain.handle so that the answer to the language lookup waits until the test releases it; every other handler is
// registered as the app wrote it. The page therefore stays in the state it first rendered in, from the launch itself.
// It wraps registration instead of replacing a handler afterwards, so it cannot race the app's start.
//
// 'settings:getLanguage' is CMD.getLanguage (src/shared/ipc.ts). A rename leaves this hold without effect, and the
// spec's check that the lookup is held fails.
const { ipcMain } = require('electron')

let release
const gate = new Promise((resolve) => {
  release = resolve
})
globalThis.releaseLanguageLookup = release

const handle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) =>
  handle(
    channel,
    channel === 'settings:getLanguage'
      ? async (...args) => {
          await gate
          return listener(...args)
        }
      : listener
  )
