/** Print the contents of an embedded database directory. node --import tsx scripts/db-inspect.ts <dir> */
import { PGlite } from '@electric-sql/pglite'

const dir = process.argv[2] || './data'
const db = new PGlite(dir)
const visitors = await db.query<{ visitor_id: string; context: unknown }>('SELECT visitor_id, context FROM visitor_profiles')
const conversations = await db.query<{ id: string; patient_key: string; status: string }>('SELECT id, patient_key, status FROM conversations ORDER BY started_at')
const facts = await db.query<{ widget: string; n: number }>('SELECT widget, count(*)::int AS n FROM facts GROUP BY widget ORDER BY n DESC')
const turns = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM turns')
console.log(`dir: ${dir}`)
console.log(`visitors: ${visitors.rows.length}`)
for (const row of visitors.rows) console.log(`  ${row.visitor_id} :: ${JSON.stringify(row.context)}`)
console.log(`conversations: ${conversations.rows.length}`)
for (const row of conversations.rows) console.log(`  ${row.id} patient_key=${row.patient_key} status=${row.status}`)
console.log(`turns: ${turns.rows[0]?.n}`)
console.log(`facts: ${facts.rows.reduce((sum, row) => sum + row.n, 0)}`)
for (const row of facts.rows) console.log(`  ${row.widget}: ${row.n}`)
await db.close()
