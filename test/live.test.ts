import type {Browser, Page} from 'puppeteer-core'

import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, test} from 'bun:test'

import capturePage from 'capture-page'
import countPixels from 'count-in-png'
import puppeteer from 'puppeteer-core'

import screenshot from './lib/screenshot.ts'
import ViteSession from './lib/ViteSession.ts'

const browserHookTimeout = 30_000
describe.if(Boolean(Bun.env.target)).each(['chrome', 'firefox'])('%s', host => {
  let vite: ViteSession
  let page: Page
  let browser: Browser
  beforeAll(async () => {
    vite = new ViteSession({root: Bun.env.target})
    await vite.init()
    browser = await puppeteer.launch({browser: host, executablePath: Bun.which(host)!, defaultViewport: {
      width: 1920,
      height: 960,
    }, args: host === 'chrome' ? ['--no-sandbox', '--disable-setuid-sandbox', '--enable-font-antialiasing', '--font-render-hinting=medium', '--flag-switches-begin', '--enable-experimental-web-platform-features', '--enable-features=JXLImageFormat,OverlayScrollbar', '--flag-switches-end'] : undefined})
  }, browserHookTimeout)
  afterAll(async () => {
    await vite?.[Symbol.asyncDispose]()
    await browser?.close()
  }, browserHookTimeout)
  beforeEach(async () => {
    page = await browser.newPage()
    await page.goto(vite.url, {waitUntil: 'domcontentloaded'})
    await page.waitForSelector('body>div>*')
  }, browserHookTimeout)
  afterEach(async () => {
    await page?.close()
  }, browserHookTimeout)
  test('static HTML after React render', async () => {
    const html = await page.content()
    await Bun.write('out/test/render.html', html)
    expect(html.length).toBeGreaterThan(0)
  }, {timeout: 10_000})
  test('real interaction', async () => {
    const title = await page.title()
    await page.waitForSelector('[data-domain="slop.accountant"]')
    const domains = await page.$$eval('[data-domain]', elements => elements.map(element => element.getAttribute('data-domain')))
    const pageText = await page.evaluate(() => document.body.innerText)
    expect(title.length).toBeGreaterThan(0)
    expect(typeof pageText).toBe('string')
    expect(domains).toEqual(['slop.accountant', 'slop.actor', 'slop.movie'])
    expect(pageText).toContain('$ 21')
    expect(pageText).toContain('$ 11 → $ 36')
    expect(pageText).not.toContain('/ year')
    expect(pageText).not.toContain('first year')
  }, {timeout: 60_000})
  test('Monacozen edits update the cards and keep the last preview on YAML errors', async () => {
    const editorWrapperSelector = '[aria-label="Domain catalog YAML"]'
    const editorSelector = `${editorWrapperSelector} [role="textbox"][aria-roledescription="editor"]`
    const setEditorText = async (value: string) => {
      await page.waitForSelector(editorSelector)
      await page.click(editorWrapperSelector, {offset: {x: 100, y: 100}})
      await page.keyboard.down('Control')
      await page.keyboard.press('KeyA')
      await page.keyboard.up('Control')
      await page.keyboard.type(value)
    }

    await page.waitForSelector('[data-domain="slop.accountant"]')
    await setEditorText('{sort: original, domains: [{domain: hello.test, vendor: porkbun, currency: USD, firstYear: 4, renewal: 9}, {domain: later.test, vendor: spaceship, currency: USD, firstYear: 1, renewal: 1}]')
    await page.waitForSelector('[data-domain="hello.test"]')
    const updated = await page.$$eval('[data-domain]', elements => elements.map(element => element.getAttribute('data-domain')))
    expect(updated).toEqual(['hello.test', 'later.test'])
    await page.click(editorWrapperSelector, {offset: {x: 100, y: 100}})
    await page.keyboard.down('Control')
    await page.keyboard.press('KeyA')
    await page.keyboard.up('Control')
    const client = await page.createCDPSession()
    await client.send('Input.insertText', {text: 'sort: *'})
    await client.detach()
    await page.waitForSelector('[role="alert"]')
    const afterError = await page.$$eval('[data-domain]', elements => elements.map(element => element.getAttribute('data-domain')))
    expect(afterError).toEqual(['hello.test', 'later.test'])
  }, {timeout: 60_000})
  if (host === 'chrome') { // Skipping Firefox for now because it seemingly does not support `page.emulateMediaFeatures`
    describe.each(['page', 'content'])('%s screenshot', scope => {
      test.each(['dark', 'light'])('%s', async theme => {
        const output = `out/test/screenshots/${host}_${theme}_${scope}.png`
        let image: Uint8Array
        if (scope === 'page') {
          const capture = await capturePage.save(vite.url, output, {browser: browser as never, width: 1920, height: 960, colorScheme: theme, wait: {
            count: 'all',
            rules: ['networkidle2', {selector: 'body>div>*'}],
          }})
          image = capture.buffer
        } else {
// Keep element capture on the existing page; capture-page creates an isolated page.
          image = await screenshot(page, {
            colorScheme: theme,
            element: 'body>div>*',
          })
          await Bun.write(output, image)
        }
        const pixels = countPixels(image)
        expect(pixels).toBeGreaterThan(100)
      }, {timeout: 60_000})
    })
  }
})
