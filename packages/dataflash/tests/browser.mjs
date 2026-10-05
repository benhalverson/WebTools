import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname.replace(/^\/Tools\/WebTools/, '')
  try {
    if (path === '/') {
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><input type="file" id="log"><script type="module">import { inspectFile } from "./browser-consumer.js"; document.querySelector("input").onchange = async e => { try { window.result = await inspectFile(e.target.files[0]); } catch (e) { window.failure = String(e); } };</script>')
    } else if (/^\/(?:vendor\/)?[a-z-]+\.js$/.test(path)) {
      response.setHeader('content-type', 'text/javascript')
      response.end(await readFile(new URL(`../dist${path}`, import.meta.url)))
    } else { response.writeHead(404).end() }
  } catch { response.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) })
  const origin = `http://127.0.0.1:${server.address().port}`
  for (const prefix of ['/', '/Tools/WebTools/']) {
    const page = await browser.newPage()
    const requests = []; const errors = []
    await page.route('**/*', route => {
      requests.push({ url: route.request().url(), method: route.request().method() })
      return route.request().url().startsWith(origin + '/') ? route.continue() : route.abort()
    })
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(origin + prefix)
    assert.equal(requests.some(r => r.url.includes('/vendor/parser.js')), false, 'parser is lazy')
    for (const fixture of ['pymavlink-test.BIN', 'plane-4.6.2-prefix.BIN']) {
      await page.evaluate(() => { window.result = undefined; window.failure = undefined })
      await page.locator('#log').setInputFiles(new URL(`../fixtures/${fixture}`, import.meta.url).pathname)
      await page.waitForFunction(() => window.result || window.failure)
      const result = await page.evaluate(() => ({ result: window.result, failure: window.failure }))
      assert.equal(result.failure, undefined)
      assert.ok(result.result.messages.includes('GPS'))
      assert.equal(typeof result.result.firstGpsTime, 'number')
      if (fixture === 'plane-4.6.2-prefix.BIN') {
        assert.deepEqual(Object.keys(result.result.instances.BAT), ['0', '3'])
        assert.equal(result.result.metadata.fw_string, 'ArduPlane V4.6.2 (1ebd4d99)')
      }
    }
    assert.ok(requests.some(r => r.url === origin + prefix + 'vendor/parser.js'))
    assert.ok(requests.every(r => r.method === 'GET' && r.url.startsWith(origin + prefix)))
    assert.deepEqual(errors, [])
    await page.close()
  }
  console.log('Built Dataflash browser consumer passed at root and hosting prefix')
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
