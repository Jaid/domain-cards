import type {FunctionComponent} from 'react'

import clsx from 'clsx'

import css from './style.module.sass'

type Props = {
  chunkClassName?: string
  className?: string
  gluedPrefix?: boolean
  gluedSuffix?: boolean
  numberClassName?: string
  numberRef?: (element: HTMLSpanElement | null) => void
  prefix?: string
  prefixClassName?: string
  splitMinimum?: number
  splitSymbol?: string
  suffix?: string
  suffixClassName?: string
  suffixPlural?: ((value: number, singular: string) => string) | true | string
  value: number
}

const defaultSplitMinimum = 10_000
const NumberDisplay: FunctionComponent<Props> = props => {
  if (Number.isNaN(props.value)) {
    return
  }
  const getPrefixText = () => {
    if (!props.prefix) {
      return
    }
    if (!props.gluedPrefix) {
      return `${props.prefix} `
    }
    return props.prefix
  }
  const prefixText = getPrefixText()
  const getSuffixText = () => {
    if (!props.suffix) {
      return
    }
    const plural = props.suffixPlural === true ? (props.value === 1 ? props.suffix : `${props.suffix}s`) : (typeof props.suffixPlural === 'function' ? props.suffixPlural(props.value, props.suffix) : props.suffix)
    if (!props.gluedSuffix) {
      return ` ${plural}`
    }
    return plural
  }
  const suffixText = getSuffixText()
  const prefixElement = props.prefix ? <span className={clsx(props.prefixClassName, css.prefix)}>{prefixText}</span> : null
  const suffixElement = props.suffix ? <span className={clsx(props.suffixClassName, css.suffix)}>{suffixText}</span> : null
  const splitMinimum = props.splitMinimum ?? defaultSplitMinimum
  const getNumberParts = () => {
    if (props.value < splitMinimum) {
      return props.value
    }
    const elements = []
    let remaining = props.value
    while (remaining > 0) {
      const chunk = remaining % 1000
      remaining = Math.floor(remaining / 1000)
      elements.unshift(<span key={elements.length} className={clsx(props.chunkClassName, css.chunk)}>{chunk}</span>)
    }
    return elements
  }
  const numberParts = getNumberParts()
  const numberElement = <span className={clsx(props.numberClassName, css.number)} ref={props.numberRef}>{numberParts}</span>
  return <span className={clsx(props.className, css.element)}>
    {prefixElement}
    {numberElement}
    {suffixElement}
  </span>
}

export default NumberDisplay
