const exampleYaml = `
currencyValue:
  eur: 1.12
sort: firstYear
maximumSegments: 2
punycode: false
deduplication: true
colors:
- price: 0
  hue: 250
  saturation: 100
  lightness: 40
- price: 10
  hue: 150
  saturation: 100
  lightness: 50
- price: 25
  hue: 90
  saturation: 100
  lightness: 70
- price: 50
  hue: 48
  saturation: 100
  lightness: 66
- price: 100
  hue: 30
  saturation: 100
  lightness: 45
- price: 10000
  hue: 330
  saturation: 100
  lightness: 45
domains:
- domain: slop.accountant
  vendor: spaceship
  currency: USD
  firstYear: 20.88
  renewal: 20.88
- domain: slop.actor
  vendor: porkbun
  currency: USD
  firstYear: 10.81
  renewal: 35.53
- domain: slop.movie
  vendor: regery
  currency: EUR
  firstYear: 31.99
  renewal: 241.99
`.trim()

export {exampleYaml}
