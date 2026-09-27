import type {MonacoEditorProps} from 'monacozen'

import Monacozen from 'monacozen'
import {useCallback} from 'react'

import {useColorScheme} from '#src/hooks/useColorScheme.ts'
import {dataJsonSchema} from '#src/lib/schema/data.ts'

import css from './style.module.sass'

type CodeEditorProps = {
  error?: string | null
  onChange: (value: string) => void
  value: string
}

export default ({value, error, onChange}: CodeEditorProps) => {
  const scheme = useColorScheme()
  const handleChange = useCallback<NonNullable<MonacoEditorProps['onChange']>>(next => {
    onChange(next ?? '')
  }, [onChange])
  return <div className={css.pane}>
    <Monacozen
      aria-label='Domain catalog YAML'
      dark={scheme !== 'light'}
      defaultLanguage='yaml'
      language='yaml'
      loading={<div className={css.loading} />}
      schema={dataJsonSchema}
      value={value}
      onChange={handleChange}
    />
    {error ? <div className={css.error} role='alert'>{error}</div> : null}
  </div>
}
