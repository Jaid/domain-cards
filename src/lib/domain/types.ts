export type SortMode = 'firstYear' | 'jaid' | 'length' | 'original' | 'renewal' | 'threeYears' | 'width'

export type ColorSource = 'registration' | 'renewal' | 'threeYears'

export type Currency = 'eur' | 'usd'

export type CurrencyValue = Readonly<{eur: number}>

export type MaxPrice = {
  registration?: number
  renewal?: number
} | number

export type PunycodeMode = 'code' | 'raw' | false

export type RootDefaults = {
  currency?: unknown
  currencyValue?: CurrencyValue
  registrar?: unknown
  vendor?: unknown
  vendorLogo?: unknown
  vendorUrl?: unknown
}

export type ColorScheme = 'dark' | 'light'

export type OkhslColor = {
  hue: number
  lightness: number
  saturation: number
}

export type PriceColorStop = OkhslColor & {price?: number} | number

export type CardColors = {
  background: string
  color: string
}
