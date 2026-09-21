import { chromium } from 'playwright'

const base = process.argv[2] || 'http://localhost:5199'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))

await page.goto(base, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Start talking/i }).click()
await page.getByText('Prefer to type?').waitFor({ timeout: 15000 })
console.log('OK call surface rendered (orb + typed fallback)')
console.log('OK transcript panel:', await page.getByText('Conversation transcript').count())
console.log('OK streaming tag:', await page.getByText(/Streaming|Saved/).count())

await page.locator('#typed-turn').fill("Hi, I'm helping my mom Maria. We're trying to get her into neurology, but the referral seems stuck.")
await page.locator('#typed-turn').press('Enter')
await page.waitForTimeout(9000)
console.log('OK transcript turns:', await page.locator('.transcript-turn').count())
console.log('OK care cards:', await page.locator('.care-card, article').count())

await page.screenshot({ path: 'artifacts/live-session.png', fullPage: true })
console.log(errors.length ? `FAIL console errors:\n${errors.join('\n')}` : 'OK no console errors')
await browser.close()
