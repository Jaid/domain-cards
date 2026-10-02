import zod from 'zod'

import {defaultCurrency, defaultCurrencyValue} from '#src/lib/domain/currency.ts'

const nonEmptyString = zod.string().trim().nonempty()
const finiteNumber = zod.number()
const priceSchema = finiteNumber.nonnegative().nullable().describe('domain price; null means the registrar did not provide a price')
const vendorSchema = zod.union([
  nonEmptyString,
  zod.strictObject({
    name: nonEmptyString.optional().describe('registrar or vendor display name'),
    url: nonEmptyString.optional().describe('registrar or vendor website URL'),
    logo: nonEmptyString.optional().describe('custom vendor logo URL'),
  }).refine(
    vendor => vendor.name !== undefined || vendor.url !== undefined || vendor.logo !== undefined,
    'Specify at least a vendor name, URL, or logo.',
  ),
]).describe('registrar/vendor name shorthand or detailed vendor definition')
const colorStopSchema = zod.union([
  finiteNumber.describe('hue in degrees; saturation and lightness are chosen automatically'),
  zod.strictObject({
    hue: finiteNumber.describe('OKHSL hue in degrees'),
    saturation: finiteNumber.min(0).max(100).describe('OKHSL saturation percentage'),
    lightness: finiteNumber.min(0).max(100).describe('OKHSL lightness percentage'),
    price: finiteNumber.nonnegative().optional().describe('optional annual price anchor in the top-level currency for this color'),
  }),
]).describe('one price-color gradient stop')
const domainOfferSchema = zod.strictObject({
  domain: nonEmptyString.describe('domain name shown on the card'),
  vendor: vendorSchema.optional(),
  registrar: nonEmptyString.optional().describe('registrar name; used when vendor is omitted'),
  vendorUrl: nonEmptyString.optional().describe('registrar website URL override'),
  vendorLogo: nonEmptyString.optional().describe('registrar logo URL override'),
  currency: nonEmptyString.optional().describe('ISO-style currency code used for first-year and renewal prices'),
  firstYear: priceSchema.optional().describe('first registration-year price'),
  renewal: priceSchema.optional().describe('annual renewal price'),
  premium: zod.boolean().default(false).describe('whether the registry or registrar classifies this domain as premium'),
}).describe('one registrar offer rendered as a domain card')

const maxPriceSchema = zod.union([
  finiteNumber.nonnegative().describe('maximum registration and renewal price in the top-level currency'),
  zod.strictObject({
    registration: finiteNumber.nonnegative().optional().describe('maximum firstYear price in the top-level currency; omitted means no registration limit'),
    renewal: finiteNumber.nonnegative().optional().describe('maximum renewal price in the top-level currency; omitted means no renewal limit'),
  }),
]).describe('exclude offers with a known price above the limit; a number limits both registration and renewal')

export const dataSchema = zod.strictObject({
  currency: zod.enum(['usd', 'eur']).default(defaultCurrency).describe('default offer currency and currency for price limits and color anchors'),
  currencyValue: zod.strictObject({
    eur: finiteNumber.positive().default(defaultCurrencyValue.eur).describe('USD value of one EUR; for example, 1.15 means 1 EUR = 1.15 USD'),
  }).default(defaultCurrencyValue).describe('currency conversion values relative to USD, used for comparisons and coloring'),
  maxPrice: maxPriceSchema.optional(),
  maxWidth: finiteNumber.nonnegative().optional().describe('maximum suffix width from the same metadata as sort: width; measured in pixels at Roboto 100px, not card width; unknown widths are kept'),
  colorSource: zod.enum(['threeYears', 'registration', 'renewal']).optional().describe('price used for coloring independently of sort; registration uses firstYear; defaults to registration for sort: firstYear, otherwise threeYears'),
  sort: zod.enum(['firstYear', 'renewal', 'threeYears', 'jaid', 'width', 'length', 'original']).default('threeYears').describe('card ordering mode'),
  deduplication: zod.boolean().default(false).describe('whether duplicate domain names from multiple vendors are reduced to the cheapest offer for the active sort mode'),
  maximumSegments: zod.int().positive().optional().describe('maximum number of dot-separated domain segments to render'),
  punycode: zod.union([
    zod.literal(false),
    zod.enum(['raw', 'code']),
  ]).default('code').describe('punycode handling: false hides punycode domains, raw displays ASCII punycode, code displays decoded Unicode'),
  colors: zod.array(colorStopSchema).min(1).optional().describe('price-color gradient from cheapest to most expensive; fully priced object stops use their price fields as annual anchors in the top-level currency'),
  colorStart: finiteNumber.nonnegative().optional().describe('annual price in the top-level currency represented by the start of an unanchored color gradient'),
  colorEnd: finiteNumber.nonnegative().optional().describe('annual price in the top-level currency represented by the end of an unanchored color gradient'),
  vendor: vendorSchema.optional().describe('default vendor applied to offers that do not specify one'),
  registrar: nonEmptyString.optional().describe('default registrar name applied when vendor is omitted'),
  vendorUrl: nonEmptyString.optional().describe('default registrar website URL'),
  vendorLogo: nonEmptyString.optional().describe('default registrar logo URL'),
  domains: zod.array(domainOfferSchema).describe('domain offers rendered as cards'),
}).describe('structured data for the domain-card renderer').meta({
  title: 'Domain Cards Data',
})

export const dataJsonSchema = zod.toJSONSchema(dataSchema, {
  io: 'input',
})

export type Data = zod.input<typeof dataSchema>
