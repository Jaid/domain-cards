import {afterEach, beforeEach, describe, expect, test} from 'bun:test'

import {priceColorsAtPrice, unavailableColors} from '#src/lib/domain/color.ts'
import {DomainCatalog, priceColors, priceT} from '#src/lib/domain/index.ts'
import {setSuffixWidthsForTesting} from '#src/lib/domain/suffixWidth.ts'

describe('currency settings', () => {
  test('defaults both object catalogs and bare arrays to USD', () => {
    const domains = [{
      domain: 'default.test',
      firstYear: 10,
      renewal: 10,
    }]
    for (const input of [domains, {domains}]) {
      const catalog = DomainCatalog.fromUnknown(input)
      expect(catalog.currency).toBe('usd')
      expect(catalog.currencyValue).toEqual({eur: 1.15})
      expect(catalog.offers[0].currency).toBe('usd')
      expect(catalog.offers[0].price).toEqual({
        kind: 'yearly',
        amount: '$ 10',
      })
      expect(catalog.maxPrice).toBeUndefined()
      expect(catalog.maxWidth).toBeUndefined()
    }
  })
  test('inherits the root currency while retaining offer overrides and display prices', () => {
    const catalog = DomainCatalog.fromYaml(`
currency: eur
currencyValue:
  eur: 1.25
domains:
- domain: inherited.test
  firstYear: 10
  renewal: 20
- domain: overridden.test
  currency: USD
  firstYear: 10
  renewal: 20
`)
    expect(catalog.currency).toBe('eur')
    expect(catalog.currencyValue.eur).toBe(1.25)
    const [inherited, overridden] = catalog.offers
    expect(inherited.currency).toBe('eur')
    expect(inherited.firstYearDollar).toBe(12.5)
    expect(inherited.renewalDollar).toBe(25)
    expect(inherited.threeYearDollar).toBe(62.5)
    expect(inherited.price).toEqual({
      kind: 'split',
      firstYear: '€ 10',
      renewal: '€ 20',
    })
    expect(overridden.currency).toBe('USD')
    expect(overridden.firstYearDollar).toBe(10)
    expect(overridden.renewalDollar).toBe(20)
    expect(overridden.threeYearDollar).toBe(50)
    expect(catalog.sorted().map(offer => offer.domain)).toEqual(['overridden.test', 'inherited.test'])
  })
  test.each(['firstYear', 'renewal', 'threeYears'])('uses catalog-local rates for %s sorting and deduplication', sort => {
    const domains = [
      {
        domain: 'eur.test',
        vendor: 'regery',
        currency: 'eur',
        firstYear: 10,
        renewal: 10,
      },
      {
        domain: 'usd.test',
        vendor: 'porkbun',
        currency: 'usd',
        firstYear: 12,
        renewal: 12,
      },
    ]
    const original = DomainCatalog.fromUnknown({
      sort,
      domains,
    })
    const custom = DomainCatalog.fromUnknown({
      sort,
      currencyValue: {eur: 1.3},
      domains,
    })
    const deduplicated = DomainCatalog.fromUnknown({
      sort,
      currencyValue: {eur: 1.3},
      deduplication: true,
      domains: domains.map(offer => ({
        ...offer,
        domain: 'same.test',
      })),
    })
    expect(custom.sorted().map(offer => offer.domain)).toEqual(['usd.test', 'eur.test'])
    expect(deduplicated.offers.map(offer => offer.vendorName)).toEqual(['porkbun'])
    expect(original.sorted().map(offer => offer.domain)).toEqual(['eur.test', 'usd.test'])
    expect(original.offers[0].firstYearDollar).toBe(11.5)
    expect(custom.offers[0].firstYearDollar).toBe(13)
    expect(DomainCatalog.fromUnknown({domains}).offers[0].firstYearDollar).toBe(11.5)
  })
  test('retains case-insensitive root currency parsing for existing YAML', () => {
    expect(DomainCatalog.fromUnknown({
      currency: ' EUR ',
      domains: [],
    }).currency).toBe('eur')
    expect(DomainCatalog.fromUnknown({
      currency: 'USD',
      domains: [],
    }).currency).toBe('usd')
  })
  test('ignores invalid runtime limits and falls back for invalid exchange rates', () => {
    for (const eur of [0, -1, Infinity, NaN, 'invalid', null]) {
      const catalog = DomainCatalog.fromUnknown({
        currencyValue: {eur},
        maxPrice: -1,
        maxWidth: -1,
        colorSource: 'invalid',
        domains: [{
          domain: 'kept.test',
          currency: 'eur',
          firstYear: 10,
          renewal: 10,
        }],
      })
      expect(catalog.currencyValue.eur).toBe(1.15)
      expect(catalog.maxPrice).toBeUndefined()
      expect(catalog.maxWidth).toBeUndefined()
      expect(catalog.colorSource).toBe('threeYears')
      expect(catalog.offers).toHaveLength(1)
    }
  })
})
describe('maxPrice', () => {
  const domains = [
    {
      domain: 'boundary.test',
      firstYear: 10,
      renewal: 10,
    },
    {
      domain: 'registration-over.test',
      firstYear: 10.01,
      renewal: 1,
    },
    {
      domain: 'renewal-over.test',
      firstYear: 1,
      renewal: 10.01,
    },
    {
      domain: 'registration-missing.test',
      firstYear: null,
      renewal: 9,
    },
    {
      domain: 'renewal-missing.test',
      firstYear: 9,
      renewal: null,
    },
    {
      domain: 'unavailable.test',
      firstYear: null,
      renewal: null,
    },
    {
      domain: 'free.test',
      firstYear: 0,
      renewal: 0,
    },
    {
      domain: 'partial-over.test',
      firstYear: null,
      renewal: 11,
    },
  ]
  test('a scalar limits both prices, retaining exact boundaries and missing prices', () => {
    const catalog = DomainCatalog.fromUnknown({
      maxPrice: 10,
      domains,
    })
    expect(catalog.maxPrice).toBe(10)
    expect(catalog.offers.map(offer => offer.domain)).toEqual([
      'boundary.test',
      'registration-missing.test',
      'renewal-missing.test',
      'unavailable.test',
      'free.test',
    ])
  })
  test('registration refers to firstYear and does not limit renewal', () => {
    const catalog = DomainCatalog.fromUnknown({
      maxPrice: {registration: 10},
      domains,
    })
    expect(catalog.offers.map(offer => offer.domain)).toEqual(domains.filter(offer => offer.domain !== 'registration-over.test').map(offer => offer.domain))
  })
  test('renewal does not limit registration', () => {
    const catalog = DomainCatalog.fromUnknown({
      maxPrice: {renewal: 10},
      domains,
    })
    expect(catalog.offers.map(offer => offer.domain)).toEqual(domains.filter(offer => !['partial-over.test', 'renewal-over.test'].includes(offer.domain)).map(offer => offer.domain))
  })
  test('combines independent limits and supports zero', () => {
    const combined = DomainCatalog.fromUnknown({
      maxPrice: {
        registration: 9,
        renewal: 10,
      },
      domains,
    })
    expect(combined.offers.map(offer => offer.domain)).toEqual([
      'registration-missing.test',
      'renewal-missing.test',
      'unavailable.test',
      'free.test',
    ])
    const zero = DomainCatalog.fromUnknown({
      maxPrice: 0,
      domains,
    })
    expect(zero.offers.map(offer => offer.domain)).toEqual(['unavailable.test', 'free.test'])
    const empty = DomainCatalog.fromUnknown({
      maxPrice: {},
      domains,
    })
    expect(empty.offers).toHaveLength(domains.length)
  })
  test.each([10, {
    registration: 10,
    renewal: 10,
  }])('interprets %j in the root currency, including per-offer overrides', maxPrice => {
    const catalog = DomainCatalog.fromUnknown({
      currency: 'eur',
      currencyValue: {eur: 1.25},
      maxPrice,
      domains: [
        {
          domain: 'eur-boundary.test',
          firstYear: 10,
          renewal: 10,
        },
        {
          domain: 'usd-boundary.test',
          currency: 'usd',
          firstYear: 12.5,
          renewal: 12.5,
        },
        {
          domain: 'eur-over.test',
          firstYear: 10.01,
          renewal: 10,
        },
        {
          domain: 'usd-over.test',
          currency: 'USD',
          firstYear: 12.5,
          renewal: 12.51,
        },
      ],
    })
    expect(catalog.offers.map(offer => offer.domain)).toEqual(['eur-boundary.test', 'usd-boundary.test'])
  })
  test('custom rates affect USD-denominated limits', () => {
    const domains = [{
      domain: 'eur.test',
      currency: 'eur',
      firstYear: 10,
      renewal: 10,
    }]
    expect(DomainCatalog.fromUnknown({
      maxPrice: 12,
      domains,
    }).offers).toHaveLength(1)
    expect(DomainCatalog.fromUnknown({
      maxPrice: 12,
      currencyValue: {eur: 1.25},
      domains,
    }).offers).toHaveLength(0)
  })
  test('filters before deduplication and automatic color ranges', () => {
    const catalog = DomainCatalog.fromUnknown({
      sort: 'firstYear',
      deduplication: true,
      maxPrice: {renewal: 20},
      domains: [
        {
          domain: 'same.test',
          vendor: 'expensive-renewal',
          firstYear: 1,
          renewal: 100,
        },
        {
          domain: 'same.test',
          vendor: 'eligible',
          firstYear: 5,
          renewal: 10,
        },
        {
          domain: 'other.test',
          firstYear: 10,
          renewal: 20,
        },
      ],
    })
    expect(catalog.offers.map(offer => offer.domain)).toEqual(['same.test', 'other.test'])
    expect(catalog.offers[0].vendorName).toBe('eligible')
    expect(catalog.minFirstYear).toBe(5)
    expect(catalog.maxFirstYear).toBe(10)
    expect(catalog.minRenewal).toBe(10)
    expect(catalog.maxRenewal).toBe(20)
    expect(catalog.colorsFor(catalog.offers[0], 'dark')).toEqual(priceColors(0, 'dark'))
  })
})
describe('maxWidth', () => {
  beforeEach(() => {
    setSuffixWidthsForTesting([['in', 94], ['zip', 147], ['bar', 164], ['firm.in', 302]])
  })
  afterEach(() => {
    setSuffixWidthsForTesting([])
  })
  test('uses measured suffix width, retaining boundaries and unknown widths', () => {
    const domains = [
      {domain: 'long-prefix-does-not-count.zip'},
      {domain: 'one.in'},
      {domain: 'one.bar'},
      {domain: 'one.firm.in'},
      {domain: 'UPPER.ZIP.'},
      {domain: 'unknown.invalid'},
    ]
    const catalog = DomainCatalog.fromUnknown({
      maxWidth: 147,
      domains,
    })
    expect(catalog.maxWidth).toBe(147)
    expect(catalog.offers.map(offer => offer.domain)).toEqual([
      'long-prefix-does-not-count.zip',
      'one.in',
      'UPPER.ZIP.',
      'unknown.invalid',
    ])
    expect(DomainCatalog.fromUnknown({domains}).offers).toHaveLength(domains.length)
    expect(DomainCatalog.fromUnknown({
      maxWidth: 0,
      domains,
    }).offers.map(offer => offer.domain)).toEqual(['unknown.invalid'])
  })
  test('combines width, price, segment and punycode filters', () => {
    const catalog = DomainCatalog.fromUnknown({
      sort: 'width',
      maxWidth: 150,
      maxPrice: 10,
      maximumSegments: 2,
      punycode: false,
      domains: [
        {
          domain: 'kept.zip',
          firstYear: 10,
          renewal: 10,
        },
        {
          domain: 'kept.in',
          firstYear: 5,
          renewal: 5,
        },
        {
          domain: 'costly.zip',
          firstYear: 5,
          renewal: 11,
        },
        {
          domain: 'wide.bar',
          firstYear: 5,
          renewal: 5,
        },
        {
          domain: 'too.many.in',
          firstYear: 5,
          renewal: 5,
        },
        {
          domain: 'xn--bcher-kva.in',
          firstYear: 5,
          renewal: 5,
        },
      ],
    })
    expect(catalog.sorted().map(offer => offer.domain)).toEqual(['kept.in', 'kept.zip'])
  })
})
describe('colorSource', () => {
  const domains = [
    {
      domain: 'one.test',
      firstYear: 1,
      renewal: 100,
    },
    {
      domain: 'two.test',
      firstYear: 10,
      renewal: 40,
    },
    {
      domain: 'three.test',
      firstYear: 20,
      renewal: 5,
    },
  ]
  test('preserves legacy coloring when omitted', () => {
    expect(DomainCatalog.fromUnknown({domains}).colorSource).toBe('threeYears')
    expect(DomainCatalog.fromUnknown({
      sort: 'firstYear',
      domains,
    }).colorSource).toBe('registration')
    expect(DomainCatalog.fromUnknown({
      sort: 'renewal',
      domains,
    }).colorSource).toBe('threeYears')
  })
  test.each(['registration', 'renewal', 'threeYears'] as const)('%s coloring is independent of every sort mode', colorSource => {
    const prices = colorSource === 'registration' ? [1, 10, 20] : (colorSource === 'renewal' ? [100, 40, 5] : [201, 90, 30])
    for (const sort of ['original', 'firstYear', 'renewal', 'threeYears', 'jaid', 'width', 'length']) {
      const catalog = DomainCatalog.fromUnknown({
        sort,
        colorSource,
        domains,
      })
      expect(catalog.colorSource).toBe(colorSource)
      expect(catalog.sorted().map(offer => offer.domain)).toEqual(DomainCatalog.fromUnknown({
        sort,
        domains,
      }).sorted().map(offer => offer.domain))
      for (const scheme of ['dark', 'light'] as const) {
        for (const [index, offer] of catalog.offers.entries()) {
          expect(catalog.colorsFor(offer, scheme)).toEqual(priceColors(priceT(prices[index], Math.min(...prices), Math.max(...prices)), scheme))
        }
      }
    }
  })
  test('requires only the price selected by colorSource', () => {
    const partial = [
      {
        domain: 'registration-only.test',
        firstYear: 5,
      },
      {
        domain: 'renewal-only.test',
        renewal: 10,
      },
      {domain: 'unavailable.test'},
    ]
    const registration = DomainCatalog.fromUnknown({
      colorSource: 'registration',
      domains: partial,
    })
    const renewal = DomainCatalog.fromUnknown({
      colorSource: 'renewal',
      domains: partial,
    })
    const threeYears = DomainCatalog.fromUnknown({
      colorSource: 'threeYears',
      domains: partial,
    })
    for (const scheme of ['dark', 'light'] as const) {
      expect(registration.colorsFor(registration.offers[0], scheme)).toEqual(priceColors(0.5, scheme))
      expect(registration.colorsFor(registration.offers[1], scheme)).toEqual(unavailableColors(scheme))
      expect(renewal.colorsFor(renewal.offers[1], scheme)).toEqual(priceColors(0.5, scheme))
      expect(renewal.colorsFor(renewal.offers[0], scheme)).toEqual(unavailableColors(scheme))
      expect(renewal.colorsFor(renewal.offers[2], scheme)).toEqual(unavailableColors(scheme))
      for (const offer of threeYears.offers) {
        expect(threeYears.colorsFor(offer, scheme)).toEqual(unavailableColors(scheme))
      }
    }
  })
  test.each(['registration', 'renewal', 'threeYears'] as const)('interprets %s color bounds and price anchors in the root currency', colorSource => {
    const options = {
      currency: 'eur',
      currencyValue: {eur: 1.25},
      colorSource,
      colorStart: 0,
      colorEnd: 20,
      domains: [{
        domain: 'usd.test',
        currency: 'USD',
        firstYear: 12.5,
        renewal: 25,
      }],
    }
    const price = colorSource === 'registration' ? 12.5 : (colorSource === 'renewal' ? 25 : 62.5)
    const annualFactor = colorSource === 'threeYears' ? 3 : 1
    const unanchored = DomainCatalog.fromUnknown(options)
    expect(unanchored.colorsFor(unanchored.offers[0], 'dark')).toEqual(priceColors(priceT(price, 0, 25 * annualFactor), 'dark'))
    const colors = [
      {
        price: 0,
        hue: 150,
        saturation: 80,
        lightness: 40,
      },
      {
        price: 20,
        hue: 30,
        saturation: 80,
        lightness: 40,
      },
    ]
    const anchored = DomainCatalog.fromUnknown({
      ...options,
      colors,
    })
    expect(anchored.colorsFor(anchored.offers[0], 'dark')).toEqual(priceColorsAtPrice(price / annualFactor / 1.25, 'dark', colors)!)
  })
})
