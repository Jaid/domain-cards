type SuffixWidthEntry = readonly [suffix: string, width: number]

const bundledSuffixWidths: ReadonlyArray<SuffixWidthEntry> = typeof __DOMAIN_CARDS_SUFFIX_WIDTHS__ === 'undefined'
  ? []
  : __DOMAIN_CARDS_SUFFIX_WIDTHS__

let suffixWidths = new Map<string, number>(bundledSuffixWidths)

export function getDomainSuffixWidth(domain: string): number | null {
  const labels = domain.toLowerCase().replace(/\.$/u, '').split('.')
  for (let index = 0; index < labels.length; index++) {
    const suffix = labels.slice(index).join('.')
    const width = suffixWidths.get(suffix)
    if (width != null) {
      return width
    }
  }
  return null
}

export function setSuffixWidthsForTesting(entries: ReadonlyArray<SuffixWidthEntry>): void {
  suffixWidths = new Map(entries)
}
