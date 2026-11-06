// The wiring of Transfer's Electron security baseline (docs/specs/electron-security.md, ADR-0025): every web contents is
// kept on Transfer's own pages, every IPC handler answers only Transfer's own main frames, and the default session grants
// no permission but clipboard writing to Transfer's own pages. The decisions themselves are in security.ts.
import { app, ipcMain, session, type IpcMainInvokeEvent } from 'electron'
import { checkedListener, isAppUrl, permissionGranted } from './security'

/** The development server's URL in a run from source; undefined in a packaged build, which refuses it at launch (ADR-0024) */
const DEV_SERVER_URL = process.env['ELECTRON_RENDERER_URL']

/**
 * Registers an IPC handler that answers only a main frame on Transfer's own page (electron-security::CON-003). Every
 * handler for the renderer is registered through this function; `ipcMain.handle` appears nowhere else.
 */
export function handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown): void {
  ipcMain.handle(channel, checkedListener(channel, listener, DEV_SERVER_URL))
}

/**
 * Keeps every web contents on Transfer's own pages, as it is created (electron-security::CON-001): a navigation of any
 * frame elsewhere is cancelled, a new window is denied, a webview is never attached. Navigations Transfer starts itself
 * with `loadURL` do not pass through these events. Also sets the default session's permission handlers
 * (electron-security::CON-004). Call once, before the first window.
 */
export function installWebGuards(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event) => {
      if (!isAppUrl(event.url, DEV_SERVER_URL)) event.preventDefault()
    })
    contents.on('will-frame-navigate', (event) => {
      if (!isAppUrl(event.url, DEV_SERVER_URL)) event.preventDefault()
    })
    contents.on('will-attach-webview', (event) => event.preventDefault())
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  })
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback, details) => {
    callback(permissionGranted(permission, details.requestingUrl, DEV_SERVER_URL))
  })
  session.defaultSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) =>
    permissionGranted(permission, requestingOrigin, DEV_SERVER_URL)
  )
}
