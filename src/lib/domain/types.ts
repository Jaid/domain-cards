export type SortMode = 'firstYear' | 'length' | 'original' | 'renewal' | 'threeYears'

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
