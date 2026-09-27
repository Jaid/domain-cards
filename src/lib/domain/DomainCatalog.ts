import type {ColorScheme, PriceColorStop, PunycodeMode, RootDefaults, SortMode} from './types.ts'
import type {CSSProperties} from 'react'

import {parseDocument, YAMLParseError} from 'yaml'

import {readBoolean, readNumber, readRecord} from './coerce.ts'
import {defaultPriceColors, priceColors, priceColorsAtPrice, priceT, unavailableColors} from './color.ts'
import {displayDomain, hasPunycode} from './displayDomain.ts'
import {DomainOffer} from './DomainOffer.ts'
import {compareNullableNumber, readSort} from './sort.ts'

const listKeys = ['domains', 'items', 'records', 'offers'] as const

export function formatYamlError(error: unknown): string {
  if (error instanceof YAMLParseError) {
    const line = error.linePos?.[0]?.line
    const column = error.linePos?.[0]?.col
    const where = line ? `line ${line}${column ? `:${column}` : ''}` : undefined
    const message = error.message.replace(/^YAMLParseError:\s*/u, '')
    return where ? `${where} · ${message}` : message
  }
  if (Error.isError(error)) {
    return error.message
  }
  return String(error)
}

export function tryParseCatalog(text: string): {
  catalog: DomainCatalog
  ok: true
} | {
  error: string
  ok: false
} {
  try {
    return {
      ok: true,
      catalog: DomainCatalog.fromYaml(text),
    }
  } catch (error) {
    return {
      ok: false,
      error: formatYamlError(error),
    }
  }
}

function readOptionalNumber(value: unknown): number | undefined {
  return readNumber(value) ?? undefined
}
function readPunycode(value: unknown): PunycodeMode {
  if (value === false) {
    return false
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'raw' || normalized === 'code') {
      return normalized
    }
  }
  return 'code'
}
function normalizeHue(hue: number): number {
  return (hue % 360 + 360) % 360
}
function readColors(value: unknown): ReadonlyArray<PriceColorStop> {
  if (!Array.isArray(value)) {
    return defaultPriceColors
  }
  const colors: Array<PriceColorStop> = []
  for (const item of value) {
    if (typeof item === 'number' && Number.isFinite(item) && Number.isInteger(item)) {
      colors.push(normalizeHue(item))
      continue
    }
    const record = readRecord(item)
    if (!record) {
      continue
    }
    const hue = readNumber(record.hue)
    const saturation = readNumber(record.saturation)
    const lightness = readNumber(record.lightness)
    if (hue == null || saturation == null || lightness == null) {
      continue
    }
    const price = readNumber(record.price)
    colors.push({
      hue: normalizeHue(hue),
      saturation: Math.min(100, Math.max(0, saturation)),
      lightness: Math.min(100, Math.max(0, lightness)),
      ...price == null ? {} : {price},
    })
  }
  return colors.length > 0 ? colors : defaultPriceColors
}
function segmentCount(domain: string): number {
  return domain.split('.').length
}
function deduplicateOffers(offers: ReadonlyArray<DomainOffer>, sort: SortMode): Array<DomainOffer> {
  const byDomain = new Map<string, DomainOffer>
  for (const offer of offers) {
    const key = offer.domain.toLowerCase()
    const current = byDomain.get(key)
    if (!current || sort !== 'original' && compareOffers(offer, current, sort) < 0) {
      byDomain.set(key, offer)
    }
  }
  return [...byDomain.values()]
}
function priceRange(offers: ReadonlyArray<DomainOffer>, getPrice: (offer: DomainOffer) => number | null) {
  let min: number | null = null
  let max: number | null = null
  for (const offer of offers) {
    const price = getPrice(offer)
    if (price == null) {
      continue
    }
    min = min == null ? price : Math.min(min, price)
    max = max == null ? price : Math.max(max, price)
  }
  return {
    min,
    max,
  }
}
function readList(input: Record<string, unknown>): Array<unknown> {
  for (const key of listKeys) {
    const value = input[key]
    if (Array.isArray(value)) {
      return value
    }
  }
  return []
}
function readOffers(list: Array<unknown>, defaults: RootDefaults): Array<DomainOffer> {
  const offers: Array<DomainOffer> = []
  for (const [index, item] of list.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    const offer = DomainOffer.fromRecord(item as Record<string, unknown>, defaults, index)
    if (offer) {
      offers.push(offer)
    }
  }
  return offers
}
function compareOffers(a: DomainOffer, b: DomainOffer, mode: SortMode): number {
  if (mode === 'firstYear') {
    return compareNullableNumber(a.firstYearDollar, b.firstYearDollar)
  }
  if (mode === 'renewal') {
    return compareNullableNumber(a.renewalDollar, b.renewalDollar)
  }
  if (mode === 'length') {
    return a.domain.length - b.domain.length
  }
  return compareNullableNumber(a.threeYearDollar, b.threeYearDollar)
}

