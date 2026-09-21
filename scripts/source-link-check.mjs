/** Seeds a care thread, then checks that "View source" jumps to the cited line. */
import { chromium } from 'playwright'

const base = process.argv[2] || 'http://localhost:5173'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))

await page.goto(base, { waitUntil: 'networkidle' })

await page.evaluate(async () => {
  const post = (path, body) => fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) }).then(r => r.json())
  const put = (path, body) => fetch(path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json())
  await post('/api/bootstrap', {})
  await put('/api/context', { subject: 'other', patient_name: 'Maria', relationship: 'mother', speaker_name: 'Elena' })
  const created = await post('/api/conversations', {})
  const id = created.conversation.id
  for (const text of [
    "Hi, I'm helping my mom Maria. We're trying to get her into neurology. Dr. Patel sent the referral Monday but neurology never got it.",
    'She can only do mornings and she needs a ride because she does not drive.',
  ]) {
    await post(`/api/conversations/${id}/typed`, { text })
    await new Promise(resolve => setTimeout(resolve, 6000))
  }
  await post(`/api/conversations/${id}/end`, {})
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

await page.getByRole('button', { name: 'My care', exact: true }).click()
await page.waitForTimeout(1500)
const sourceButtons = await page.getByRole('button', { name: 'View source' }).count()
console.log(`source links on My care: ${sourceButtons}`)

await page.getByRole('button', { name: 'View source' }).first().click()
await page.waitForTimeout(2500)
const highlighted = await page.locator('.transcript-turn.highlighted').count()
console.log(`highlighted turns: ${highlighted}`)

const visible = await page.locator('.transcript-turn.highlighted').first().isVisible().catch(() => false)
console.log(visible ? 'OK   source link jumps to the cited line' : 'FAIL no highlighted line')
console.log(sourceButtons > 0 && highlighted === 1 && visible ? 'RESULT: PASS' : 'RESULT: FAIL')

await page.screenshot({ path: 'artifacts/source-link.png', fullPage: true })
console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors')
await browser.close()
