type VendorId = 'cloudflare' | 'porkbun' | 'regery' | 'spaceship' | 'vercel'

const searchUrls: Record<VendorId, (query: string) => string> = {
  porkbun: query => `https://porkbun.com/checkout/search?q=${query}`,
  spaceship: query => `https://spaceship.com/domain-search?tab=beast&query=${query}`,
  regery: query => `https://regery.com/en/domains/search/${query}`,
  cloudflare: query => `https://dash.cloudflare.com?to=/:account/domains/registrations/purchase?sort=price&sortDir=asc&query=${query}`,
  vercel: query => `https://vercel.com/domains/search?q=${query}`,
}
function readQuery(): string {
  const args = process.argv.slice(2)
  if (args.length !== 1) {
    throw new Error('Usage: bun scripts/openTabs.ts <name or domain>')
  }
  const query = args[0].trim().toLowerCase()
  if (!/^[0-9a-z](?:[-0-9a-z]{0,61}[0-9a-z])?(?:\.[0-9a-z](?:[-0-9a-z]{0,61}[0-9a-z])?)*$/.test(query)) {
    throw new Error(`Invalid domain name: ${query}`)
  }
  return query
}
async function launch(browser: string, urls: ReadonlyArray<string>): Promise<void> {
  if (process.platform !== 'win32') {
    Bun.spawn([browser, ...urls], {
      stdio: ['ignore', 'ignore', 'ignore'],
      detached: true,
    }).unref()
    return
  }
  // Bun kills its child processes on exit on Windows, so the browser is handed to Start-Process, which outlives this script
  const subprocess = Bun.spawn(['pwsh', '-NoProfile', '-NonInteractive', '-Command', 'Start-Process -FilePath $env:OPEN_TABS_BROWSER -ArgumentList ($env:OPEN_TABS_URLS -split "`n")'], {
    env: {
      ...process.env,
      OPEN_TABS_BROWSER: browser,
      OPEN_TABS_URLS: urls.join('\n'),
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  const exitCode = await subprocess.exited
  if (exitCode !== 0) {
    throw new Error(`Start-Process exited with code ${exitCode}`)
  }
}
async function main(): Promise<void> {
  const query = readQuery()
  const browser = Bun.env.BROWSER
  if (!browser) {
    throw new Error('Environment variable BROWSER is not set')
  }
  const urls = Object.values(searchUrls).map(searchUrl => searchUrl(encodeURIComponent(query)))
  await launch(browser, urls)
  console.log(`Opened ${urls.length} tabs for ${query} in ${browser}`)
}
await main()
