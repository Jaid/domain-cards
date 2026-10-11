type VendorId = 'cloudflare' | 'porkbun' | 'regery' | 'spaceship' | 'vercel'

const searchUrls: Record<VendorId, (query: string) => string> = {
  vercel: query => `https://vercel.com/domains?query=${query}`,
  regery: query => `https://regery.com/en/domains/search/${query}`,
  cloudflare: query => `https://dash.cloudflare.com/?to=/:account/registrar/register?input=${query}`,
  spaceship: query => `https://spaceship.com/domain-search?tab=domains&query=${query}`,
  porkbun: query => `https://porkbun.com/checkout/search?q=${query}`,
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
function main(): void {
  const query = readQuery()
  const browser = Bun.env.BROWSER
  if (!browser) {
    throw new Error('Environment variable BROWSER is not set')
  }
  const urls = Object.values(searchUrls).map(searchUrl => searchUrl(encodeURIComponent(query)))
  const subprocess = Bun.spawn([browser, ...urls], {stdio: ['ignore', 'ignore', 'ignore']})
  subprocess.unref()
  console.log(`Opened ${urls.length} tabs for ${query} in ${browser}`)
}
main()
