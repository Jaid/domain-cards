import type {CurrencyValue} from './types.ts'

import {defaultCurrencyValue} from './currency.ts'

const formatters = new Map<string, Intl.NumberFormat>
const compactFormatters = new Map<string, Intl.NumberFormat>
const currencyAffixes = new Map<string, CurrencyAffix>

export type CurrencyAffix = {
  prefix?: string
  suffix?: string
}

export type PriceLine =
  | {
    amount: string
    kind: 'yearly'
  }
  | {
    firstYear: string | undefined
    kind: 'split'
    renewal: string | undefined
  }
  | {kind: 'unavailable'}

export function dollarEquivalent(amount: number | null, currency?: string, currencyValue: CurrencyValue = defaultCurrencyValue): number | null {
  if (amount == null) {
    return null
  }
  const code = currency?.trim().toUpperCase()
  return amount * (code === 'EUR' ? currencyValue.eur : 1)
}

export function currencyAffix(currency?: string): CurrencyAffix {
  const code = currency?.trim().toUpperCase()
  if (!code) {
    return {}
  }
  const cached = currencyAffixes.get(code)
  if (cached) {
    return cached
  }
  let affix: CurrencyAffix
  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).formatToParts(0)
    const currencyIndex = parts.findIndex(part => part.type === 'currency')
    const integerIndex = parts.findIndex(part => part.type === 'integer')
    const symbol = parts[currencyIndex]?.value
    affix = currencyIndex !== -1 && currencyIndex < integerIndex ? {prefix: symbol} : {suffix: symbol ?? code}
  } catch {
    affix = {suffix: code}
  }
  currencyAffixes.set(code, affix)
  return affix
}

export function formatMoney(amount: number, currency?: string): string {
  const code = currency?.trim().toUpperCase()
  if (!code) {
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }
  let formatter = formatters.get(code)
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: code,
        currencyDisplay: 'narrowSymbol',
      })
      formatters.set(code, formatter)
    } catch {
      return `${amount.toFixed(2)} ${code}`
    }
  }
  return formatter.format(amount)
}

export function priceLine(firstYear: number | null, renewal: number | null, currency?: string): PriceLine {
  if (firstYear == null && renewal == null) {
    return {kind: 'unavailable'}
  }
  if (firstYear != null && renewal != null && firstYear === renewal) {
    return {
      kind: 'yearly',
      amount: formatPrice(firstYear, currency),
    }
  }
  if (firstYear != null && renewal != null) {
    return {
      kind: 'split',
      firstYear: formatPrice(firstYear, currency),
      renewal: formatPrice(renewal, currency),
    }
  }
  return {
    kind: 'split',
    firstYear: firstYear == null ? undefined : formatPrice(firstYear, currency),
    renewal: renewal == null ? undefined : formatPrice(renewal, currency),
  }
}

export function threeYearTotal(firstYear: number | null, renewal: number | null): number | null {
  if (firstYear == null || renewal == null) {
    return null
  }
  return firstYear + renewal * 2
}

function formatPrice(amount: number, currency?: string): string {
  const rounded = Math.ceil(amount)
  const code = currency?.trim().toUpperCase()
  if (!code) {
    return rounded.toLocaleString('en-US')
  }
  let formatter = compactFormatters.get(code)
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: code,
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
      compactFormatters.set(code, formatter)
    } catch {
      return `${rounded.toLocaleString('en-US')}\u{202F}${code}`
    }
  }
  const parts = formatter.formatToParts(rounded)
  return parts.map((part, index) => {
    if (part.type === 'currency' && parts[index + 1]?.type === 'integer') {
      return `${part.value}\u{202F}`
    }
    if (part.type === 'literal') {
      return part.value.replaceAll(/\s+/g, '\u{202F}')
    }
    return part.value
  }).join('')
}
