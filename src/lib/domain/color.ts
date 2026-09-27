import type {CardColors, ColorScheme, OkhslColor, PriceColorStop} from './types.ts'

import okhsl from 'okhsl'

export const defaultPriceColors = [148, 26] as const satisfies ReadonlyArray<PriceColorStop>

export function priceT(price: number, min: number, max: number): number {
  if (!Number.isFinite(price) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return 0.5
  }
  if (min >= 0) {
    const position = (value: number) => Math.log1p(Math.log1p(value))
    const start = position(min)
    const end = position(max)
    if (end <= start) {
      return 0.5
    }
    return Math.min(1, Math.max(0, (position(price) - start) / (end - start)))
  }
  return Math.min(1, Math.max(0, (price - min) / (max - min)))
}

export function priceColors(t: number, scheme: ColorScheme, colors: ReadonlyArray<PriceColorStop> = defaultPriceColors): CardColors {
  const clamped = Math.min(1, Math.max(0, t))
  const effectiveColors = colors.length > 0 ? colors : defaultPriceColors
  return swatch(colorAt(clamped, scheme, effectiveColors))
}

export function priceColorsAtPrice(price: number, scheme: ColorScheme, colors: ReadonlyArray<PriceColorStop>): CardColors | undefined {
  const stops = pricedStops(colors)
  if (!stops || !Number.isFinite(price)) {
    return undefined
  }
  if (stops.length === 1 || price <= stops[0].price) {
    return swatch(stops[0])
  }
  const last = stops.at(-1)!
  if (price >= last.price) {
    return swatch(last)
  }
  for (let index = 0; index < stops.length - 1; index++) {
    const from = stops[index]
    const to = stops[index + 1]
    if (price > to.price) {
      continue
    }
    if (to.price <= from.price) {
      return undefined
    }
    const rawT = (price - from.price) / (to.price - from.price)
    const easedT = rawT ** 3 * (rawT * (rawT * 6 - 15) + 10)
    return swatch(interpolateColor(from, to, easedT))
  }
  return swatch(last)
}

export function unavailableColors(scheme: ColorScheme): CardColors {
  if (scheme === 'dark') {
    return swatch({
      hue: 250,
      saturation: 5,
      lightness: 17,
    })
  }
  return swatch({
    hue: 250,
    saturation: 4,
    lightness: 93,
  })
}

function contrastInk(r: number, g: number, b: number): string {
  const linear = (channel: number) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
  return luminance > 0.46 ? '#16141a' : '#f4f1ec'
}
function swatch({hue, saturation, lightness}: OkhslColor): CardColors {
  const background = okhsl.css(hue, saturation, lightness)
  const [r, g, b] = okhsl.bytes(hue, saturation, lightness)
  return {
    background,
    color: contrastInk(r, g, b),
  }
}
function automaticColor(hue: number, t: number, scheme: ColorScheme): OkhslColor {
  if (scheme === 'dark') {
    return {
      hue,
      saturation: 54 + t * 12,
      lightness: 31 + t * 6,
    }
  }
  return {
    hue,
    saturation: 46 + t * 10,
    lightness: 86 - t * 4,
  }
}
function resolveColor(stop: PriceColorStop, t: number, scheme: ColorScheme): OkhslColor {
  if (typeof stop === 'number') {
    return automaticColor(stop, t, scheme)
  }
  return stop
}
function interpolateHue(from: number, to: number, t: number): number {
  const delta = (to - from + 540) % 360 - 180
  return (from + delta * t + 360) % 360
}
function interpolateColor(from: OkhslColor, to: OkhslColor, t: number): OkhslColor {
  return {
    hue: interpolateHue(from.hue, to.hue, t),
    saturation: from.saturation + (to.saturation - from.saturation) * t,
    lightness: from.lightness + (to.lightness - from.lightness) * t,
  }
}
function colorAt(t: number, scheme: ColorScheme, colors: ReadonlyArray<PriceColorStop>): OkhslColor {
  if (colors.length === 1) {
    return resolveColor(colors[0], t, scheme)
  }
  const position = t * (colors.length - 1)
  const index = Math.min(colors.length - 2, Math.floor(position))
  const localT = position - index
  const smoothT = localT * localT * (3 - 2 * localT)
  const easedT = localT + (smoothT - localT) * 0.3
  const fromT = index / (colors.length - 1)
  const toT = (index + 1) / (colors.length - 1)
  const from = resolveColor(colors[index], fromT, scheme)
  const to = resolveColor(colors[index + 1], toT, scheme)
  return interpolateColor(from, to, easedT)
}
function pricedStops(colors: ReadonlyArray<PriceColorStop>): Array<OkhslColor & {price: number}> | undefined {
  if (colors.length === 0 || !colors.every(stop => typeof stop !== 'number' && stop.price != null && Number.isFinite(stop.price))) {
    return undefined
  }
  const stops = [...colors] as Array<OkhslColor & {price: number}>
  if (stops.some((stop, index) => index > 0 && stop.price <= stops[index - 1].price)) {
    return undefined
  }
  return stops
}
