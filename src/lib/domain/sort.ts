import type {SortMode} from './types.ts'

const sortModes = new Set<SortMode>(['firstYear', 'renewal', 'threeYears', 'length', 'original'])
const aliases: Record<string, SortMode> = {
  '3y': 'threeYears',
  '3year': 'threeYears',
  '3years': 'threeYears',
  first_year: 'firstYear',
  'first-year': 'firstYear',
  firstyear: 'firstYear',
  input: 'original',
  length: 'length',
  original: 'original',
  renewal: 'renewal',
  three_years: 'threeYears',
  'three-years': 'threeYears',
  threeyear: 'threeYears',
  threeyears: 'threeYears',
  yaml: 'original',
}

export function readSort(value: unknown): SortMode {
  if (typeof value !== 'string') {
    return 'threeYears'
  }
  const trimmed = value.trim()
  if (sortModes.has(trimmed as SortMode)) {
    return trimmed as SortMode
  }
  const compact = trimmed.toLowerCase().replaceAll(/\s+/g, '')
  return aliases[compact] ?? 'threeYears'
}

export function compareNullableNumber(a: number | null, b: number | null): number {
  const aMissing = a == null
  const bMissing = b == null
  if (aMissing && bMissing) {
    return 0
  }
  if (aMissing) {
    return 1
  }
  if (bMissing) {
    return -1
  }
  return a - b
}
