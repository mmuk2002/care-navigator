/**
 * Seeds a rich care thread, then walks every navigation view and checks it renders.
 *   node scripts/view-audit.mjs [baseUrl]
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const base = process.argv[2] || 'http://localhost:5199'
const outDir = 'artifacts/views'
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
const errors = []
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))

let passed = 0, failed = 0
const check = (label, ok, detail = '') => { ok ? (passed++, console.log(`  PASS  ${label}`)) : (failed++, console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)) }

await page.goto(base, { waitUntil: 'networkidle' })

// Seed a full care thread through the API from the page's own session.
const seed = await page.evaluate(async () => {
  const post = (path, body) => fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) }).then(r => r.json())
  const put = (path, body) => fetch(path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json())
  await post('/api/bootstrap', {})
  await put('/api/context', { subject: 'other', patient_name: 'Maria', relationship: 'mother', speaker_name: 'Elena' })
  const created = await post('/api/conversations', {})
  const id = created.conversation.id
  const turns = [
    "Hi, I'm helping my mom Maria. We're trying to get her into neurology. Her PCP Dr. Patel sent the referral Monday but neurology never got it. I've already called them twice and they said they'd call back.",
    'Actually neurology called - the resent referral came through. They gave her next Thursday at 2 PM with Dr. Rivera.',
    'Sarah can take her on Thursday.',
    'Yeah, she said she can.',
    'Her memory has gotten worse lately and she sleeps really badly. The memory stuff is the bigger concern.',
    'She takes a blood pressure pill and needs a refill at the pharmacy.',
    "I don't think we have an updated medication list.",
    'She has Medicare and we would prefer a woman doctor. Spanish would be nice if possible.',
    'I will call the office on Friday to confirm everything.',
    'We decided not to use the clinic that is too far away.',
  ]
  for (const text of turns) {
    await post(`/api/conversations/${id}/typed`, { text })
    await new Promise(resolve => setTimeout(resolve, 6000))
  }
  await post(`/api/conversations/${id}/end`, {})
  return id
})
console.log(`seeded conversation ${seed}\n`)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

async function visit(label, buttonName, checks) {
  console.log(`--- ${label} ---`)
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await page.waitForTimeout(1200)
  for (const [name, selector] of checks) {
    const count = await page.locator(selector).count()
    check(name, count > 0, `${count} matched ${selector}`)
  }
  await page.screenshot({ path: `${outDir}/${label.toLowerCase().replace(/\W+/g, '-')}.png`, fullPage: true })
}

await visit('My care', 'My care', [
  ['heading renders', 'text=What my navigator knows'],
  ['remembered facts render', '.surface, li'],
])
await visit('Tasks', 'Tasks', [
  ['next steps column', 'text=Your next steps'],
  ['waiting on column', 'text=Waiting on'],
  ['task items render', '.task-item'],
])
await visit('Timeline', 'Timeline', [
  ['timeline entries render', '.timeline-entry'],
])
await visit('Plan', 'Plan', [
  ['plan cards render', '.plan-card'],
  ['goals card', 'text=Goals'],
  ['preparation card', 'text=Visit preparation'],
  ['connections card', 'text=Care connections'],
])
await visit('Conversations', 'Conversations', [
  ['conversation row renders', 'text=Maria'],
])

console.log('--- global ---')
check('no "Invalid Date" labels anywhere', (await page.getByText('Invalid Date').count()) === 0)

console.log(`\nRESULT: ${passed} passed, ${failed} failed`)
console.log(errors.length ? `CONSOLE ERRORS:\n${errors.join('\n')}` : 'OK no console errors')
await browser.close()
process.exit(failed || errors.length ? 1 : 0)
