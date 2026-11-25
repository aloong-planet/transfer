// e2e: the one launch input a packaged build accepts (mac-distribution::CON-006/AC-04, ADR-0024).
//
// `--user-data-dir=<directory>` must keep everything Transfer stores in the directory it names: an installed copy has
// no other way to run beside the real one, and the packaging check relies on it to keep every launch it makes off the
// real data. The other e2e cases pass TRANSFER_USERDATA with the same directory, which would put the data there even if
// the switch were ignored, so this case leaves that seam out: it launches through `launchQuietSwitchOnly`, the one launch
// in helpers/quiet-launch.ts that does not pass TRANSFER_USERDATA. The guard itself acts only in a packaged build and is
// covered by its unit cases and the packaging check; a run from source, as here, is never refused.
//
// Quiet like every e2e case (TRANSFER_E2E_QUIET, see ui-icons.spec.ts): no window shown, nothing on the LAN.
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { launchQuietSwitchOnly } from './helpers/quiet-launch'

test('an instance started with only --user-data-dir keeps its data in that directory', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'transfer-userdata-switch-e2e-'))
  const app = await launchQuietSwitchOnly(dir)
  try {
    const userData = await app.evaluate(({ app }) => app.getPath('userData'))
    expect(realpathSync(userData)).toBe(realpathSync(dir))
    // The identity is created at startup under the data directory: it lands in the directory named, not the default
    await expect.poll(() => existsSync(join(dir, 'identity.json'))).toBe(true)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
