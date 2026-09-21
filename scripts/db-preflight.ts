/**
 * Can the embedded database be opened? Exit 0 if yes, 1 if not.
 *
 * Run as a child process: a corrupt PGlite directory aborts the WASM runtime
 * uncatchably, so the check has to be isolated from the process that decides
 * whether to reset.
 */
import { PGlite } from '@electric-sql/pglite'

const dir = process.argv[2] || process.env.DATA_DIR || './data'
try {
  const db = new PGlite(dir)
  await db.query('SELECT 1')
  await db.close()
  process.exit(0)
} catch {
  process.exit(1)
}
