/* eslint new-cap: ["warn", {"capIsNewExceptions": ["VitePWA"]}] */

import type {PackageJson} from 'type-fest'
import type {ConfigEnv, UserConfig} from 'vite'

import babelPlugin from '@rolldown/plugin-babel'
import reactPlugin, {reactCompilerPreset} from '@vitejs/plugin-react'
import postcssAutoprefixer from 'autoprefixer'
import cssnano from 'cssnano-preset-advanced'
import postcssNormalize from 'postcss-normalize'
import {defineConfig, mergeConfig} from 'vite'
import mediaMixinsPlugin from 'vite-plugin-media-mixins'
import {VitePWA} from 'vite-plugin-pwa'
import titlePlugin from 'vite-plugin-title'

import componentExportNamesPlugin from '#root/lib/componentExportNamesPlugin.ts'

const packageJson = await Bun.file('package.json').json() as PackageJson
const getCommonConfig = () => {
  const config: UserConfig = {
    build: {
      target: 'chrome154',
      chunkSizeWarningLimit: 2_000_000,
    },
    plugins: [
      titlePlugin(),
      reactPlugin(),
      babelPlugin({
        presets: [reactCompilerPreset()],
      }),
      mediaMixinsPlugin(),
    ],
    css: {
      postcss: {
        plugins: [
          postcssNormalize() as any,
          postcssAutoprefixer,
        ],
      },
    },
    worker: {
      format: 'es',
    },
  }
  return config
}
const getDevelopmentConfig = (context: ConfigEnv) => {
  const config: UserConfig = {
    build: {
      outDir: `out/build/${context.mode}`,
    },
    plugins: [componentExportNamesPlugin()],
  }
  return config
}
const getProductionConfig = () => {
  const title = (packageJson.displayName || packageJson.name) as string
  const cssnanoPlugins = cssnano().plugins.map(([createPlugin, options]) => createPlugin(options))
  const config: UserConfig = {
    build: {
      assetsDir: '',
      emptyOutDir: true,
      rolldownOptions: {
        output: {
          chunkFileNames: chunkInfo => (chunkInfo.name === 'rolldown-runtime' ? 'runtime.js' : '[name].js'),
          assetFileNames: chunkInfo => (chunkInfo.names[0] === 'index.css' ? 'style.css' : '[name].[ext]'),
        },
      },
    },
    plugins: [
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: title,
          short_name: title,
          description: packageJson.description,
          theme_color: '#000',
          background_color: '#000',
          display: 'standalone',
          icons: [
            {
              src: 'icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: 'icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globIgnores: ['**/*.worker-*.js'],
          globPatterns: ['*.{js,css,html,svg}'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        },
      }),
    ],
    css: {
      postcss: {
        plugins: cssnanoPlugins,
      },
    },
  }
  return config
}
const commonConfig = getCommonConfig()

export default defineConfig(context => mergeConfig(
  commonConfig,
  (context.mode === 'production' ? getProductionConfig : getDevelopmentConfig)(context),
))
