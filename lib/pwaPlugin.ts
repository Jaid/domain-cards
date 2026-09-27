import type {HtmlTagDescriptor, Plugin, PluginOption, ResolvedConfig} from 'vite'

import {spawn} from 'node:child_process'

type PwaPluginOptions = {
  description?: string
  icon: string
  name: string
}

const withTrailingSlash = (value: string) => value.endsWith('/') ? value : `${value}/`

const runServiceWorkerBuild = async (config: ResolvedConfig) => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('node', ['scripts/generateServiceWorker.mjs', config.build.outDir], {
      cwd: config.root,
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Service worker build exited with code ${code ?? 'unknown'}.`))
      }
    })
  })
}

export default (options: PwaPluginOptions): PluginOption => {
  let config: ResolvedConfig | undefined
  const plugin: Plugin = {
    name: 'domain-cards:pwa',
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
    closeBundle: {
      order: 'post',
      sequential: true,
      async handler() {
        if (config) {
          await runServiceWorkerBuild(config)
        }
      },
    },
  }
  return plugin
}
