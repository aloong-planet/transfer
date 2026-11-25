# `astro check` passes without checking when `@astrojs/check` is missing

> This was written when the website lived in this repository's `site/` directory, which the paths below name. The website now lives in aloong-planet-home's `apps/transfer`, which runs Astro 7 and keeps the `check` script of the Fix section, pinned by its `src/check-script.test.ts`.

## Symptom

The site's type check went into the `checks` job as `pnpm check` → `astro check`, the command Astro's type-checking guide names. When `@astrojs/check` (or `typescript`) is not installed in `site/node_modules`, it checks no file and still exits 0. With `CI=true` it logs ``[ERROR] [check] The `@astrojs/check` and `typescript` packages are required for this command to work. ...``; without `CI` it shows an install prompt (`Continue? (Y/n)`) and, with no terminal to answer it, exits 0 as well.

Two ordinary events reach that state: a later change drops `@astrojs/check` from `site/package.json` (no source file imports it, so it looks unused), or a local `site/node_modules` was installed before the dependency was added. Either way a step that checked nothing reads as a step that passed, in CI and for anyone running the site's `check` script by hand (the `[i18n]` declaration in `capabilities.toml` then named it).

## Root cause

In Astro 4.16.19, `astro/dist/cli/check/index.js` logs that error and does a bare `return;` when either package cannot be loaded. The CLI then exits with `process.exit(checkServer ? 1 : 0)`, and `undefined` is falsy. withastro/astro#18589 changes it to `return true;` (exit 1) on Astro's `main`, after the 4.x line.

## Why the "can go red" evidence missed it

The gate's proof that it can fail was a mutation of the input: remove a key from the English dictionary, see exit 1. That proves the checker reports a type error when it runs; it says nothing about the checker not running. CI could not show it either, because its fresh `pnpm install --frozen-lockfile` always installs the package. The independent review caught it before merge.

## Fix

The site's `check` script is `astro sync && astro-check`. `astro sync` generates the `.astro/` types that `astro check` generates before checking; `astro-check` is the binary `@astrojs/check` ships, runs the same checker and exits from its result. With the package missing, the shell reports `astro-check: command not found` and the step fails. Once the site runs an Astro release that has #18589, `astro check` is safe again.

## Dead ends

- Patching Astro (`pnpm patch`) with the upstream one-line change: keeps `astro check`, but a `site/node_modules` installed before the patch still runs the unpatched code and exits 0.
- Asserting `Result (N files)` with N > 0 in the output: ties the gate to Astro's output wording.
- Upgrading Astro to a release with the fix: a major-version upgrade, larger than the gate change it would serve.

## Rule of thumb

For a check step, show both ways it goes red: a bad input fails it, and the checker being absent fails it (remove the dependency, or run with a `node_modules` installed before it was added). A CLI that delegates to an optional package may treat "package missing" as a warning.
