import type {HtmlTagDescriptor, Plugin, ResolvedConfig} from 'vite'

type PwaPluginOptions = {
  description?: string
  icon: string
  name: string
}

const withTrailingSlash = (value: string) => value.endsWith('/') ? value : `${value}/`

export default (options: PwaPluginOptions): Plugin => {
  let config: ResolvedConfig | undefined
  return {
    name: 'domain-cards:pwa-assets',
    apply: 'build',
    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    transformIndexHtml() {
      const base = withTrailingSlash(config?.base ?? '/')
      const tags: Array<HtmlTagDescriptor> = [
        {
          tag: 'link',
          attrs: {
            rel: 'manifest',
            href: `${base}manifest.webmanifest`,
          },
          injectTo: 'head',
        },
        {
          tag: 'script',
          attrs: {
            src: `${base}registerSW.js`,
          },
          injectTo: 'head',
        },
      ]
      return tags
    },
    generateBundle() {
      const base = withTrailingSlash(config?.base ?? '/')
      const manifest = {
        name: options.name,
        short_name: options.name,
        description: options.description,
        start_url: base,
        display: 'standalone',
        background_color: '#000',
        theme_color: '#000',
        lang: 'en',
        scope: base,
        icons: [
          {
            src: options.icon,
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: options.icon,
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      }
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.webmanifest',
        source: JSON.stringify(manifest),
      })
      this.emitFile({
        type: 'asset',
        fileName: 'registerSW.js',
        source: `if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register(${JSON.stringify(`${base}sw.js`)},{scope:${JSON.stringify(base)}})})}`,
      })
    },
  }
}
