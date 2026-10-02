import type {Currency, CurrencyValue} from './types.ts'

import {readNumber, readRecord, readString} from './coerce.ts'

export const defaultCurrency: Currency = 'usd'
export const defaultCurrencyValue: CurrencyValue = {eur: 1.15}

export function readCurrency(value: unknown): Currency {
  return readString(value)?.toLowerCase() === 'eur' ? 'eur' : defaultCurrency
}

export function readCurrencyValue(value: unknown): CurrencyValue {
  const eur = readNumber(readRecord(value)?.eur)
  return {eur: eur != null && eur > 0 ? eur : defaultCurrencyValue.eur}
}
