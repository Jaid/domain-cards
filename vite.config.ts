import type {PackageJson} from 'type-fest'
import type {ConfigEnv, UserConfig} from 'vite'

import babelPlugin from '@rolldown/plugin-babel'
import {ViteWorkboxPWAPlugin as workboxPwaPlugin} from '@vite-pwa/workbox-build/build/vite/plugin'
import reactPlugin, {reactCompilerPreset} from '@vitejs/plugin-react'
import postcssAutoprefixer from 'autoprefixer'
import cssnano from 'cssnano-preset-advanced'
import postcssNormalize from 'postcss-normalize'
import {defineConfig, mergeConfig} from 'vite'
import mediaMixinsPlugin from 'vite-plugin-media-mixins'
import titlePlugin from 'vite-plugin-title'

import componentExportNamesPlugin from '#root/lib/componentExportNamesPlugin.ts'
import pwaPlugin from '#root/lib/pwaPlugin.ts'

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
      pwaPlugin({
        name: title,
        description: packageJson.description,
        icon: 'icon.svg',
      }),
      workboxPwaPlugin({
        strategy: 'generate-sw',
        generateSW: {
          swDest: 'sw.js',
          globPatterns: ['*.{js,css,html,svg}'],
          globIgnores: ['**/*.worker-*.js'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          navigateFallback: 'index.html',
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
