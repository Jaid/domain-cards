const base = 36
const tMin = 1
const tMax = 26
const skew = 38
const damp = 700
const initialBias = 72
const initialN = 128
const delimiter = '-'
export function hasPunycode(domain: string): boolean {
  return domain.split('.').some(label => label.toLowerCase().startsWith('xn--'))
}
export function displayDomain(domain: string, mode: 'code' | 'raw' = 'code'): string {
  if (mode === 'raw') {
    return domain
  }
  return domain.split('.').map(label => {
    if (!label.toLowerCase().startsWith('xn--')) {
      return label
    }
    return decodePunycode(label.slice(4)) ?? label
  }).join('.')
}
function adapt(delta: number, points: number, firstTime: boolean): number {
  let value = firstTime ? Math.floor(delta / damp) : delta >> 1
  value += Math.floor(value / points)
  let k = 0
  const threshold = Math.floor((base - tMin) * tMax / 2)
  while (value > threshold) {
    value = Math.floor(value / (base - tMin))
    k += base
  }
  return k + Math.floor((base - tMin + 1) * value / (value + skew))
}
function digitValue(codePoint: number): number {
  if (codePoint >= 48 && codePoint <= 57) {
    return codePoint - 22
  }
  if (codePoint >= 65 && codePoint <= 90) {
    return codePoint - 65
  }
  if (codePoint >= 97 && codePoint <= 122) {
    return codePoint - 97
  }
  return base
}
function decodePunycode(input: string): string | undefined {
  const output: Array<number> = []
  const delimiterIndex = input.lastIndexOf(delimiter)
  let index = 0
  if (delimiterIndex !== -1) {
    for (let position = 0; position < delimiterIndex; position++) {
      const codePoint = input.charCodeAt(position)
      if (codePoint >= 0x80) {
        return undefined
      }
      output.push(codePoint)
    }
    index = delimiterIndex + 1
  }
  let n = initialN
  let bias = initialBias
  let i = 0
  while (index < input.length) {
    const oldI = i
    let weight = 1
    for (let k = base;; k += base) {
      if (index >= input.length) {
        return undefined
      }
      const digit = digitValue(input.charCodeAt(index++))
      if (digit >= base) {
        return undefined
      }
      i += digit * weight
      const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias
      if (digit < t) {
        break
      }
      weight *= base - t
    }
    const length = output.length + 1
    bias = adapt(i - oldI, length, oldI === 0)
    n += Math.floor(i / length)
    i %= length
    if (n > 0x10_FF_FF) {
      return undefined
    }
    output.splice(i, 0, n)
    i++
  }
  return String.fromCodePoint(...output)
}
