import {generateClassicSW} from '@vite-pwa/workbox-build'

const outDir = process.argv[2] ?? 'dist'

await generateClassicSW({
  globDirectory: outDir,
  swDest: `${outDir}/sw.js`,
  globPatterns: ['*.{js,css,html,svg}'],
  globIgnores: ['**/*.worker-*.js'],
  maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  skipWaiting: true,
  navigateFallback: 'index.html',
})