export class DomainCatalog {
  static fromUnknown(raw: unknown): DomainCatalog {
    if (Array.isArray(raw)) {
      return new DomainCatalog(readOffers(raw, {}), 'threeYears')
    }
    if (!raw || typeof raw !== 'object') {
      return new DomainCatalog([], 'threeYears')
    }
    const input = raw as Record<string, unknown>
    const list = readList(input)
    const defaults: RootDefaults = {
      vendor: input.vendor,
      registrar: input.registrar,
      vendorLogo: input.vendorLogo,
      vendorUrl: input.vendorUrl,
      currency: input.currency,
    }
    const maximumSegments = readNumber(input.maximumSegments)
    return new DomainCatalog(
      readOffers(list, defaults),
      readSort(input.sort),
      readBoolean(input.deduplication),
      maximumSegments == null ? undefined : Math.floor(maximumSegments),
      readColors(input.colors),
      readOptionalNumber(input.colorStart),
      readOptionalNumber(input.colorEnd),
      readPunycode(input.punycode),
    )
  }
  static fromYaml(text: string): DomainCatalog {
    const document = parseDocument(text, {prettyErrors: true})
    if (document.errors.length > 0) {
      throw document.errors[0]
    }
    return DomainCatalog.fromUnknown(document.toJS())
  }
  readonly colorEnd: number | undefined
  readonly colors: ReadonlyArray<PriceColorStop>
  readonly colorStart: number | undefined
  readonly deduplication: boolean
  readonly maxFirstYear: number | null
  readonly maximumSegments: number | undefined
  readonly maxThreeYear: number | null
  readonly minFirstYear: number | null
  readonly minThreeYear: number | null
  readonly offers: ReadonlyArray<DomainOffer>

  readonly punycode: PunycodeMode

  readonly sort: SortMode

  constructor(offers: ReadonlyArray<DomainOffer>, sort: SortMode = 'threeYears', deduplication = false, maximumSegments?: number, colors: ReadonlyArray<PriceColorStop> = defaultPriceColors, colorStart?: number, colorEnd?: number, punycode: PunycodeMode = 'code') {
    this.sort = sort
    this.deduplication = deduplication
    this.maximumSegments = maximumSegments
    this.punycode = punycode
    this.colors = colors.length > 0 ? colors : defaultPriceColors
    this.colorStart = colorStart
    this.colorEnd = colorEnd
    const filteredOffers = offers.filter(offer => {
      if (maximumSegments != null && segmentCount(offer.domain) > maximumSegments) {
        return false
      }
      return punycode !== false || !hasPunycode(offer.domain)
    })
    this.offers = deduplication ? deduplicateOffers(filteredOffers, sort) : filteredOffers
    const threeYearRange = priceRange(this.offers, offer => offer.threeYearDollar)
    this.minThreeYear = threeYearRange.min
    this.maxThreeYear = threeYearRange.max
    const firstYearRange = priceRange(this.offers, offer => offer.firstYearDollar)
    this.minFirstYear = firstYearRange.min
    this.maxFirstYear = firstYearRange.max
  }

  colorsFor(offer: DomainOffer, scheme: ColorScheme) {
    const useFirstYear = this.sort === 'firstYear'
    const price = useFirstYear ? offer.firstYearDollar : offer.threeYearDollar
    const annualFactor = useFirstYear ? 1 : 3
    if (price == null) {
      return unavailableColors(scheme)
    }
    const anchored = priceColorsAtPrice(price / annualFactor, scheme, this.colors)
    if (anchored) {
      return anchored
    }
    const min = this.colorStart == null ? useFirstYear ? this.minFirstYear : this.minThreeYear : this.colorStart * annualFactor
    const max = this.colorEnd == null ? useFirstYear ? this.maxFirstYear : this.maxThreeYear : this.colorEnd * annualFactor
    if (min == null || max == null) {
      return unavailableColors(scheme)
    }
    return priceColors(priceT(price, min, max), scheme, this.colors)
  }

  colorVars(offer: DomainOffer): CSSProperties {
    const dark = this.colorsFor(offer, 'dark')
    const light = this.colorsFor(offer, 'light')
    return {
      '--card-bg': dark.background,
      '--card-fg': dark.color,
      '--card-bg-light': light.background,
      '--card-fg-light': light.color,
    } as CSSProperties
  }

  displayDomain(offer: DomainOffer): string {
    return displayDomain(offer.domain, this.punycode === 'raw' ? 'raw' : 'code')
  }

  sorted(): Array<DomainOffer> {
    if (this.sort === 'original') {
      return [...this.offers]
    }
    const mode = this.sort
    return this.offers
      .map((offer, order) => ({
        offer,
        order,
      }))
      .sort((a, b) => compareOffers(a.offer, b.offer, mode) || a.order - b.order)
      .map(entry => entry.offer)
  }

  summaryFor(offer: DomainOffer): string {
    return offer.summaryFor(this.displayDomain(offer))
  }
}
