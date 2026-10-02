# Domain Cards

A browser-based renderer for compact domain-registration price cards.

The app accepts YAML, previews registrar offers live, supports sorting and deduplication, renders bundled registrar branding, and can copy or download the resulting card grid as a PNG.

## Configuration

The top-level YAML settings control currency defaults, filtering, sorting and coloring:

```yaml
currency: eur
currencyValue:
  eur: 1.15
maxPrice:
  registration: 25
  renewal: 50
maxWidth: 300
sort: width
colorSource: renewal
domains:
- domain: example.zip
  vendor: regery
  firstYear: 15
  renewal: 20
- domain: example.show
  vendor: porkbun
  currency: USD
  firstYear: 20
  renewal: 30
```

### Currency

`currency` accepts `usd` or `eur` and defaults to `usd`. It supplies the currency for offers without their own `currency`, as well as for `maxPrice`, `colorStart`, `colorEnd` and the `price` values in `colors`. Per-offer currency overrides are retained, including their original display amounts and currency symbols.

`currencyValue.eur` is the USD value of one EUR. For example, `1.15` means €1 = $1.15. The default remains the app's previous fixed value, `1.15`; this is a configurable comparison rate, not a live exchange-rate feed. The rate must be finite and greater than zero. It applies consistently to sorting, deduplication, price limits and coloring.

### Price and width limits

Use a single `maxPrice` to limit both registration and renewal:

```yaml
maxPrice: 50
```

Alternatively, use `maxPrice.registration` and/or `maxPrice.renewal` as nested YAML fields. `registration` refers to an offer's existing `firstYear` price; offer records still use `firstYear`, not `registration`. An omitted limit is unlimited. Amounts are compared in a common currency using `currencyValue.eur`, so a EUR limit also applies correctly to USD offers, and vice versa.

`maxWidth` limits the measured suffix width from the same bundled metadata used by `sort: width`. These are reference pixel widths measured at 100px Roboto, not the rendered card width or full domain length. Multi-label suffixes use the longest matching suffix.

Limits are inclusive: only values strictly above a limit are excluded. Zero is allowed, while negative and non-finite limits are invalid. Missing prices and unknown suffix widths are retained unless another known value exceeds its limit. Filtering happens before deduplication and before automatic color ranges are calculated.

### Color source

`colorSource` selects the price used for coloring independently of `sort`:

| Value | Price used |
| --- | --- |
| `registration` | The offer's `firstYear` price |
| `renewal` | The annual renewal price |
| `threeYears` | `firstYear + 2 × renewal` |

When omitted, the existing behavior is preserved: `sort: firstYear` colors by registration, and all other sort modes color by the three-year total. Explicit color anchors and bounds remain annual amounts in the top-level currency; `threeYears` therefore maps to anchors using the total divided by three. Offers without the selected price use the unavailable color.

## Development

```bash
bun install
bun run vite
bun run lint
bun test
bun run test-live
```

## Data utilities

```bash
bun run pull <name>
bun run measure:suffixes
bun run build:suffix-packs
```

Local registrar snapshots and suffix datasets live under `private/` and are intentionally excluded from Git.
