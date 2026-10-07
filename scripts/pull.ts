import {mkdir, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'

type VictoriaRow = Record<string, string>

type VendorSpec = {
  currency: 'EUR' | 'USD'
  id: 'cloudflare' | 'porkbun' | 'regery' | 'spaceship' | 'vercel'
  purchaseField: string
  renewalField: string
  requireBuyNow?: boolean
  service: string
}

type Offer = {
  currency: VendorSpec['currency']
  domain: string
  firstYear: number
  renewal?: number
  vendor: VendorSpec['id']
}

const VICTORIA_URL = process.env.VICTORIA_TRACES_URL ?? 'http://10.0.0.22:3303/select/logsql/query'
const QUERY_LIMIT = 20_000
const DEFAULT_RECENCY_SECONDS = 86_400
const PREFIX_BUCKETS = ['[a-f]', '[g-l]', '[m-r]', '[s-z0-9]'] as const
const vendors: ReadonlyArray<VendorSpec> = [
  {
    id: 'spaceship',
    service: 'spaceship-domain-availability',
    currency: 'USD',
    purchaseField: 'span_attr:price.purchase.USD.total',
    renewalField: 'span_attr:price.renewal.USD.total',
  },
  {
    id: 'porkbun',
    service: 'porkbun-domain-availability',
    currency: 'USD',
    purchaseField: 'span_attr:price.purchase.USD.porkbun.total',
    renewalField: 'span_attr:price.renewal.USD.porkbun.total',
  },
  {
    id: 'vercel',
    service: 'vercel-domain-availability',
    currency: 'USD',
    purchaseField: 'span_attr:price.purchase.USD.vercel.total',
    renewalField: 'span_attr:price.renewal.USD.vercel.total',
  },
  {
    id: 'regery',
    service: 'regery-domain-availability',
    currency: 'EUR',
    purchaseField: 'span_attr:price.purchase.EUR.regery.total',
    renewalField: 'span_attr:price.renewal.EUR.regery.total',
    requireBuyNow: true,
  },
  {
    id: 'cloudflare',
    service: 'cloudflare-domain-availability',
    currency: 'USD',
    purchaseField: 'span_attr:price.purchase.USD.cloudflare.total',
    renewalField: 'span_attr:price.renewal.USD.cloudflare.total',
  },
]
function readOptions(): {
  name: string
  recency: number
} {
  const args = process.argv.slice(2)
  let name: string | undefined
  let recency = DEFAULT_RECENCY_SECONDS
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--recency') {
      const value = args[++index]
      if (value == null) {
        throw new Error('--recency requires a value in seconds')
      }
      recency = Number(value)
      continue
    }
    if (arg.startsWith('--recency=')) {
      recency = Number(arg.slice('--recency='.length))
      continue
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`)
    }
    if (name != null) {
      throw new Error(`Unexpected argument: ${arg}`)
    }
    name = arg.trim().toLowerCase()
  }
  if (!name) {
    throw new Error('Usage: bun scripts/pull.ts <name> [--recency <seconds>]')
  }
  if (!/^[0-9a-z](?:[-0-9a-z]{0,61}[0-9a-z])?$/.test(name)) {
    throw new Error(`Invalid domain label: ${name}`)
  }
  if (!Number.isSafeInteger(recency) || recency <= 0) {
    throw new Error(`Invalid --recency value: ${recency}; expected a positive integer number of seconds`)
  }
  return {
    name,
    recency,
  }
}
function parseNumber(value: string | undefined): number | undefined {
  if (value == null || value === '') {
    return undefined
  }
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : undefined
}
function queryFor(name: string, vendor: VendorSpec, bucket: string, recency: number): string {
  const fields = [
    '_time',
    'span_attr:domain.name',
    'span_attr:domain.status',
    'span_attr:domain.available',
    'span_attr:domain.buy_now',
    'span_attr:domain.requires_cart_verification',
    vendor.purchaseField,
    vendor.renewalField,
  ].map(field => `"${field}"`).join(',')
  return `{name="domain.availability",resource_attr:service.name="${vendor.service}"} _time:${recency}s "span_attr:domain.name":~"^${name}[.]${bucket}" | fields ${fields}`
}
async function queryVictoria(query: string): Promise<Array<VictoriaRow>> {
  const url = new URL(VICTORIA_URL)
  url.searchParams.set('limit', String(QUERY_LIMIT))
  url.searchParams.set('query', query)
  const response = await fetch(url, {signal: AbortSignal.timeout(30_000)})
  if (!response.ok) {
    throw new Error(`VictoriaTraces returned HTTP ${response.status}: ${await response.text()}`)
  }
  const text = await response.text()
  const rows = text.trim() ? text.trim().split('\n').map((line, index) => {
    try {
      return JSON.parse(line) as VictoriaRow
    } catch (error) {
      throw new Error(`Invalid VictoriaTraces JSONL at line ${index + 1}: ${String(error)}`)
    }
  }) : []
  if (rows.length >= QUERY_LIMIT) {
    throw new Error(`VictoriaTraces query reached the ${QUERY_LIMIT}-row safety limit; split the query more finely before trusting the result.`)
  }
  return rows
}
function newestRows(rows: ReadonlyArray<VictoriaRow>): Map<string, VictoriaRow> {
  const newest = new Map<string, VictoriaRow>
  for (const row of rows) {
    const domain = row['span_attr:domain.name']
    const time = row._time
    if (!domain || !time) {
      continue
    }
    const previous = newest.get(domain)
    if (!previous || time > previous._time) {
      newest.set(domain, row)
    }
  }
  return newest
}
function offerFromRow(name: string, vendor: VendorSpec, row: VictoriaRow): Offer | undefined {
  const domain = row['span_attr:domain.name']
  if (!domain?.startsWith(`${name}.`)) {
    return undefined
  }
  if (row['span_attr:domain.available'] !== 'true' || row['span_attr:domain.status'] !== 'available') {
    return undefined
  }
  if (row['span_attr:domain.requires_cart_verification'] === 'true') {
    return undefined
  }
  if (vendor.requireBuyNow && row['span_attr:domain.buy_now'] !== 'true') {
    return undefined
  }
  const firstYear = parseNumber(row[vendor.purchaseField])
  if (firstYear == null) {
    return undefined
  }
  const renewal = parseNumber(row[vendor.renewalField])
  return {
    domain,
    vendor: vendor.id,
    currency: vendor.currency,
    firstYear,
    ...renewal == null ? {} : {renewal},
  }
}
function yamlFor(offers: ReadonlyArray<Offer>): string {
  let yaml = 'domains:\n'
  for (const offer of offers) {
    yaml += `- domain: ${offer.domain}\n`
    yaml += `  vendor: ${offer.vendor}\n`
    if (offer.currency !== 'USD') {
      yaml += `  currency: ${offer.currency}\n`
    }
    yaml += `  firstYear: ${offer.firstYear}\n`
    if (offer.renewal != null) {
      yaml += `  renewal: ${offer.renewal}\n`
    }
  }
  return yaml
}
async function main(): Promise<void> {
  const {name, recency} = readOptions()
  const offers: Array<Offer> = []
  const counts = new Map<string, number>
  for (const vendor of vendors) {
    const batches = await Promise.all(PREFIX_BUCKETS.map(bucket => queryVictoria(queryFor(name, vendor, bucket, recency))))
    const latest = newestRows(batches.flat())
    let count = 0
    for (const row of latest.values()) {
      const offer = offerFromRow(name, vendor, row)
      if (!offer) {
        continue
      }
      offers.push(offer)
      count += 1
    }
    counts.set(vendor.id, count)
  }
  offers.sort((a, b) => a.domain.localeCompare(b.domain) || a.vendor.localeCompare(b.vendor))
  const output = join(import.meta.dirname, '..', 'private', 'data', `${name}.yml`)
  await mkdir(dirname(output), {recursive: true})
  await writeFile(output, yamlFor(offers), 'utf8')
  const detail = vendors.map(vendor => `${vendor.id}=${counts.get(vendor.id) ?? 0}`).join(', ')
  console.log(`Saved ${offers.length} offers to ${output} (${detail}; recency=${recency}s)`)
}
await main()
