# Domain Cards

A browser-based renderer for compact domain-registration price cards.

The app accepts YAML, previews registrar offers live, supports sorting and deduplication, renders bundled registrar branding, and can copy or download the resulting card grid as a PNG.

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
