/**
 * Drives the real UI through the flagship demo and screenshots every beat.
 *   node scripts/beats.mjs [baseUrl]
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const base = process.argv[2] || 'http://localhost:5199'
const outDir = 'beats'
await mkdir(outDir, { recursive: true })

const beats = [
  ["Hi, I'm helping my mom Maria and honestly this has become kind of a mess. We're trying to get her into neurology. Her PCP, Dr. Patel, told us he sent the referral Monday, but the neurology office says they never got it. I've already called them twice and they said they'd call me back yesterday, but they haven't. Mom has Medicare, she doesn't drive, we'd prefer a woman doctor and Spanish would be nice if possible.", 'beat-01-chaos'],
  ['Actually, I just remembered - neurology called about ten minutes ago. They said the resent referral finally came through.', 'beat-02-referral-through'],
  ['Yes. They gave Mom next Thursday at 2 PM with Dr. Rivera.', 'beat-03-appointment'],
  ['Sarah can usually take Mom on Thursdays.', 'beat-04-potential-ride'],
  ['Yeah, she said she can.', 'beat-05-ride-confirmed'],
  ["Her memory has gotten worse lately, and she's also been sleeping really badly. The memory stuff is definitely the bigger concern.", 'beat-06-agenda'],
  ["She's been forgetting names for about two months - actually, no, more like three weeks.", 'beat-07-self-correction'],
  ['Actually mornings work much better for Mom now.', 'beat-08-conflict'],
  ["Actually I don't think we have an updated medication list.", 'beat-09-prep-gap'],
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
const errors = []
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))

await page.goto(base, { waitUntil: 'networkidle' })

// Configure the care context through the real settings UI.
await page.getByRole('button', { name: /Personalize Harbor/i }).click()
await page.getByRole('button', { name: 'Someone I care for' }).click()
await page.locator('label:has-text("Your name") input').fill('Elena')
await page.locator('label:has-text("Their name") input').fill('Maria')
await page.locator('label:has-text("Your relationship") input').fill('mother')
await page.getByRole('button', { name: /Save settings/i }).click()
await page.waitForTimeout(1500)
await page.screenshot({ path: `${outDir}/beat-00-setup.png`, fullPage: true })

await page.locator('header button').first().click()
await page.waitForTimeout(800)
await page.getByRole('button', { name: /Start talking/i }).click()
await page.getByRole('button', { name: /Type instead/i }).waitFor({ timeout: 15000 })
await page.getByRole('button', { name: /Type instead/i }).click()

let index = 0
for (const [text, name] of beats) {
  await page.getByPlaceholder('Type what you would say…').fill(text)
  await page.getByPlaceholder('Type what you would say…').press('Enter')
  index += 1
  // Wait for the extraction to settle, then give the navigator reply time to land.
  await page.waitForTimeout(9000)
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true })
  console.log(`captured ${name}`)
}

await page.getByRole('button', { name: /End and summarize/i }).click()
await page.getByText(/You moved care forward today/i).waitFor({ timeout: 15000 })
await page.waitForTimeout(800)
await page.screenshot({ path: `${outDir}/beat-10-accomplished.png`, fullPage: true })
console.log('captured beat-10-accomplished')

await page.getByRole('button', { name: /Back to today/i }).click()
await page.waitForTimeout(2500)
await page.screenshot({ path: `${outDir}/beat-11-next-day.png`, fullPage: true })
console.log('captured beat-11-next-day')

await page.getByRole('button', { name: /My care/i }).click()
await page.waitForTimeout(1500)
await page.screenshot({ path: `${outDir}/beat-12-memory.png`, fullPage: true })
console.log('captured beat-12-memory')

console.log(errors.length ? `FAIL console errors:\n${errors.join('\n')}` : 'OK no console errors')
await browser.close()
