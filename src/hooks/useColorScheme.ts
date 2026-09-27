import {useEffect, useState} from 'react'

export const useColorScheme = () => {
  const [scheme, setScheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') {
      return 'dark'
    }
    return globalThis.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })
  useEffect(() => {
    const media = globalThis.matchMedia('(prefers-color-scheme: light)')
    const sync = () => {
      setScheme(media.matches ? 'light' : 'dark')
    }
    sync()
    media.addEventListener('change', sync)
    return () => {
      media.removeEventListener('change', sync)
    }
  }, [])
  return scheme
}
