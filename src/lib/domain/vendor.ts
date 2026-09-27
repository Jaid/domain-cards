import porkbunData from '#src/icons/porkbun/data.ts'
import porkbunIcon from '#src/icons/porkbun/icon.svg'
import regeryData from '#src/icons/regery/data.ts'
import regeryIcon from '#src/icons/regery/icon.svg'
import spaceshipData from '#src/icons/spaceship/data.ts'
import spaceshipIcon from '#src/icons/spaceship/icon.svg'
import vercelData from '#src/icons/vercel/data.ts'
import vercelIcon from '#src/icons/vercel/icon.svg'

import {readRecord, readString} from './coerce.ts'

const registrarHosts: Record<string, string> = {
  '101domain': '101domain.com',
  '1and1': 'ionos.com',
  alibaba: 'alibabacloud.com',
  alibabacloud: 'alibabacloud.com',
  aliyun: 'aliyun.com',
  almostcheap: 'almostcheap.com',
  amazon: 'aws.amazon.com',
  aws: 'aws.amazon.com',
  azure: 'azure.microsoft.com',
  bigrock: 'bigrock.com',
  bluehost: 'bluehost.com',
  cloudflare: 'cloudflare.com',
  connectreseller: 'connectreseller.com',
  cosmotown: 'cosmotown.com',
  crazydomains: 'crazydomains.com',
  desec: 'desec.io',
  domaincom: 'domain.com',
  dreamhost: 'dreamhost.com',
  dynadot: 'dynadot.com',
  enom: 'enom.com',
  epik: 'epik.com',
  gandi: 'gandi.net',
  godaddy: 'godaddy.com',
  google: 'domains.google',
  googledomains: 'domains.google',
  hexonet: 'hexonet.net',
  hostinger: 'hostinger.com',
  hover: 'hover.com',
  infomaniak: 'infomaniak.com',
  internetbs: 'internetbs.net',
  inwx: 'inwx.com',
  ionos: 'ionos.com',
  namecheap: 'namecheap.com',
  namecom: 'name.com',
  namesilo: 'namesilo.com',
  netim: 'netim.com',
  networksolutions: 'networksolutions.com',
  njalla: 'njal.la',
  njallala: 'njal.la',
  opensrs: 'opensrs.com',
  ovh: 'ovhcloud.com',
  ovhcloud: 'ovhcloud.com',
  porkbun: 'porkbun.com',
  publicdomainregistry: 'publicdomainregistry.com',
  regery: 'regery.com',
  registercom: 'register.com',
  resellerclub: 'resellerclub.com',
  route53: 'aws.amazon.com',
  sav: 'sav.com',
  spaceship: 'spaceship.com',
  squarespace: 'squarespace.com',
  tucows: 'tucows.com',
  vercel: 'vercel.com',
  westcn: 'west.cn',
  wildwestdomains: 'wildwestdomains.com',
}

type BundledVendorIcon = {
  background: string
  src: string
}

const bundledVendorIcons: Record<string, BundledVendorIcon> = {
  'porkbun.com': {
    src: porkbunIcon,
    ...porkbunData,
  },
  'regery.com': {
    src: regeryIcon,
    ...regeryData,
  },
  'spaceship.com': {
    src: spaceshipIcon,
    ...spaceshipData,
  },
  'vercel.com': {
    src: vercelIcon,
    ...vercelData,
  },
}
const corporateSuffix = /(corp|domains?|gmbh|inc|limited|llc|ltd)$/

export type VendorRef = {
  logo?: string
  name?: string
  url?: string
}

export function registrarHost(name: string): string | undefined {
  const trimmed = name.trim().toLowerCase()
  if (!trimmed) {
    return undefined
  }
  const mapped = registrarHosts[trimmed]
  if (mapped) {
    return mapped
  }
  if (/^[-0-9a-z]+(\.[-0-9a-z]+)+$/.test(trimmed)) {
    return trimmed.replace(/^w{3}\./, '')
  }
  const compact = trimmed.replaceAll(/[^0-9a-z]/g, '')
  if (registrarHosts[compact]) {
    return registrarHosts[compact]
  }
  const stripped = compact.replace(corporateSuffix, '')
  if (stripped && stripped !== compact && registrarHosts[stripped]) {
    return registrarHosts[stripped]
  }
  return undefined
}

export function bundledVendorIcon(name?: string, url?: string): string | undefined {
  return bundledVendorIconData(name, url)?.src
}

export function bundledVendorIconBackground(name?: string, url?: string): string | undefined {
  return bundledVendorIconData(name, url)?.background
}

export function mergeVendor(record: Record<string, unknown>, defaults: {
  registrar?: unknown
  vendor?: unknown
  vendorLogo?: unknown
  vendorUrl?: unknown
}): VendorRef {
  const local = readVendor(record.vendor)
  const localRegistrar = readString(record.registrar)
  const root = readVendor(defaults.vendor)
  const overridesVendorIdentity = local.name != null || localRegistrar != null
  const name = local.name ?? localRegistrar ?? root.name ?? readString(defaults.registrar)
  const url = local.url ?? readString(record.vendorUrl) ?? (overridesVendorIdentity ? undefined : root.url ?? readString(defaults.vendorUrl))
  const logo = local.logo ?? readString(record.vendorLogo) ?? (overridesVendorIdentity ? undefined : root.logo ?? readString(defaults.vendorLogo))
  return {
    name,
    url,
    logo,
  }
}

export function logoSources(vendor: VendorRef): Array<string> {
  const bundledIcon = bundledVendorIcon(vendor.name, vendor.url)
  if (bundledIcon) {
    return [bundledIcon]
  }
  const sources: Array<string> = []
  const add = (url?: string) => {
    if (url && !sources.includes(url)) {
      sources.push(url)
    }
  }
  add(vendor.logo)
  const urlHost = vendor.url ? hostnameFromUrl(vendor.url) : undefined
  const nameHost = vendor.name ? registrarHost(vendor.name) : undefined
  if (urlHost) {
    add(faviconUrl(urlHost))
  }
  if (nameHost && nameHost !== urlHost) {
    add(faviconUrl(nameHost))
  }
  return sources
}

function readVendor(value: unknown): VendorRef {
  const asString = readString(value)
  if (asString) {
    return {name: asString}
  }
  const record = readRecord(value)
  if (!record) {
    return {}
  }
  return {
    name: readString(record.name) ?? readString(record.id) ?? readString(record.title),
    url: readString(record.url) ?? readString(record.href) ?? readString(record.website),
    logo: readString(record.logo) ?? readString(record.icon) ?? readString(record.image),
  }
}
function hostnameFromUrl(value: string): string | undefined {
  try {
    const url = value.includes('://') ? new URL(value) : new URL(`https://${value}`)
    if (!url.hostname) {
      return undefined
    }
    return url.hostname.replace(/^w{3}\./, '')
  } catch {
    return undefined
  }
}
function bundledVendorIconData(name?: string, url?: string): BundledVendorIcon | undefined {
  const urlHost = url ? hostnameFromUrl(url) : undefined
  if (urlHost && bundledVendorIcons[urlHost]) {
    return bundledVendorIcons[urlHost]
  }
  const nameHost = name ? registrarHost(name) : undefined
  return nameHost ? bundledVendorIcons[nameHost] : undefined
}
function faviconUrl(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`
}
