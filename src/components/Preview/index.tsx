import type {DomainCatalog} from '#src/lib/domain/index.ts'

import {useRef, useState} from 'react'

import DomainCard from '#component/DomainCard'

import css from './style.module.sass'

type ExportAction = 'copy' | 'download'

const screenshotFallbackIcon = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#16141a" stroke="#f4f1ec" stroke-width=".75"/><ellipse cx="8" cy="8" rx="2.7" ry="6.15" fill="none" stroke="#f4f1ec" stroke-width="1.05"/><path d="M2.05 8h11.9M3.15 5.05h9.7M3.15 10.95h9.7" fill="none" stroke="#f4f1ec" stroke-width="1.05"/></svg>')}`
const screenshotOptions = {
  fallbackURL: screenshotFallbackIcon,
  placeholders: false,
  reconcile: true,
} as const
const screenshotExportOptions = {
  height: 4096,
  dpr: 1,
} as const

export default ({catalog}: {catalog: DomainCatalog}) => {
  const offers = catalog.sorted()
  const captureRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState<ExportAction | null>(null)
  const [copied, setCopied] = useState(false)
  const exportScreenshot = async (action: ExportAction) => {
    const element = captureRef.current
    if (!element || exporting) {
      return
    }
    setExporting(action)
    setCopied(false)
    try {
      const {snapdom} = await import('@zumer/snapdom')
      const screenshot = await snapdom(element, screenshotOptions)
      if (action === 'download') {
        await screenshot.download({
          ...screenshotExportOptions,
          filename: 'domains.png',
        })
        return
      }
      const blob = await screenshot.toBlob({
        ...screenshotExportOptions,
        type: 'png',
      })
      await navigator.clipboard.write([
        new ClipboardItem({'image/png': blob}),
      ])
      setCopied(true)
    } finally {
      setExporting(null)
    }
  }
  return <div className={css.preview}>
    <div className={css.toolbar}>
      <button
        className={css.exportButton}
        disabled={exporting != null}
        type='button'
        onClick={() => void exportScreenshot('copy')}
      >{exporting === 'copy' ? 'Copying…' : copied ? 'Copied' : 'Copy PNG'}</button>
      <button
        className={css.exportButton}
        disabled={exporting != null}
        type='button'
        onClick={() => void exportScreenshot('download')}
      >{exporting === 'download' ? 'Exporting…' : 'Download PNG'}</button>
    </div>
    <div className={css.capture} data-screenshot-target ref={captureRef}>
      {offers.map(offer => <DomainCard
        key={[offer.index, offer.domain, offer.vendorName ?? ''].join(':')}
        catalog={catalog}
        offer={offer}
      />)}
    </div>
  </div>
}
