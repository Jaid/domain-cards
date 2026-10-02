import type {PriceLine} from './money.ts'
import type {CurrencyValue, RootDefaults} from './types.ts'
import type {VendorRef} from './vendor.ts'

import {readBoolean, readNumber, readString} from './coerce.ts'
import {defaultCurrency, defaultCurrencyValue} from './currency.ts'
import {displayDomain} from './displayDomain.ts'
import {dollarEquivalent, formatMoney, priceLine, threeYearTotal} from './money.ts'
import {bundledVendorIcon, bundledVendorIconBackground, logoSources, mergeVendor} from './vendor.ts'

export class DomainOffer {
  static fromRecord(record: Record<string, unknown>, defaults: RootDefaults, index: number): DomainOffer | undefined {
    const domain = readString(record.domain)
    if (!domain) {
      return undefined
    }
    return new DomainOffer({
      index,
      domain,
      currency: readString(record.currency) ?? readString(defaults.currency),
      currencyValue: defaults.currencyValue,
      firstYear: readNumber(record.firstYear),
      renewal: readNumber(record.renewal),
      premium: readBoolean(record.premium),
      vendor: mergeVendor(record, defaults),
    })
  }
  readonly currency: string
  readonly currencyValue: CurrencyValue
  readonly domain: string
  readonly firstYear: number | null
  readonly index: number
  readonly premium: boolean
  readonly renewal: number | null

  readonly vendor: VendorRef

  constructor(options: {
    currency?: string
    currencyValue?: CurrencyValue
    domain: string
    firstYear: number | null
    index: number
    premium: boolean
    renewal: number | null
    vendor: VendorRef
  }) {
    this.index = options.index
    this.domain = options.domain
    this.currency = options.currency ?? defaultCurrency
    this.currencyValue = options.currencyValue ?? defaultCurrencyValue
    this.firstYear = options.firstYear
    this.renewal = options.renewal
    this.premium = options.premium
    this.vendor = options.vendor
  }

  get bundledVendorIconBackground(): string | undefined {
    return bundledVendorIconBackground(this.vendor.name, this.vendor.url)
  }

  get displayDomain(): string {
    return displayDomain(this.domain)
  }

  get firstYearDollar(): number | null {
    return dollarEquivalent(this.firstYear, this.currency, this.currencyValue)
  }

  get hasBundledVendorIcon(): boolean {
    return bundledVendorIcon(this.vendor.name, this.vendor.url) != null
  }

  get logoSources(): Array<string> {
    return logoSources(this.vendor)
  }

  get price(): PriceLine {
    return priceLine(this.firstYear, this.renewal, this.currency)
  }

  get renewalDollar(): number | null {
    return dollarEquivalent(this.renewal, this.currency, this.currencyValue)
  }

  get summary(): string {
    return this.summaryFor()
  }

  get threeYearDollar(): number | null {
    return dollarEquivalent(this.threeYearPrice, this.currency, this.currencyValue)
  }

  get threeYearPrice(): number | null {
    return threeYearTotal(this.firstYear, this.renewal)
  }

  get vendorName(): string | undefined {
    return this.vendor.name
  }

  summaryFor(displayDomain = this.displayDomain): string {
    const vendor = this.vendorName ? ` · ${this.vendorName}` : ''
    const total = this.threeYearPrice
    if (total == null) {
      return `${displayDomain}${vendor} · price unavailable`
    }
    return `${displayDomain}${vendor} · ${formatMoney(total, this.currency)} over 3 years`
  }
}
