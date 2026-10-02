import type {Data} from '#src/lib/schema/data.ts'

import {describe, expect, test} from 'bun:test'

import {parse} from 'yaml'

import {exampleYaml} from '#src/lib/domain/index.ts'
import {dataJsonSchema, dataSchema} from '#src/lib/schema/data.ts'

describe('data schema', () => {
  test('exports a Draft 2020-12 JSON Schema for Monacozen', () => {
    expect(dataJsonSchema).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'Domain Cards Data',
      type: 'object',
      additionalProperties: false,
      required: ['domains'],
      properties: {
        sort: {
          default: 'threeYears',
          enum: ['firstYear', 'renewal', 'threeYears', 'jaid', 'width', 'length', 'original'],
        },
        domains: {
          type: 'array',
        },
      },
    })
  })
  test('accepts the bundled example catalog', () => {
    const parsed = dataSchema.parse(parse(exampleYaml))
    expect(parsed.domains.map(offer => offer.domain)).toEqual([
      'slop.accountant',
      'slop.actor',
      'slop.movie',
    ])
    expect(parsed.sort).toBe('threeYears')
  })
  test('applies schema defaults to minimal authored data', () => {
    const input: Data = {
      domains: [
        {
          domain: 'example.com',
          firstYear: null,
          renewal: 12,
          vendor: {
            name: 'Example Registrar',
            url: 'https://example.com',
          },
        },
      ],
    }
    expect(dataSchema.parse(input)).toMatchObject({
      currency: 'usd',
      currencyValue: {eur: 1.15},
      sort: 'threeYears',
      deduplication: false,
      punycode: 'code',
      domains: [
        {
          domain: 'example.com',
          firstYear: null,
          renewal: 12,
          premium: false,
        },
      ],
    })
  })
  test('exposes currency, price limits, width limits and color sources to the editor', () => {
    expect(dataJsonSchema).toMatchObject({
      properties: {
        currency: {enum: ['usd', 'eur'], default: 'usd'},
        currencyValue: {
          type: 'object',
          additionalProperties: false,
          default: {eur: 1.15},
          properties: {eur: {type: 'number', exclusiveMinimum: 0, default: 1.15}},
        },
        maxPrice: {
          anyOf: [
            {type: 'number', minimum: 0},
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                registration: {type: 'number', minimum: 0},
                renewal: {type: 'number', minimum: 0},
              },
            },
          ],
        },
        maxWidth: {type: 'number', minimum: 0},
        colorSource: {enum: ['threeYears', 'registration', 'renewal']},
      },
    })
  })
  test('accepts scalar and independent limits in typed input', () => {
    const input: Data = {
      currency: 'eur',
      currencyValue: {eur: 1.25},
      maxPrice: {registration: 10, renewal: 20},
      maxWidth: 300,
      colorSource: 'renewal',
      domains: [],
    }
    expect(dataSchema.parse(input)).toMatchObject(input)
    for (const maxPrice of [0, 20, {}, {registration: 10}, {renewal: 20}]) {
      expect(dataSchema.safeParse({...input, maxPrice}).success).toBe(true)
    }
    for (const colorSource of ['registration', 'renewal', 'threeYears']) {
      expect(dataSchema.safeParse({...input, colorSource}).success).toBe(true)
    }
    expect(dataSchema.parse({currencyValue: {}, domains: []}).currencyValue).toEqual({eur: 1.15})
  })
  test('rejects invalid settings and unknown nested properties', () => {
    const invalid = [
      {currency: 'gbp'},
      {currency: 'USD'},
      {colorSource: 'firstYear'},
      {maxPrice: -1},
      {maxPrice: Infinity},
      {maxPrice: NaN},
      {maxPrice: '20'},
      {maxPrice: {registration: -1}},
      {maxPrice: {renewal: Infinity}},
      {maxPrice: {firstYear: 10}},
      {maxWidth: -1},
      {maxWidth: Infinity},
      {currencyValue: {eur: 0}},
      {currencyValue: {eur: -1}},
      {currencyValue: {eur: Infinity}},
      {currencyValue: {eur: NaN}},
      {currencyValue: {eur: '1.15'}},
      {currencyValue: {usd: 1}},
    ]
    for (const settings of invalid) {
      expect(dataSchema.safeParse({...settings, domains: []}).success).toBe(false)
    }
  })
  test('rejects unknown root and offer properties', () => {
    expect(() => dataSchema.parse({
      domains: [{
        domain: 'example.com',
        extra: true,
      }],
    })).toThrow()
    expect(() => dataSchema.parse({
      domains: [],
      extra: true,
    })).toThrow()
  })
})
