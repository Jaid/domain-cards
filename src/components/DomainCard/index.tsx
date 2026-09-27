import type {DomainCatalog, DomainOffer} from '#src/lib/domain/index.ts'

import NumberDisplay from '#component/NumberDisplay'
import VendorLogo from '#component/VendorLogo'
import {currencyAffix} from '#src/lib/domain/index.ts'

import css from './style.module.sass'

type DomainCardProps = {
  catalog: DomainCatalog
  offer: DomainOffer
}

const PriceAmount = ({amount, currency}: {
  amount: number
  currency?: string
}) => {
  const {prefix, suffix} = currencyAffix(currency)
  return <NumberDisplay
    gluedPrefix
    gluedSuffix
    prefix={prefix ? `${prefix}\u{202F}` : undefined}
    suffix={suffix ? `\u{202F}${suffix}` : undefined}
    value={Math.ceil(amount)}
  />
}
const Price = ({offer}: {offer: DomainOffer}) => {
  if (offer.firstYear == null && offer.renewal == null) {
    return <span className={css.unavailable}>price unavailable</span>
  }
  if (offer.firstYear == null || offer.renewal == null || offer.firstYear === offer.renewal) {
    const amount = offer.firstYear ?? offer.renewal!
    return <span className={css.price}><PriceAmount amount={amount} currency={offer.currency} /></span>
  }
  return <span className={css.price}>
    <PriceAmount amount={offer.firstYear} currency={offer.currency} />
    <span className={css.arrow}> → </span>
    <PriceAmount amount={offer.renewal} currency={offer.currency} />
  </span>
}

export default ({offer, catalog}: DomainCardProps) => {
  const copyDomain = () => {
    if (typeof navigator === 'undefined') {
      return
    }
    void navigator.clipboard?.writeText(offer.domain)
  }
  return <article
    className={css.card}
    data-domain={offer.domain}
    data-premium={offer.premium ? 'true' : 'false'}
    data-priced={offer.threeYearPrice == null ? 'false' : 'true'}
    data-vendor={offer.vendorName ?? ''}
    style={catalog.colorVars(offer)}
    tabIndex={0}
    title={catalog.summaryFor(offer)}
    onClick={copyDomain}
    onKeyDown={event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        copyDomain()
      }
    }}
  >
    <div className={css.domain}>{catalog.displayDomain(offer)}</div>
    <div className={css.meta}>
      <VendorLogo bundled={offer.hasBundledVendorIcon} bundledBackground={offer.bundledVendorIconBackground} name={offer.vendorName} sources={offer.logoSources} />
      <Price offer={offer} />
    </div>
  </article>
}
