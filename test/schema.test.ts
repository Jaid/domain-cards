import type {Data} from '#src/lib/schema/data.ts'

import {describe, expect, test} from 'bun:test'
import {parse} from 'yaml'

import {exampleYaml} from '#src/lib/domain/index.ts'
import {dataJsonSchema, dataSchema} from '#src/lib/schema/data.ts'

describe('data schema', () => {

  test('exports a Draft-07 JSON Schema for Monacozen', () => {
    expect(dataJsonSchema).toMatchObject({
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: 'Domain Cards Data',
      type: 'object',
      additionalProperties: false,
      required: ['domains'],
      properties: {
        sort: {
          default: 'threeYears',
          enum: ['firstYear', 'renewal', 'threeYears', 'length', 'original'],
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

  test('rejects unknown root and offer properties', () => {
    expect(() => dataSchema.parse({
      domains: [{domain: 'example.com', extra: true}],
    })).toThrow()
    expect(() => dataSchema.parse({
      domains: [],
      extra: true,
    })).toThrow()
  })
})
