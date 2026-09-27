import {describe, expect, test} from 'bun:test'

import componentExportNamesPlugin from '#root/lib/componentExportNamesPlugin.ts'

const plugin = componentExportNamesPlugin()
const transform = async (code: string, id: string) => {
  if (typeof plugin.transform !== 'function') {
    throw new TypeError('Expected a function transform hook.')
  }
  const result = await plugin.transform.call({} as never, code, id)
  if (!result) {
    return code
  }
  return typeof result === 'string' ? result : result.code
}
describe('transformComponentExportNames', () => {
  test('names anonymous default exports from index component folders', async () => {
    const result = await transform('export default () => <div />\n', 'C:/Users/jaid/git/.as/jaidlab/casing.run/src/components/App/index.tsx')
    expect(result).toMatch(/const App = \(\) => <div \/>;/u)
    expect(result).toMatch(/export default App;/u)
  })
  test('adds displayName to wrapped anonymous default exports', async () => {
    const result = await transform("import {memo} from 'react'\nexport default memo(() => <div />)\n", 'C:/Users/jaid/git/.as/jaidlab/casing.run/src/components/App/index.tsx')
    expect(result).toMatch(/const App = memo\(\(\) => <div \/>\);/u)
    expect(result).toMatch(/App\.displayName = "App";/u)
    expect(result).toMatch(/export default App;/u)
  })
  test('adds displayName to wrapped anonymous named exports', async () => {
    const result = await transform("import {memo} from 'react'\nexport const App = memo(() => <div />)\n", 'C:/Users/jaid/git/.as/jaidlab/casing.run/src/components/App/index.tsx')
    expect(result).toMatch(/export const App = memo\(\(\) => <div \/>\);/u)
    expect(result).toMatch(/App\.displayName = "App";/u)
  })
  test('derives names from non-index file stems', async () => {
    const result = await transform('export default () => <div />\n', 'C:/Users/jaid/git/.as/jaidlab/casing.run/src/components/foo-bar.tsx')
    expect(result).toMatch(/const FooBar = \(\) => <div \/>;/u)
    expect(result).toMatch(/export default FooBar;/u)
  })
  test('leaves already named default declarations unchanged', async () => {
    const result = await transform('export default function App() {\n  return <div />\n}\n', 'C:/Users/jaid/git/.as/jaidlab/casing.run/src/components/App/index.tsx')
    expect(result).toBe('export default function App() {\n  return <div />\n}\n')
  })
})
