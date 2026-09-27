export type SortMode = 'firstYear' | 'jaid' | 'length' | 'original' | 'renewal' | 'threeYears' | 'width'

export type PunycodeMode = 'code' | 'raw' | false

export type RootDefaults = {
  currency?: unknown
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
