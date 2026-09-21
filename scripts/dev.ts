/**
 * Development entry point.
 *
 * Checks the embedded database once in a child process before starting the
 * watcher. A corrupt directory is moved aside here, so a file-save restart can
 * never discard a healthy database (the watcher restarts would otherwise look
 * like an unclean shutdown).
 */
import { spawn, spawnSync } from 'node:child_process'
import { renameSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const dir = process.env.DATA_DIR || './data'

const preflight = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/db-preflight.ts', dir], { stdio: 'ignore' })
if (preflight.status !== 0) {
  const backup = `${dir}.corrupt-${Date.now()}`
  try {
    renameSync(dir, backup)
    console.log(`The local database could not be opened. It was moved to ${backup} and a fresh one will be created.`)
  } catch {
    console.log('The local database could not be opened and could not be moved aside.')
  }
}

// Use tsx's watcher, not `node --watch`: Node watches the working directory, so
// the embedded database writing to ./data would restart the server in a loop.
const tsxCli = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url))
const child = spawn(process.execPath, [tsxCli, 'watch', 'server/index.ts'], { stdio: 'inherit' })
child.on('exit', code => process.exit(code ?? 0))
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal))
