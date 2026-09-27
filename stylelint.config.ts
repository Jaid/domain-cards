import type {Config} from 'stylelint'

import postcssSass from 'postcss-sass'

const plainRules = [
  'at-rule-no-deprecated',
  'declaration-property-value-keyword-no-deprecated',
  'media-type-no-deprecated',
  'no-descending-specificity',
  'no-unknown-custom-media',
  'no-unknown-custom-properties',
  'property-no-deprecated',
  'property-no-unknown',
  'selector-no-deprecated',
  'selector-no-invalid',
  'unit-no-unknown',
  'at-rule-prelude-no-invalid',
  'block-no-empty',
  'color-no-invalid-hex',
  'comment-no-empty',
  'custom-property-no-missing-var-function',
  'declaration-block-no-duplicate-custom-properties',
  'declaration-block-no-duplicate-properties',
  'font-family-no-duplicate-names',
  'font-family-no-missing-generic-family-keyword',
  'function-calc-no-unspaced-operator',
  'keyframe-block-no-duplicate-selectors',
  'keyframe-declaration-no-important',
  'media-query-no-invalid',
  'named-grid-areas-no-invalid',
  'nesting-selector-no-missing-scoping-root',
  'no-duplicate-at-import-rules',
  'no-duplicate-selectors',
  'no-empty-source',
  'no-invalid-double-slash-comments',
  'no-invalid-position-at-import-rule',
  'no-invalid-position-declaration',
  'no-irregular-whitespace',
  'string-no-newline',
  'syntax-string-no-invalid',
  'annotation-no-unknown',
  'at-rule-descriptor-no-unknown',
  'at-rule-descriptor-value-no-unknown',
  'at-rule-no-unknown',
  'declaration-property-value-no-unknown',
  'function-no-unknown',
  'media-feature-name-no-unknown',
  'media-feature-name-value-no-unknown',
  'no-unknown-animations',
  'no-unknown-custom-media',
  'no-unknown-custom-properties',
  'property-no-unknown',
  'selector-anb-no-unmatchable',
  'selector-pseudo-class-no-unknown',
  'selector-pseudo-element-no-unknown',
  'selector-type-no-unknown',
  'unit-no-unknown',
  'length-zero-no-unit',
  'block-no-redundant-nested-style-rules',
  'declaration-block-no-redundant-longhand-properties',
  'shorthand-property-no-redundant-values',
]
const customizedRules = {
  'scss/at-rule-no-unknown': [
    true,
    {
      ignoreAtRules: ['import-normalize', 'import-sanitize'],
    },
  ],
  'selector-class-pattern': '^[a-z][a-zA-Z0-9]*$',
  'hue-degree-notation': 'number',
  'font-family-name-quotes': 'always-where-required',
  'lightness-notation': 'percentage',
  'color-function-notation': 'modern',
  'relative-selector-nesting-notation': 'implicit',
  'media-feature-range-notation': 'context',
  'color-function-alias-notation': 'without-alpha',
  'alpha-value-notation': 'percentage',
}
const disabledRules = ['rule-empty-line-before']
const rules: Record<string, unknown> = {}
for (const rule of plainRules) {
  rules[rule] = true
}
for (const [rule, options] of Object.entries(customizedRules)) {
  rules[rule] = options
}
for (const rule of disabledRules) {
  rules[rule] = null
}
const config: Config = {
  customSyntax: postcssSass,
  plugins: ['stylelint-scss'],
  rules,
}

export default config
