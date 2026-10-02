import type {ColorScheme, ColorSource, Currency, CurrencyValue, MaxPrice, PriceColorStop, PunycodeMode, RootDefaults, SortMode} from './types.ts'
import type {CSSProperties} from 'react'

import {parseDocument, YAMLParseError} from 'yaml'

import {readBoolean, readNumber, readRecord, readString} from './coerce.ts'
import {defaultPriceColors, priceColors, priceColorsAtPrice, priceT, unavailableColors} from './color.ts'
import {defaultCurrency, defaultCurrencyValue, readCurrency, readCurrencyValue} from './currency.ts'
import {displayDomain, hasPunycode} from './displayDomain.ts'
import {DomainOffer} from './DomainOffer.ts'
import {dollarEquivalent} from './money.ts'
import {compareNullableNumber, readSort} from './sort.ts'
import {getDomainSuffixWidth} from './suffixWidth.ts'

type CatalogSettings = {
  colorSource?: ColorSource
  currency?: Currency
  currencyValue?: CurrencyValue
  maxPrice?: MaxPrice
  maxWidth?: number
}

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
function readNonnegativeNumber(value: unknown): number | undefined {
  const number = readNumber(value)
  return number != null && number >= 0 ? number : undefined
}
function readMaxPrice(value: unknown): MaxPrice | undefined {
  const limit = readNonnegativeNumber(value)
  if (limit != null) {
    return limit
  }
  const record = readRecord(value)
  if (!record) {
    return undefined
  }
  return {
    registration: readNonnegativeNumber(record.registration),
    renewal: readNonnegativeNumber(record.renewal),
  }
}
function readColorSource(value: unknown): ColorSource | undefined {
  const source = readString(value)
  return source === 'threeYears' || source === 'registration' || source === 'renewal' ? source : undefined
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
const jaidTldRank = new Map([
  ['zip', 0],
  ['bar', 1],
  ['show', 2],
  ['cooking', 3],
  ['in', 5],
])
function getJaidRank(domain: string): number {
  const normalized = domain.toLowerCase().replace(/\.$/u, '')
  return jaidTldRank.get(normalized.slice(normalized.lastIndexOf('.') + 1)) ?? 4
}
function compareOffers(a: DomainOffer, b: DomainOffer, mode: SortMode): number {
  if (mode === 'firstYear') {
    return compareNullableNumber(a.firstYearDollar, b.firstYearDollar)
  }
  if (mode === 'renewal') {
    return compareNullableNumber(a.renewalDollar, b.renewalDollar)
  }
  if (mode === 'jaid') {
    return getJaidRank(a.domain) - getJaidRank(b.domain)
  }
  if (mode === 'width') {
    return compareNullableNumber(getDomainSuffixWidth(a.domain), getDomainSuffixWidth(b.domain))
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
    const currency = readCurrency(input.currency)
    const currencyValue = readCurrencyValue(input.currencyValue)
    const defaults: RootDefaults = {
      vendor: input.vendor,
      registrar: input.registrar,
      vendorLogo: input.vendorLogo,
      vendorUrl: input.vendorUrl,
      currency,
      currencyValue,
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
      {
        currency,
        currencyValue,
        maxPrice: readMaxPrice(input.maxPrice),
        maxWidth: readNonnegativeNumber(input.maxWidth),
        colorSource: readColorSource(input.colorSource),
      },
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
  readonly colorSource: ColorSource
  readonly colorStart: number | undefined
  readonly currency: Currency
  readonly currencyValue: CurrencyValue
  readonly deduplication: boolean
  readonly maxFirstYear: number | null
  readonly maximumSegments: number | undefined
  readonly maxPrice: MaxPrice | undefined
  readonly maxRenewal: number | null
  readonly maxThreeYear: number | null
  readonly maxWidth: number | undefined
  readonly minFirstYear: number | null
  readonly minRenewal: number | null
  readonly minThreeYear: number | null
  readonly offers: ReadonlyArray<DomainOffer>

  readonly punycode: PunycodeMode

  readonly sort: SortMode

  constructor(offers: ReadonlyArray<DomainOffer>, sort: SortMode = 'threeYears', deduplication = false, maximumSegments?: number, colors: ReadonlyArray<PriceColorStop> = defaultPriceColors, colorStart?: number, colorEnd?: number, punycode: PunycodeMode = 'code', settings: CatalogSettings = {}) {
    this.sort = sort
    this.currency = settings.currency ?? defaultCurrency
    this.currencyValue = settings.currencyValue ?? defaultCurrencyValue
    this.maxPrice = settings.maxPrice
    this.maxWidth = settings.maxWidth
    this.colorSource = settings.colorSource ?? (sort === 'firstYear' ? 'registration' : 'threeYears')
    this.deduplication = deduplication
    this.maximumSegments = maximumSegments
    this.punycode = punycode
    this.colors = colors.length > 0 ? colors : defaultPriceColors
    this.colorStart = colorStart
    this.colorEnd = colorEnd
    const limits = typeof this.maxPrice === 'number' ? {registration: this.maxPrice, renewal: this.maxPrice} : this.maxPrice
    const maxRegistration = dollarEquivalent(limits?.registration ?? null, this.currency, this.currencyValue)
    const maxRenewal = dollarEquivalent(limits?.renewal ?? null, this.currency, this.currencyValue)
    const filteredOffers = offers.filter(offer => {
      const registration = offer.firstYearDollar
      const renewal = offer.renewalDollar
      if (maxRegistration != null && registration != null && registration > maxRegistration) {
        return false
      }
      if (maxRenewal != null && renewal != null && renewal > maxRenewal) {
        return false
      }
      if (this.maxWidth != null) {
        const width = getDomainSuffixWidth(offer.domain)
        if (width != null && width > this.maxWidth) {
          return false
        }
      }
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
    const renewalRange = priceRange(this.offers, offer => offer.renewalDollar)
    this.minRenewal = renewalRange.min
    this.maxRenewal = renewalRange.max
  }

  colorsFor(offer: DomainOffer, scheme: ColorScheme) {
    const useRegistration = this.colorSource === 'registration'
    const useRenewal = this.colorSource === 'renewal'
    const price = useRegistration ? offer.firstYearDollar : useRenewal ? offer.renewalDollar : offer.threeYearDollar
    const annualFactor = this.colorSource === 'threeYears' ? 3 : 1
    const currencyFactor = dollarEquivalent(1, this.currency, this.currencyValue)!
    if (price == null) {
      return unavailableColors(scheme)
    }
    const anchored = priceColorsAtPrice(price / annualFactor / currencyFactor, scheme, this.colors)
    if (anchored) {
      return anchored
    }
    const min = this.colorStart == null ? useRegistration ? this.minFirstYear : useRenewal ? this.minRenewal : this.minThreeYear : this.colorStart * annualFactor * currencyFactor
    const max = this.colorEnd == null ? useRegistration ? this.maxFirstYear : useRenewal ? this.maxRenewal : this.maxThreeYear : this.colorEnd * annualFactor * currencyFactor
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
