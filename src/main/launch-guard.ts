// The launch guard (ADR-0024, mac-distribution::CON-006). The main module imports it first, so it decides while that
// module loads: on Electron 35 with this ES-module main, the debugging server has not started by then, and app.exit ends
// the process there and then, so nothing after it runs — no other module's top-level code, no single-instance lock.
import { app } from 'electron'
import { launchRefusal } from './launch-inputs'

const refusal = launchRefusal({ packaged: app.isPackaged, argv: process.argv, env: process.env })
if (refusal) {
  console.error(refusal.message)
  app.exit(refusal.exitCode)
}
