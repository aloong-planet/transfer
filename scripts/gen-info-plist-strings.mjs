// Writes build/info-plist/<folder>.lproj/InfoPlist.strings from the dictionary (src/shared/i18n/info-plist.ts), the
// files electron-builder ships into every macOS package (`extraResources` in electron-builder.yml).
// Run it with `pnpm gen:info-plist` after changing an Info.plist text in the dictionary; the test
// src/shared/i18n/info-plist.test.ts fails while the committed files differ from what this writes.
// It runs at authoring time only, never in CI or packaging. Node loads the TypeScript sources by stripping their
// types, which needs Node 22.18 or later.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DICT } from '../src/shared/i18n/dict.ts'
import { infoPlistStringsFiles } from '../src/shared/i18n/info-plist.ts'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'info-plist')

// Folders of a language that has since been removed must not stay behind and ship
mkdirSync(OUT_DIR, { recursive: true })
for (const entry of readdirSync(OUT_DIR)) {
  if (entry.endsWith('.lproj')) rmSync(join(OUT_DIR, entry), { recursive: true })
}

const files = infoPlistStringsFiles(DICT)
for (const [name, content] of files) {
  mkdirSync(dirname(join(OUT_DIR, name)), { recursive: true })
  writeFileSync(join(OUT_DIR, name), content)
}
console.log(`wrote ${files.size} files under build/info-plist: ${[...files.keys()].join(', ')}`)
