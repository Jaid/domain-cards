import type {ReactElement} from 'react'

import {describe, expect, test} from 'bun:test'

import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'

import {DomainCatalog, exampleYaml} from '#src/lib/domain/index.ts'

import testSassModulesPlugin from './lib/sassModulesPlugin.js'

Bun.plugin(testSassModulesPlugin)
async function render(componentSegment: string, props?: object) {
  const Component = (await import(`#src/components/${componentSegment}/index.tsx`)).default
  const element = createElement(Component, props) as ReactElement
  return renderToStaticMarkup(element)
}
describe('components', () => {
  test('App renders example domain cards without loading the editor backend', async () => {
    const html = await render('App')
    expect(html.length).toBeGreaterThan(0)
    expect(html).toContain('slop.accountant')
    expect(html).toContain('slop.actor')
    expect(html).toContain('slop.movie')
    expect(html).toContain('data-domain="slop.accountant"')
    expect(html).toContain('Copy PNG')
    expect(html).toContain('Download PNG')
    expect(html).toContain('data-screenshot-target')
    expect(html).not.toContain('/ year')
    expect(html).not.toContain('first year')
    expect(html).not.toContain('renewal')
  })
  test('Preview preserves card order from the catalog sort', async () => {
    const catalog = DomainCatalog.fromYaml(exampleYaml)
    const html = await render('Preview', {catalog})
    const positions = catalog.sorted().map(offer => html.indexOf(`data-domain="${offer.domain}"`))
    expect(positions.length).toBeGreaterThan(1)
    expect(positions).not.toContain(-1)
    expect(positions).toEqual(positions.toSorted((a, b) => a - b))
  })
  test('Preview applies mixed-currency filters while retaining original display currencies', async () => {
    const catalog = DomainCatalog.fromUnknown({
      currency: 'eur',
      currencyValue: {eur: 1.25},
      maxPrice: {
        registration: 10,
        renewal: 10,
      },
      colorSource: 'renewal',
      domains: [
        {
          domain: 'inherited.test',
          firstYear: 8,
          renewal: 9,
        },
        {
          domain: 'usd-boundary.test',
          currency: 'USD',
          firstYear: 12.5,
          renewal: 12.5,
        },
        {
          domain: 'excluded.test',
          currency: 'USD',
          firstYear: 12.51,
          renewal: 12.5,
        },
      ],
    })
    const html = await render('Preview', {catalog})
    const text = html.replaceAll(/<[^>]+>/g, '')
    expect(html).toContain('data-domain="inherited.test"')
    expect(html).toContain('data-domain="usd-boundary.test"')
    expect(html).not.toContain('excluded.test')
    expect(text).toContain('€ 8 → € 9')
    expect(text).toContain('$ 13')
    expect(html).toContain(`--card-bg:${catalog.colorsFor(catalog.offers[0], 'dark').background}`)
  })
  test('renders bundled vendor icons on their configured rounded backgrounds', async () => {
    const catalog = DomainCatalog.fromUnknown([
      {
        domain: 'porkbun-icon.test',
        vendor: 'porkbun',
        firstYear: 5,
        renewal: 5,
        currency: 'USD',
      },
      {
        domain: 'regery-icon.test',
        vendor: 'regery',
        firstYear: 5,
        renewal: 5,
        currency: 'USD',
      },
      {
        domain: 'spaceship-icon.test',
        vendor: 'spaceship',
        firstYear: 5,
        renewal: 5,
        currency: 'USD',
      },
      {
        domain: 'vercel-icon.test',
        vendor: 'vercel',
        firstYear: 5,
        renewal: 5,
        currency: 'USD',
      },
      {
        domain: 'cloudflare-icon.test',
        vendor: 'cloudflare',
        firstYear: 5,
        renewal: 5,
        currency: 'USD',
      },
    ])
    const porkbun = await render('DomainCard', {
      catalog,
      offer: catalog.offers[0],
    })
    const regery = await render('DomainCard', {
      catalog,
      offer: catalog.offers[1],
    })
    const spaceship = await render('DomainCard', {
      catalog,
      offer: catalog.offers[2],
    })
    const vercel = await render('DomainCard', {
      catalog,
      offer: catalog.offers[3],
    })
    const cloudflare = await render('DomainCard', {
      catalog,
      offer: catalog.offers[4],
    })
    expect(porkbun).toContain('class="bundledFrame"')
    expect(porkbun).toContain('background:#ef7878')
    expect(porkbun).not.toContain('google.com/s2/favicons')
    expect(regery).toContain('class="bundledFrame"')
    expect(regery).toContain('background:#1534a2')
    expect(regery).not.toContain('google.com/s2/favicons')
    expect(spaceship).toContain('class="bundledFrame"')
    expect(spaceship).toContain('class="bundledIcon"')
    expect(spaceship).toContain('background:white')
    expect(vercel).toContain('background:black')
    expect(spaceship).not.toContain('google.com/s2/favicons')
    expect(vercel).not.toContain('google.com/s2/favicons')
    expect(cloudflare).toContain('class="bundledIcon"')
    expect(cloudflare).toContain('background:white')
    expect(cloudflare).not.toContain('google.com/s2/favicons')
  })
  test('renders raw punycode when configured', async () => {
    const catalog = DomainCatalog.fromUnknown({
      punycode: 'raw',
      domains: [
        {
          domain: 'slop.xn--fiq228c5hs',
          vendor: 'vercel',
          firstYear: 5,
          renewal: 5,
        },
      ],
    })
    const html = await render('DomainCard', {
      catalog,
      offer: catalog.offers[0],
    })
    expect(html).toContain('>slop.xn--fiq228c5hs<')
    expect(html).not.toContain('slop.中文网')
  })
  test('renders Unicode for punycode domains while preserving the canonical data value', async () => {
    const catalog = DomainCatalog.fromUnknown([
      {
        domain: 'slop.xn--fiq228c5hs',
        vendor: 'vercel',
        firstYear: 5,
        renewal: 5,
      },
    ])
    const html = await render('DomainCard', {
      catalog,
      offer: catalog.offers[0],
    })
    expect(html).toContain('slop.中文网')
    expect(html).toContain('data-domain="slop.xn--fiq228c5hs"')
    expect(html).toContain('width="16"')
    expect(html).toContain('height="16"')
    expect(html).not.toContain('>slop.xn--fiq228c5hs<')
  })
  test('renders card prices through NumberDisplay', async () => {
    const catalog = DomainCatalog.fromUnknown([
      {
        domain: 'priced.test',
        vendor: 'spaceship',
        currency: 'USD',
        firstYear: 3.01,
        renewal: 18.01,
      },
    ])
    const html = await render('DomainCard', {
      catalog,
      offer: catalog.offers[0],
    })
    const text = html.replaceAll(/<[^>]+>/g, '')
    expect(text).toContain('$ 4 → $ 19')
    expect(html).toContain('class="arrow"> → </span>')
    expect(html.match(/class="element"/g)).toHaveLength(2)
  })
  test('DomainCard does not visually distinguish premium offers', async () => {
    const catalog = DomainCatalog.fromUnknown([
      {
        domain: 'gone.test',
        vendor: 'porkbun',
        premium: true,
      },
    ])
    const html = await render('DomainCard', {
      catalog,
      offer: catalog.offers[0],
    })
    expect(html).toContain('gone.test')
    expect(html).toContain('price unavailable')
    expect(html).toContain('data-premium="true"')
    expect(html).toContain('data-priced="false"')
    expect(html).toContain('class="card"')
    expect(html).not.toContain('class="card premium"')
  })
})
