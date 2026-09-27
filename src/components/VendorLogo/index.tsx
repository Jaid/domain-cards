import {useState} from 'react'

import css from './style.module.sass'

type VendorLogoProps = {
  bundled?: boolean
  bundledBackground?: string
  name?: string
  sources: ReadonlyArray<string>
}

const GlobeIcon = () => {
  return <svg className={css.logo} aria-hidden='true' viewBox='0 0 16 16'>
    <circle cx='8' cy='8' fill='none' r='6.15' stroke='currentColor' strokeWidth='1.15' />
    <ellipse cx='8' cy='8' fill='none' rx='2.7' ry='6.15' stroke='currentColor' strokeWidth='1.05' />
    <path d='M2.05 8h11.9M3.15 5.05h9.7M3.15 10.95h9.7' fill='none' stroke='currentColor' strokeWidth='1.05' />
  </svg>
}

export default ({sources, name, bundled = false, bundledBackground}: VendorLogoProps) => {
  const [index, setIndex] = useState(0)
  const src = sources[index]
  if (!src) {
    return <GlobeIcon />
  }
  const image = <img
    className={bundled ? css.bundledIcon : css.logo}
    alt=''
    decoding='async'
    draggable={false}
    height={16}
    loading='lazy'
    referrerPolicy='no-referrer'
    src={src}
    title={name}
    width={16}
    onError={() => {
      setIndex(current => current + 1)
    }}
  />
  if (bundled) {
    return <span className={css.bundledFrame} style={{background: bundledBackground}} title={name}>{image}</span>
  }
  return image
}
