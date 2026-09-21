import { chromium } from 'playwright'

const base = process.argv[2] || 'http://localhost:5199'
const browser = await chromium.launch()
const page = await browser.newPage({ permissions: [] })
await page.goto(base, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Start talking/i }).click()
await page.getByText('Prefer to type?').waitFor({ timeout: 15000 })
await page.waitForTimeout(4500)

const heading = await page.locator('.call-surface h2').innerText()
const guidance = await page.locator('.call-guidance').innerText()
console.log('heading :', heading)
console.log('guidance:', guidance)
console.log(heading.toLowerCase().includes('ready when you are')
  ? 'FAIL  session opened without starting the microphone'
  : 'OK    session started the microphone on open')
await browser.close()
