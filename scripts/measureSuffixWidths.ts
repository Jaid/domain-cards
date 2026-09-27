import type {Browser, Page} from 'puppeteer'

import {once} from 'node:events'
import {createReadStream, createWriteStream} from 'node:fs'
import {mkdir, readFile, stat} from 'node:fs/promises'
import {createInterface} from 'node:readline'

import capturePage from 'capture-page'
import puppeteer from 'puppeteer'

const fontUrl = 'https://fonts.gstatic.com/s/roboto/v51/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWubEbWmT.ttf'
const fontPath = '.cache/Roboto-Regular.ttf'
const rasterCachePath = '.cache/suffix-width-raster.json'
const chars = '.-_0123456789abcdefghijklmnopqrstuvwxyz'
const phases = 64
const cols = 32
const cellWidth = 128
const cellHeight = 120
const baseX = 16
const batchSize = 5000

type RasterTable = {
  chars: string
  periodLeft: number
  phases: number
  rights: Record<string, Array<number>>
}

async function ensureFont(): Promise<Buffer> {
  await mkdir('.cache', {recursive: true})
  try {
    await stat(fontPath)
  } catch {
    const response = await fetch(fontUrl)
    if (!response.ok) {
      throw new Error(`Roboto download failed: HTTP ${response.status}`)
    }
    await Bun.write(fontPath, await response.arrayBuffer())
  }
  return readFile(fontPath)
}
function css(fontBase64: string): string {
  return [
    `@font-face{font-family:R;src:url(data:font/ttf;base64,${fontBase64}) format("truetype");font-weight:400;font-style:normal}`,
    '.measure{position:absolute;visibility:hidden;white-space:pre;font-family:R;font-size:100px;font-weight:400;font-style:normal;line-height:100px;font-kerning:normal;font-feature-settings:"liga" 0,"clig" 0,"calt" 0,"dlig" 0}',
  ].join('')
}
async function buildRasterTable(browser: Browser, fontBase64: string): Promise<RasterTable> {
  try {
    return JSON.parse(await readFile(rasterCachePath, 'utf8')) as RasterTable
  } catch {}
  const rows = Math.ceil(chars.length * phases / cols)
  const width = cols * cellWidth
  const height = rows * cellHeight
  const cells: Array<string> = []
  for (const char of chars) {
    const escaped = char.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    for (let phase = 0; phase < phases; phase++) {
      cells.push(`<div class="cell"><span style="left:${baseX + phase / phases}px">${escaped}</span></div>`)
    }
  }
  const atlasCss = [
    css(fontBase64),
    'html,body{margin:0;padding:0;background:transparent}',
    `#grid{display:grid;grid-template-columns:repeat(${cols},${cellWidth}px);grid-auto-rows:${cellHeight}px;width:${width}px;height:${height}px}`,
    `.cell{position:relative;width:${cellWidth}px;height:${cellHeight}px;overflow:hidden}`,
    '.cell>span{position:absolute;top:0;white-space:pre;font-family:R;font-size:100px;font-weight:400;font-style:normal;line-height:100px;font-kerning:normal;font-feature-settings:"liga" 0,"clig" 0,"calt" 0,"dlig" 0;color:#000}',
  ].join('')
  const result = await capturePage({html: `<style>${atlasCss}</style><div id="grid">${cells.join('')}</div>`}, {
    browser: browser as never,
    width,
    height,
    deviceScaleFactor: 1,
    omitBackground: true,
    wait: 'load',
    hook: async page => {
      await page.evaluate(async () => {
        await document.fonts.load('400 100px R')
        await document.fonts.ready
      })
    },
  })
  const png = '.cache/suffix-width-atlas.png'
  const rawPath = '.cache/suffix-width-atlas.rgba'
  await Bun.write(png, result.buffer)
  const converted = Bun.spawnSync(['magick.exe', png, '-depth', '8', `RGBA:${rawPath}`])
  if (converted.exitCode !== 0) {
    throw new Error((new TextDecoder).decode(converted.stderr))
  }
  const raw = new Uint8Array(await Bun.file(rawPath).arrayBuffer())
  const rights: Record<string, Array<number>> = {}
  let periodLeft = 0
  for (let charIndex = 0; charIndex < chars.length; charIndex++) {
    const char = chars[charIndex]
    const charRights: Array<number> = []
    for (let phase = 0; phase < phases; phase++) {
      const index = charIndex * phases + phase
      const row = Math.floor(index / cols)
      const col = index % cols
      const x0 = col * cellWidth
      const y0 = row * cellHeight
      let minX = cellWidth
      let maxX = -1
      for (let y = 0; y < cellHeight; y++) {
        let pointer = ((y0 + y) * width + x0) * 4 + 3
        for (let x = 0; x < cellWidth; x++, pointer += 4) {
          if (!(raw[pointer] !== 0)) {
            continue
          }
          if (x < minX) {
            minX = x
          }
          if (x > maxX) {
            maxX = x
          }
        }
      }
      if (maxX < 0) {
        throw new Error(`Empty raster cell for ${JSON.stringify(char)} phase ${phase}`)
      }
      if (char === '.' && phase === 0) {
        periodLeft = minX - baseX
      }
      charRights.push(maxX + 1 - baseX)
    }
    rights[char] = charRights
  }
  const raster = {
    chars,
    phases,
    periodLeft,
    rights,
  }
  await Bun.write(rasterCachePath, JSON.stringify(raster))
  return raster
}
async function makeMeasurePage(browser: Browser, fontBase64: string): Promise<Page> {
  const page = await browser.newPage()
  await page.setViewport({
    width: 8000,
    height: 200,
    deviceScaleFactor: 1,
  })
  await page.setContent(`<style>${css(fontBase64)}</style><div id="host"></div><span class="measure">x</span>`, {waitUntil: 'load'})
  await page.evaluate(async () => {
    await document.fonts.load('400 100px R')
    await document.fonts.ready
  })
  return page
}
async function startsIn64ths(page: Page, suffixes: Array<string>): Promise<Array<number>> {
  return page.evaluate(suffixes => {
    const host = document.querySelector('#host')!
    const fragment = document.createDocumentFragment()
    const spans: Array<HTMLSpanElement> = []
    for (const suffix of suffixes) {
      const element = document.createElement('span')
      element.className = 'measure'
      element.textContent = `.${suffix}`
      fragment.append(element)
      spans.push(element)
    }
    host.append(fragment)
    const output = new Array<number>(spans.length)
    const range = document.createRange()
    for (const [index, span] of spans.entries()) {
      const element = span
      const node = element.firstChild!
      const text = node.textContent!
      range.setStart(node, text.length - 1)
      range.setEnd(node, text.length)
      const elementRect = element.getBoundingClientRect()
      const rangeRect = range.getBoundingClientRect()
      output[index] = Math.round((rangeRect.left - elementRect.left) * 64)
    }
    host.replaceChildren()
    return output
  }, suffixes)
}
async function writeText(stream: ReturnType<typeof createWriteStream>, text: string): Promise<void> {
  if (!stream.write(text)) {
    await once(stream, 'drain')
  }
}
async function measureFile(page: Page, raster: RasterTable, input: string, output: string): Promise<number> {
  const allowed = new Set(chars)
  const stream = createWriteStream(output, {encoding: 'utf8'})
  await writeText(stream, 'suffix\twidthPx\n')
  const reader = createInterface({
    input: createReadStream(input, {encoding: 'utf8'}),
    crlfDelay: Infinity,
  })
  let batch: Array<string> = []
  let count = 0
  const flush = async () => {
    if (batch.length === 0) {
      return
    }
    const starts = await startsIn64ths(page, batch)
    let text = ''
    for (const [index, element] of batch.entries()) {
      const suffix = element
      const last = suffix.at(-1)!
      const start64 = starts[index]
      const integer = Math.floor(start64 / phases)
      const phase = (start64 % phases + phases) % phases
      const relativeRight = raster.rights[last]?.[phase]
      if (relativeRight == null) {
        throw new Error(`No raster metric for final character ${JSON.stringify(last)} in ${suffix}`)
      }
      const width = integer + relativeRight - raster.periodLeft
      text += `${suffix}\t${width}\n`
    }
    await writeText(stream, text)
    count += batch.length
    batch = []
  }
  for await (const rawLine of reader) {
    const suffix = rawLine.trimEnd()
    if (!suffix) {
      continue
    }
    for (const char of suffix) {
      if (!allowed.has(char)) {
        throw new Error(`Unsupported character ${JSON.stringify(char)} in ${input}: ${suffix}`)
      }
    }
    batch.push(suffix)
    if (batch.length >= batchSize) {
      await flush()
    }
  }
  await flush()
  stream.end()
  await once(stream, 'finish')
  return count
}
const font = await ensureFont()
const fontBase64 = font.toBase64()
const browser = await puppeteer.launch({
  executablePath: Bun.env.BROWSER,
  headless: true,
})
try {
  const raster = await buildRasterTable(browser, fontBase64)
  const page = await makeMeasurePage(browser, fontBase64)
  const targets = process.argv.slice(2)
  const specs = targets.length ? targets.map(input => ({
    input,
    output: `${input.replace(/\.txt$/i, '')}-widths.tsv`,
  })) : [
    {
      input: 'private/suffixes/tlds.txt',
      output: 'private/suffixes/tlds-widths.tsv',
    },
    {
      input: 'private/suffixes/hns-tlds.txt',
      output: 'private/suffixes/hns-tlds-widths.tsv',
    },
  ]
  for (const {input, output} of specs) {
    const started = performance.now()
    const count = await measureFile(page, raster, input, output)
    console.log(JSON.stringify({
      input,
      output,
      count,
      seconds: (performance.now() - started) / 1000,
    }))
  }
  await page.close()
} finally {
  await browser.close()
}
