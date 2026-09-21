import { chromium } from 'playwright'

const base = process.argv[2] || 'http://localhost:5173'
const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))

const cookieSummary = (cookies) => cookies.map(cookie => `${cookie.name}=${cookie.value.slice(0, 10)}… (httpOnly=${cookie.httpOnly}, sameSite=${cookie.sameSite})`).join(', ') || '(none)'

await page.goto(base, { waitUntil: 'networkidle' })
console.log('cookies after load:', cookieSummary(await page.context().cookies()))

await page.getByRole('button', { name: /Personalize Harbor/i }).click()
await page.getByRole('button', { name: 'Someone I care for' }).click()
await page.locator('label:has-text("Your name") input').fill('Elena')
await page.locator('label:has-text("Their name") input').fill('Maria')
await page.locator('label:has-text("Your relationship") input').fill('mother')
await page.getByRole('button', { name: /Save settings/i }).click()
await page.waitForTimeout(2500)
console.log('cookies after save:', cookieSummary(await page.context().cookies()))

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
const heading = (await page.locator('h1').first().innerText()).replace(/\s+/g, ' ')
console.log('home heading after reload:', heading)

await page.getByRole('button', { name: /Personalize Harbor/i }).click()
await page.waitForTimeout(800)
const yourName = await page.locator('label:has-text("Your name") input').inputValue()
const theirName = await page.locator('label:has-text("Their name") input').inputValue()
console.log(`settings after reload: yourName=${JSON.stringify(yourName)} theirName=${JSON.stringify(theirName)}`)

console.log(yourName === 'Elena' && theirName === 'Maria' ? 'OK   context persisted' : 'FAIL context did not persist')
console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors')
await browser.close()
