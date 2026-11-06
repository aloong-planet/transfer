// What a packaged build refuses at launch (ADR-0024, mac-distribution::CON-006): the launch guard's decision, a pure
// function so that its bypass vectors can be unit tested.

/**
 * The only arguments a launch may carry, by how they start: `--user-data-dir=` moves where Transfer keeps its data and
 * runs nothing, and older macOS versions passed `-psn_<n>_<n>` to every launch. Anything else is refused whole, switch or
 * not. The guard does not model how Chromium reads an argument, so no spelling Chromium accepts can get past it, and
 * Transfer takes nothing of its own from the command line.
 */
const ACCEPTED_ARGUMENT_STARTS: readonly string[] = ['--user-data-dir=', '-psn_']
/** The development server's URL: a packaged build that followed it would give any page the preload's methods */
const DEV_SERVER_URL = 'ELECTRON_RENDERER_URL'
/** Every test seam is named with this prefix, so a seam written later is refused without another line here */
const SEAM_PREFIX = 'TRANSFER_'
/** How the refusal names an argument that is not a dash switch: it can be a path, which is nobody's business */
const ARGUMENT_PLACEHOLDER = '<argument>'

function isAcceptedArgument(arg: string): boolean {
  return ACCEPTED_ARGUMENT_STARTS.some((start) => arg.startsWith(start))
}

/** A refused argument by name: a dash switch by the part before its value, anything else by the placeholder */
function argumentName(arg: string): string {
  return arg.startsWith('-') ? arg.split('=')[0] : ARGUMENT_PLACEHOLDER
}

/** Windows reads variable names without regard to case, so they are compared that way on every platform */
function isRefusedVariable(name: string): boolean {
  const upper = name.toUpperCase()
  return upper === DEV_SERVER_URL || upper.startsWith(SEAM_PREFIX)
}

/** The refused inputs by name, never by value: the arguments after the executable in order, then the variables */
export function refusedLaunchInputs(args: readonly string[], env: Readonly<Record<string, string | undefined>>): string[] {
  const refusedArguments = args.filter((arg) => !isAcceptedArgument(arg)).map(argumentName)
  const refusedVariables = Object.keys(env).filter(isRefusedVariable)
  return [...refusedArguments, ...refusedVariables]
}

/** EX_USAGE: the packaging check tells a refusal from a crash by this code (ADR-0024) */
const REFUSED_EXIT_CODE = 64

/** What a launch has to do about its inputs: nothing from source, where development, e2e and smoke runs use their seams */
export function launchRefusal(run: {
  packaged: boolean
  argv: readonly string[]
  env: Readonly<Record<string, string | undefined>>
}): { message: string; exitCode: number } | null {
  if (!run.packaged) return null
  const refused = refusedLaunchInputs(run.argv.slice(1), run.env)
  if (refused.length === 0) return null
  return { message: `Transfer: an installed copy does not start with ${refused.join(', ')}.`, exitCode: REFUSED_EXIT_CODE }
}
