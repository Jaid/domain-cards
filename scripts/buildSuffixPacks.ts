import {once} from 'node:events'
import {createReadStream, createWriteStream} from 'node:fs'
import {readFile, stat} from 'node:fs/promises'
import {createInterface} from 'node:readline'
import {brotliDecompressSync, createBrotliCompress, constants as zlibConstants} from 'node:zlib'

import {Packr, unpack} from 'msgpackr'

const packr = new Packr({
  useRecords: false,
  variableMapSize: true,
})
const brotliOptions = {
  params: {
    [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
  },
}
type TldMetadata = {
  privacy?: boolean
  requirements?: Array<string>
}
function arrayHeader(count: number): Buffer {
  if (count < 16) {
    return Buffer.from([0x90 | count])
  }
  if (count <= 0xFF_FF) {
    const buffer = Buffer.allocUnsafe(3)
    buffer[0] = 0xDC
    buffer.writeUInt16BE(count, 1)
    return buffer
  }
  const buffer = Buffer.allocUnsafe(5)
  buffer[0] = 0xDD
  buffer.writeUInt32BE(count, 1)
  return buffer
}
function packedArrayHeaderLength(count: number): number {
  return count < 16 ? 1 : count <= 0xffff ? 3 : 5
}
async function writeChunk(stream: NodeJS.WritableStream, chunk: Uint8Array): Promise<void> {
  if (!stream.write(chunk)) {
    await once(stream, 'drain')
  }
}
async function readWidthTsv(path: string): Promise<Array<{
  suffix: string
  width: number
}>> {
  const lines = (await readFile(path, 'utf8')).trimEnd().split(/\r?\n/)
  if (lines.shift() !== 'suffix\twidthPx') {
    throw new Error(`Unexpected TSV header in ${path}`)
  }
  return lines.map(line => {
    const split = line.lastIndexOf('\t')
    if (split < 1) {
      throw new Error(`Malformed TSV line: ${line}`)
    }
    const suffix = line.slice(0, split)
    const width = Number(line.slice(split + 1))
    if (!Number.isSafeInteger(width) || width <= 0) {
      throw new Error(`Invalid width for ${suffix}: ${width}`)
    }
    return {
      suffix,
      width,
    }
  })
}
async function buildTlds(): Promise<void> {
  const widths = await readWidthTsv('private/suffixes/tlds-widths.tsv')
  const metadata = JSON.parse(await readFile('private/suffixes/tld-metadata.json', 'utf8')) as Record<string, TldMetadata>
  const values = widths.map(({suffix, width}) => {
    const meta = metadata[suffix]
    return {
      suffix,
      width,
      ...meta?.privacy == null ? {} : {privacy: meta.privacy},
      requirements: meta?.requirements ?? [],
    }
  })
  const messagePack = packr.pack(values)
  const brotli = createBrotliCompress(brotliOptions)
  const output = createWriteStream('private/suffixes/tlds.msgpack.br')
  brotli.pipe(output)
  await writeChunk(brotli, messagePack)
  brotli.end()
  await once(output, 'finish')
  const decoded = unpack(brotliDecompressSync(await readFile('private/suffixes/tlds.msgpack.br')))
  if (!Array.isArray(decoded) || decoded.length !== values.length) {
    throw new Error('TLD decode verification failed')
  }
  if (decoded[0]?.suffix !== values[0]?.suffix || decoded.at(-1)?.suffix !== values.at(-1)?.suffix) {
    throw new Error('TLD ordering verification failed')
  }
  console.log(JSON.stringify({
    file: 'private/suffixes/tlds.msgpack.br',
    count: values.length,
    bytes: (await stat('private/suffixes/tlds.msgpack.br')).size,
  }))
}
async function countLines(path: string): Promise<number> {
  let count = 0
  const reader = createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity,
  })
  for await (const _ of reader) {
    count++
  }
  return count
}
async function buildHns(): Promise<void> {
  const totalRows = await countLines('private/suffixes/hns-tlds-widths.tsv') - 1
  if (totalRows <= 0) {
    throw new Error('No HNS rows')
  }
  const brotli = createBrotliCompress(brotliOptions)
  const output = createWriteStream('private/suffixes/hns.msgpack.br')
  brotli.pipe(output)
  await writeChunk(brotli, arrayHeader(totalRows))
  const reader = createInterface({
    input: createReadStream('private/suffixes/hns-tlds-widths.tsv'),
    crlfDelay: Infinity,
  })
  let first = true
  let batch: Array<{
    suffix: string
    width: number
  }> = []
  let count = 0
  const flush = async () => {
    if (!batch.length) {
      return
    }
    const packed = packr.pack(batch)
    const headerLength = packedArrayHeaderLength(batch.length)
    await writeChunk(brotli, packed.subarray(headerLength))
    count += batch.length
    batch = []
  }
  for await (const line of reader) {
    if (first) {
      first = false
      if (line !== 'suffix\twidthPx') {
        throw new Error('Unexpected HNS TSV header')
      }
      continue
    }
    const split = line.lastIndexOf('\t')
    if (split < 1) {
      throw new Error(`Malformed HNS TSV line: ${line}`)
    }
    const suffix = line.slice(0, split)
    const width = Number(line.slice(split + 1))
    if (!Number.isSafeInteger(width) || width <= 0) {
      throw new Error(`Invalid HNS width for ${suffix}: ${width}`)
    }
    batch.push({
      suffix,
      width,
    })
    if (batch.length === 10_000) {
      await flush()
    }
  }
  await flush()
  if (count !== totalRows) {
    throw new Error(`HNS count mismatch: expected ${totalRows}, wrote ${count}`)
  }
  brotli.end()
  await once(output, 'finish')
  console.log(JSON.stringify({
    file: 'private/suffixes/hns.msgpack.br',
    count,
    bytes: (await stat('private/suffixes/hns.msgpack.br')).size,
  }))
}
await buildTlds()
if (!process.argv.includes('--tlds-only')) {
  await buildHns()
}
