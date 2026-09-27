import {useCallback, useState} from 'react'

import CodeEditor from '#component/CodeEditor'
import Preview from '#component/Preview'
import {DomainCatalog, exampleYaml, tryParseCatalog} from '#src/lib/domain/index.ts'

import css from './style.module.sass'

const initialCatalog = DomainCatalog.fromYaml(exampleYaml)

export default () => {
  const [catalog, setCatalog] = useState(initialCatalog)
  const [error, setError] = useState<string | null>(null)
  const handleChange = useCallback((value: string) => {
    const parsed = tryParseCatalog(value)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setCatalog(parsed.catalog)
    setError(null)
  }, [])
  return <div className={css.container}>
    <CodeEditor error={error} value={exampleYaml} onChange={handleChange} />
    <Preview catalog={catalog} />
  </div>
}
