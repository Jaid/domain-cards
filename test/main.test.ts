import {describe, expect, test} from 'bun:test'

import {
  displayDomain,
  DomainCatalog,
  exampleYaml,
  formatMoney,
  formatYamlError,
  priceColors,
  priceT,
  registrarHost,
  tryParseCatalog,
} from '#src/lib/domain/index.ts'
import {setSuffixWidthsForTesting} from '#src/lib/domain/suffixWidth.ts'

const fixture = `
sort: firstYear
vendor: porkbun
vendorUrl: https://porkbun.com
currency: USD
domains:
  - domain: mid.example
    firstYear: 20
    renewal: 20
  - domain: cheap.example
    firstYear: 5
    renewal: 10
    vendor: spaceship
  - domain: missing.example
    firstYear: null
    renewal: 9
  - domain: long-domain.example
    firstYear: 8
    renewal: 8
    premium: true
  - domain: cheap.example
    vendor: vercel
    firstYear: 6
    renewal: 12
`
describe('DomainCatalog', () => {
  test('parses the bundled example and sorts by three-year total', () => {
    const catalog = DomainCatalog.fromYaml(exampleYaml)
    expect(catalog.sort).toBe('threeYears')
    expect(catalog.offers.map(offer => offer.domain)).toEqual([
      'slop.accountant',
      'slop.actor',
      'slop.movie',
    ])
    expect(catalog.sorted().map(offer => offer.domain)).toEqual([
      'slop.accountant',
      'slop.actor',
      'slop.movie',
    ])
    expect(catalog.offers[0]?.price.kind).toBe('yearly')
    expect(catalog.offers[1]?.price.kind).toBe('split')
    expect(catalog.offers[0]?.threeYearPrice).toBeCloseTo(62.64)
    expect(catalog.offers[1]?.threeYearPrice).toBeCloseTo(81.87)
    expect(catalog.offers[2]?.threeYearPrice).toBeCloseTo(515.97)
  })
  test('supports punycode filtering and display modes', () => {
    const domains = [
      {
        domain: 'plain.example',
        firstYear: 5,
        renewal: 5,
      },
      {
        domain: 'slop.xn--fiq228c5hs',
        firstYear: 10,
        renewal: 10,
      },
    ]
    const skipped = DomainCatalog.fromUnknown({
      punycode: false,
      domains,
    })
    expect(skipped.punycode).toBe(false)
    expect(skipped.offers.map(offer => offer.domain)).toEqual(['plain.example'])
    const raw = DomainCatalog.fromUnknown({
      punycode: 'raw',
      domains,
    })
    const rawOffer = raw.offers[1]
    expect(raw.punycode).toBe('raw')
    expect(raw.displayDomain(rawOffer)).toBe('slop.xn--fiq228c5hs')
    expect(raw.summaryFor(rawOffer)).toContain('slop.xn--fiq228c5hs')
    const code = DomainCatalog.fromUnknown({
      punycode: 'code',
      domains,
    })
    const codeOffer = code.offers[1]
    expect(code.punycode).toBe('code')
    expect(code.displayDomain(codeOffer)).toBe('slop.中文网')
    expect(code.summaryFor(codeOffer)).toContain('slop.中文网')
    const defaultMode = DomainCatalog.fromUnknown({domains})
    expect(defaultMode.punycode).toBe('code')
    expect(defaultMode.displayDomain(defaultMode.offers[1])).toBe('slop.中文网')
  })
  test('accepts a bare array and items as a domains alias', () => {
    const fromArray = DomainCatalog.fromUnknown([
      {
        domain: 'b.test',
        firstYear: 2,
        renewal: 2,
        currency: 'USD',
      },
      {
        domain: 'a.test',
        firstYear: 1,
        renewal: 1,
        currency: 'USD',
      },
    ])
    expect(fromArray.sort).toBe('threeYears')
    expect(fromArray.sorted().map(offer => offer.domain)).toEqual(['a.test', 'b.test'])
    const fromItems = DomainCatalog.fromYaml(`
items:
  - domain: kept.test
    vendor: regery
    currency: EUR
    firstYear: 3
    renewal: 4
`)
    expect(fromItems.offers).toHaveLength(1)
    expect(fromItems.offers[0]?.vendorName).toBe('regery')
    expect(fromItems.offers[0]?.hasBundledVendorIcon).toBe(true)
    expect(fromItems.offers[0]?.logoSources).toHaveLength(1)
    expect(fromItems.offers[0]?.logoSources[0]).not.toContain('google.com')
  })
  test('applies root vendor defaults and per-record overrides', () => {
    const catalog = DomainCatalog.fromYaml(fixture)
    const mid = catalog.offers.find(offer => offer.domain === 'mid.example')
    const cheap = catalog.offers.find(offer => offer.domain === 'cheap.example' && offer.vendorName === 'spaceship')
    expect(mid?.vendorName).toBe('porkbun')
    expect(mid?.hasBundledVendorIcon).toBe(true)
    expect(mid?.logoSources).toHaveLength(1)
    expect(mid?.logoSources[0]).not.toContain('google.com')
    expect(cheap?.vendorName).toBe('spaceship')
    expect(cheap?.hasBundledVendorIcon).toBe(true)
    expect(cheap?.logoSources).toHaveLength(1)
    expect(cheap?.logoSources[0]).toContain('spaceship')
    expect(cheap?.logoSources[0]).not.toContain('google.com')
  })
  test('filters domains by maximumSegments when configured', () => {
    const unlimited = DomainCatalog.fromUnknown({
      domains: [
        {domain: 'slop.com'},
        {domain: 'slop.firm.in'},
        {domain: 'single'},
      ],
    })
    expect(unlimited.maximumSegments).toBeUndefined()
    expect(unlimited.offers.map(offer => offer.domain)).toEqual(['slop.com', 'slop.firm.in', 'single'])
    const limited = DomainCatalog.fromUnknown({
      maximumSegments: 2,
      domains: [
        {domain: 'slop.com'},
        {domain: 'slop.firm.in'},
        {domain: 'single'},
      ],
    })
    expect(limited.maximumSegments).toBe(2)
    expect(limited.offers.map(offer => offer.domain)).toEqual(['slop.com', 'single'])
  })
  test('keeps multiple vendor rows by default and deduplicates to the best active-sort offer when enabled', () => {
    const catalog = DomainCatalog.fromYaml(fixture)
    expect(catalog.deduplication).toBe(false)
    const cheap = catalog.offers.filter(offer => offer.domain === 'cheap.example')
    expect(cheap).toHaveLength(2)
    expect(new Set(cheap.map(offer => offer.vendorName))).toEqual(new Set(['spaceship', 'vercel']))
    const deduplicated = DomainCatalog.fromYaml(fixture.replace('sort: firstYear', 'sort: firstYear\ndeduplication: true'))
    expect(deduplicated.deduplication).toBe(true)
    expect(deduplicated.offers.filter(offer => offer.domain === 'cheap.example')).toHaveLength(1)
    expect(deduplicated.offers.find(offer => offer.domain === 'cheap.example')?.vendorName).toBe('spaceship')
  })
  test('deduplication uses the active price sort and preserves the first row on ties', () => {
    const renewal = DomainCatalog.fromUnknown({
      sort: 'renewal',
      deduplication: true,
      domains: [
        {
          domain: 'same.test',
          vendor: 'spaceship',
          firstYear: 1,
          renewal: 20,
        },
        {
          domain: 'same.test',
          vendor: 'vercel',
          firstYear: 5,
          renewal: 10,
        },
      ],
    })
    expect(renewal.offers).toHaveLength(1)
    expect(renewal.offers[0]?.vendorName).toBe('vercel')
    const tied = DomainCatalog.fromUnknown({
      sort: 'threeYears',
      deduplication: true,
      domains: [
        {
          domain: 'tie.test',
          vendor: 'spaceship',
          firstYear: 5,
          renewal: 5,
        },
        {
          domain: 'tie.test',
          vendor: 'vercel',
          firstYear: 5,
          renewal: 5,
        },
      ],
    })
    expect(tied.offers).toHaveLength(1)
    expect(tied.offers[0]?.vendorName).toBe('spaceship')
    const original = DomainCatalog.fromUnknown({
      sort: 'original',
      deduplication: true,
      domains: [
        {
          domain: 'original.test',
          vendor: 'spaceship',
          firstYear: 50,
          renewal: 50,
        },
        {
          domain: 'original.test',
          vendor: 'vercel',
          firstYear: 1,
          renewal: 1,
        },
      ],
    })
    expect(original.offers).toHaveLength(1)
    expect(original.offers[0]?.vendorName).toBe('spaceship')
  })
  test('normalizes EUR prices to dollars for sorting, deduplication and coloring', () => {
    const domains = [
      {
        domain: 'usd.test',
        vendor: 'vercel',
        currency: 'USD',
        firstYear: 9.5,
        renewal: 9.5,
      },
      {
        domain: 'eur.test',
        vendor: 'regery',
        currency: 'EUR',
        firstYear: 10,
        renewal: 10,
      },
    ]
    const firstYear = DomainCatalog.fromUnknown({
      sort: 'firstYear',
      domains,
    })
    const eur = firstYear.offers[1]
    expect(eur.firstYearDollar).toBe(11.5)
    expect(eur.renewalDollar).toBe(11.5)
    expect(eur.threeYearPrice).toBe(30)
    expect(eur.threeYearDollar).toBe(34.5)
    expect(eur.price).toEqual({
      kind: 'yearly',
      amount: '€ 10',
    })
    expect(firstYear.minFirstYear).toBe(9.5)
    expect(firstYear.maxFirstYear).toBe(11.5)
    expect(firstYear.sorted().map(offer => offer.domain)).toEqual(['usd.test', 'eur.test'])
    const threeYears = DomainCatalog.fromUnknown({domains})
    expect(threeYears.minThreeYear).toBe(28.5)
    expect(threeYears.maxThreeYear).toBe(34.5)
    expect(threeYears.sorted().map(offer => offer.domain)).toEqual(['usd.test', 'eur.test'])
    const colored = DomainCatalog.fromUnknown({
      sort: 'firstYear',
      colorStart: 0,
      colorEnd: 20,
      domains,
    })
    expect(colored.colorsFor(colored.offers[1], 'dark').background).toBe(
      priceColors(priceT(11.5, 0, 20), 'dark').background,
    )
    const coloredThreeYears = DomainCatalog.fromUnknown({
      colorStart: 0,
      colorEnd: 20,
      domains,
    })
    expect(coloredThreeYears.colorsFor(coloredThreeYears.offers[1], 'dark').background).toBe(
      priceColors(priceT(34.5, 0, 60), 'dark').background,
    )
    const deduplicated = DomainCatalog.fromUnknown({
      sort: 'firstYear',
      deduplication: true,
      domains: [
        {
          ...domains[0],
          domain: 'same.test',
        },
        {
          ...domains[1],
          domain: 'same.test',
        },
      ],
    })
    expect(deduplicated.offers).toHaveLength(1)
    expect(deduplicated.offers[0]?.currency).toBe('USD')
  })
  test('sorts numerically with missing prices last and preserves YAML order on ties', () => {
    const catalog = DomainCatalog.fromYaml(fixture)
    expect(catalog.sort).toBe('firstYear')
    expect(catalog.sorted().map(offer => offer.domain)).toEqual([
      'cheap.example',
      'cheap.example',
      'long-domain.example',
      'mid.example',
      'missing.example',
    ])
    expect(catalog.sorted()[0]?.vendorName).toBe('spaceship')
    expect(catalog.sorted()[1]?.vendorName).toBe('vercel')
    const byLength = new DomainCatalog(catalog.offers, 'length').sorted().map(offer => offer.domain)
    expect(byLength).toEqual([
      'mid.example',
      'cheap.example',
      'cheap.example',
      'missing.example',
      'long-domain.example',
    ])
    const original = new DomainCatalog(catalog.offers, 'original').sorted().map(offer => offer.domain)
    expect(original).toEqual([
      'mid.example',
      'cheap.example',
      'missing.example',
      'long-domain.example',
      'cheap.example',
    ])
  })
  test('sorts by suffix width and Jaid preference', () => {
    setSuffixWidthsForTesting([
      ['zip', 147],
      ['bar', 164],
      ['show', 258],
      ['cooking', 367],
      ['in', 94],
      ['firm.in', 302],
      ['example', 220],
    ])
    const domains = [
      {domain: 'one.in'},
      {domain: 'two.example'},
      {domain: 'three.cooking'},
      {domain: 'four.zip'},
      {domain: 'five.show'},
      {domain: 'six.bar'},
      {domain: 'seven.firm.in'},
      {domain: 'unknown.invalid'},
    ]
    const byWidth = DomainCatalog.fromUnknown({
      sort: 'width',
      domains,
    })
    expect(byWidth.sort).toBe('width')
    expect(byWidth.sorted().map(offer => offer.domain)).toEqual([
      'one.in',
      'four.zip',
      'six.bar',
      'two.example',
      'five.show',
      'seven.firm.in',
      'three.cooking',
      'unknown.invalid',
    ])
    const byJaid = DomainCatalog.fromUnknown({
      sort: 'jaid',
      domains,
    })
    expect(byJaid.sort).toBe('jaid')
    expect(byJaid.sorted().map(offer => offer.domain)).toEqual([
      'four.zip',
      'six.bar',
      'five.show',
      'three.cooking',
      'two.example',
      'unknown.invalid',
      'one.in',
      'seven.firm.in',
    ])
  })
  test('colors cards from the active first-year range when sorted by first year', () => {
    const catalog = DomainCatalog.fromYaml(fixture)
    const cheap = catalog.offers.find(offer => offer.domain === 'cheap.example' && offer.vendorName === 'spaceship')!
    const mid = catalog.offers.find(offer => offer.domain === 'mid.example')!
    const missing = catalog.offers.find(offer => offer.domain === 'missing.example')!
    const cheapColor = catalog.colorsFor(cheap, 'dark').background
    const midColor = catalog.colorsFor(mid, 'dark').background
    const missingColor = catalog.colorsFor(missing, 'dark').background
    expect(cheapColor).toBe(priceColors(priceT(5, 5, 20), 'dark').background)
    expect(midColor).toBe(priceColors(priceT(20, 5, 20), 'dark').background)
    expect(missingColor).not.toBe(cheapColor)
    expect(cheapColor.startsWith('#')).toBe(true)
    expect(priceT(catalog.minThreeYear!, catalog.minThreeYear!, catalog.maxThreeYear!)).toBe(0)
    expect(priceT(catalog.maxThreeYear!, catalog.minThreeYear!, catalog.maxThreeYear!)).toBe(1)
    expect(priceColors(0, 'dark').background).not.toBe(priceColors(1, 'dark').background)
    const wideCheap = priceT(8, 2, 4000)
    const wideMid = priceT(80, 2, 4000)
    expect(wideMid).toBeGreaterThan(wideCheap + 0.15)
    expect(priceT(25, 1.18, 10_350.2)).toBeCloseTo(0.5, 2)
  })
  test('allows colorStart and colorEnd to override automatic color bounds independently', () => {
    const domains = [
      {
        domain: 'cheap.test',
        firstYear: 10,
        renewal: 10,
      },
      {
        domain: 'mid.test',
        firstYear: 20,
        renewal: 20,
      },
      {
        domain: 'expensive.test',
        firstYear: 30,
        renewal: 30,
      },
    ]
    const both = DomainCatalog.fromUnknown({
      sort: 'firstYear',
      colorStart: 0,
      colorEnd: 100,
      domains,
    })
    const mid = both.offers[1]
    expect(both.colorStart).toBe(0)
    expect(both.colorEnd).toBe(100)
    expect(both.colorsFor(mid, 'dark').background).toBe(priceColors(priceT(20, 0, 100), 'dark').background)
    const startOnly = DomainCatalog.fromUnknown({
      sort: 'firstYear',
      colorStart: 0,
      domains,
    })
    expect(startOnly.colorsFor(startOnly.offers[1], 'dark').background).toBe(priceColors(priceT(20, 0, 30), 'dark').background)
    const endOnly = DomainCatalog.fromUnknown({
      sort: 'firstYear',
      colorEnd: 100,
      domains,
    })
    expect(endOnly.colorsFor(endOnly.offers[1], 'dark').background).toBe(priceColors(priceT(20, 10, 100), 'dark').background)
    const threeYears = DomainCatalog.fromUnknown({
      colorStart: 0,
      colorEnd: 100,
      domains,
    })
    expect(threeYears.colorsFor(threeYears.offers[1], 'dark').background).toBe(priceColors(priceT(60, 0, 300), 'dark').background)
  })
  test('anchors colors to explicit annual dollar prices', () => {
    const colors = [
      {
        price: 1,
        hue: 250,
        saturation: 100,
        lightness: 40,
      },
      {
        price: 10,
        hue: 150,
        saturation: 100,
        lightness: 50,
      },
      {
        price: 20,
        hue: 90,
        saturation: 100,
        lightness: 70,
      },
      {
        price: 40,
        hue: 48,
        saturation: 100,
        lightness: 66,
      },
      {
        price: 80,
        hue: 30,
        saturation: 100,
        lightness: 45,
      },
    ]
    const prices = [1, 10, 20, 40, 80]
    const firstYear = DomainCatalog.fromUnknown({
      sort: 'firstYear',
      colors,
      domains: prices.map(price => ({
        domain: `price-${price}.test`,
        firstYear: price,
        renewal: price,
      })),
    })
    expect(firstYear.colors).toEqual(colors)
    for (const [index, offer] of firstYear.offers.entries()) {
      expect(firstYear.colorsFor(offer, 'dark').background).toBe(
        priceColors(index / (colors.length - 1), 'dark', colors).background,
      )
    }
    const midpoint = DomainCatalog.fromUnknown({
      sort: 'firstYear',
      colors,
      domains: [{
        domain: 'midpoint.test',
        firstYear: 15,
        renewal: 15,
      }],
    })
    expect(midpoint.colorsFor(midpoint.offers[0], 'dark').background).toBe(
      priceColors(0.5, 'dark', [colors[1], colors[2]]).background,
    )
    const threeYears = DomainCatalog.fromUnknown({
      colors,
      domains: [{
        domain: 'annual-20.test',
        firstYear: 20,
        renewal: 20,
      }],
    })
    expect(threeYears.colorsFor(threeYears.offers[0], 'dark').background).toBe(
      priceColors(0.5, 'dark', colors).background,
    )
    const eur = DomainCatalog.fromUnknown({
      sort: 'firstYear',
      colors,
      domains: [{
        domain: 'eur.test',
        currency: 'EUR',
        firstYear: 20 / 1.15,
        renewal: 20 / 1.15,
      }],
    })
    expect(eur.colorsFor(eur.offers[0], 'dark').background).toBe(
      priceColors(0.5, 'dark', colors).background,
    )
  })
  test('interpolates configurable OKHSL price colors from YAML', () => {
    const middle = {
      hue: 240,
      saturation: 72,
      lightness: 44,
    }
    const colors = [120, middle, 0]
    const catalog = DomainCatalog.fromUnknown({
      sort: 'firstYear',
      colors,
      domains: [
        {
          domain: 'cheap.test',
          firstYear: 1,
        },
        {
          domain: 'mid.test',
          firstYear: 9,
        },
        {
          domain: 'expensive.test',
          firstYear: 99,
        },
      ],
    })
    expect(catalog.colors).toEqual(colors)
    expect(catalog.colorsFor(catalog.offers[0], 'dark').background).toBe(priceColors(0, 'dark', colors).background)
    expect(priceColors(0.5, 'dark', colors).background).toBe(priceColors(0.5, 'light', [middle]).background)
    expect(priceColors(0.5, 'dark', [350, 10]).background).toBe(priceColors(0.5, 'dark', [0]).background)
    expect(priceColors(0.5, 'dark', [
      {
        hue: 0,
        saturation: 20,
        lightness: 20,
      },
      {
        hue: 0,
        saturation: 80,
        lightness: 80,
      },
    ]).background).toBe(priceColors(0.5, 'dark', [{
      hue: 0,
      saturation: 50,
      lightness: 50,
    }]).background)
    expect(priceColors(0.25, 'dark', [
      {
        hue: 0,
        saturation: 50,
        lightness: 20,
      },
      {
        hue: 0,
        saturation: 50,
        lightness: 80,
      },
    ]).background).toBe(priceColors(0.25, 'dark', [{
      hue: 0,
      saturation: 50,
      lightness: 33.3125,
    }]).background)
  })
  test('formats compact yearly prices and a quiet unavailable state', () => {
    expect(formatMoney(20.88, 'USD')).toContain('20.88')
    const catalog = DomainCatalog.fromYaml(fixture)
    expect(catalog.offers[0]?.price).toEqual({
      kind: 'yearly',
      amount: '$ 20',
    })
    expect(catalog.offers.find(offer => offer.domain === 'cheap.example' && offer.vendorName === 'spaceship')?.price).toEqual({
      kind: 'split',
      firstYear: '$ 5',
      renewal: '$ 10',
    })
    expect(catalog.offers.find(offer => offer.domain === 'missing.example')?.price).toEqual({
      kind: 'split',
      firstYear: undefined,
      renewal: '$ 9',
    })
    expect(catalog.offers.find(offer => offer.domain === 'missing.example')?.threeYearPrice).toBeNull()
    expect(catalog.offers.find(offer => offer.domain === 'long-domain.example')?.premium).toBe(true)
  })
  test('keeps the last valid parse result on YAML errors', () => {
    const parsed = tryParseCatalog('sort: [')
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.error.length).toBeGreaterThan(0)
    }
    expect(formatYamlError(new Error('nope'))).toBe('nope')
  })
})
test('decodes punycode domains for display without changing canonical domains', () => {
  expect(displayDomain('slop.xn--fiq228c5hs')).toBe('slop.中文网')
  expect(displayDomain('xn--bcher-kva.example')).toBe('bücher.example')
  expect(displayDomain('plain.example')).toBe('plain.example')
})
describe('vendor logos', () => {
  test('maps common registrar names to official domains', () => {
    expect(registrarHost('Porkbun')).toBe('porkbun.com')
    expect(registrarHost('spaceship')).toBe('spaceship.com')
    expect(registrarHost('Namecheap, Inc.')).toBe('namecheap.com')
    expect(registrarHost('njal.la')).toBe('njal.la')
    expect(registrarHost('totally-unknown-registrar')).toBeUndefined()
  })
  test('uses bundled icons before favicon fallbacks', () => {
    const catalog = DomainCatalog.fromUnknown([
      {
        domain: 'spaceship.test',
        vendor: 'spaceship',
      },
      {
        domain: 'vercel.test',
        vendor: 'vercel',
      },
      {
        domain: 'porkbun.test',
        vendor: 'porkbun',
      },
      {
        domain: 'regery.test',
        vendor: 'regery',
      },
    ])
    const [spaceship, vercel, porkbun, regery] = catalog.offers
    expect(spaceship?.hasBundledVendorIcon).toBe(true)
    expect(vercel?.hasBundledVendorIcon).toBe(true)
    expect(spaceship?.logoSources).toHaveLength(1)
    expect(vercel?.logoSources).toHaveLength(1)
    expect(spaceship?.logoSources[0]).not.toContain('google.com')
    expect(vercel?.logoSources[0]).not.toContain('google.com')
    expect(porkbun?.hasBundledVendorIcon).toBe(true)
    expect(porkbun?.logoSources).toHaveLength(1)
    expect(porkbun?.logoSources[0]).not.toContain('google.com')
    expect(regery?.hasBundledVendorIcon).toBe(true)
    expect(regery?.logoSources).toHaveLength(1)
    expect(regery?.logoSources[0]).not.toContain('google.com')
  })
})
