import {expect, test} from 'bun:test'

const {default: domainCards} = await import('#src/main.ts')

test('should run', () => {
  const result = domainCards()
  expect(result).toBe('domain-cards') // TODO Test actual functionality
})
