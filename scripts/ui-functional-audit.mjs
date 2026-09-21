import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const base = process.env.BASE_URL || 'http://127.0.0.1:5299'
const server = process.env.BASE_URL ? null : spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  env: { ...process.env, PORT: '5299', NODE_ENV: 'production', DATA_DIR: './artifacts/ui-audit-db' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

if (server) {
  let ready = false
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break } } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (!ready) throw new Error('The local UI audit server did not start.')
}
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

try {
  await page.goto(base, { waitUntil: 'networkidle' })
  const created = await page.evaluate(async () => (await fetch('/api/conversations', { method: 'POST' })).json())
  const id = created.conversation.id
  await page.evaluate(async conversationId => {
    await fetch(`/api/conversations/${conversationId}/turns`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'My goal is to prepare for my neurologist appointment on October 14, 2026. I need to ask about memory changes and bring my medication list. My daughter Maya will drive me. I am waiting for Dr. Patel to send the referral. My next step is to call the office tomorrow.' }),
    })
  }, id)

  await page.waitForFunction(async conversationId => {
    const detail = await (await fetch(`/api/conversations/${conversationId}`)).json()
    return detail.facts.length >= 5 && detail.facts.some(fact => ['next_step', 'readiness', 'transport'].includes(fact.widget))
  }, id, { timeout: 20_000 })
  await page.evaluate(async conversationId => { await fetch(`/api/conversations/${conversationId}/end`, { method: 'POST' }) }, id)
  await page.reload({ waitUntil: 'networkidle' })

  await page.getByRole('button', { name: /Tasks/ }).click()
  await page.getByTitle('Mark done').first().waitFor()
  assert.ok(await page.getByRole('button', { name: 'View source conversation' }).count())
  await page.getByTitle('Mark done').first().click()
  await page.getByText('Recently completed').waitFor()

  await page.getByRole('button', { name: /Timeline/ }).click()
  await page.getByRole('button', { name: 'View source' }).first().waitFor()
  await page.getByRole('button', { name: 'View source' }).first().click()
  await page.getByText('Review the details and their source').waitFor()
  await page.getByText('Full transcript').waitFor()
  assert.equal(await page.getByText('Simulate next day').count(), 0)

  await page.getByRole('button', { name: /Plan/ }).click()
  assert.ok(await page.locator('.plan-card button').count())

  await page.getByRole('button', { name: /My care/ }).click()
  await page.getByText(/What my navigator knows/).waitFor()
  assert.ok(await page.locator('.fact-row').count())

  await page.getByRole('button', { name: /Conversations/ }).click()
  await page.getByPlaceholder(/Search what was said/).fill('neurologist')
  await page.waitForTimeout(350)
  assert.ok(await page.locator('ul li').count())

  await page.getByRole('button', { name: /Settings/ }).click()
  const name = page.getByPlaceholder('Alex')
  await name.fill('Functional Audit')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Settings/ }).click()
  assert.equal(await page.getByPlaceholder('Alex').inputValue(), 'Functional Audit')

  console.log('UI functional audit passed: persistence, tasks, timeline, plan, sources, memory, search, and settings.')
} finally {
  await browser.close()
  server?.kill()
}
