import type {Plugin} from 'vite'

import * as ts from 'typescript'

const componentModuleExpression = /\.[cm]?[jt]sx$/u
const extensionExpression = /\.[^.]+$/u
const sourceMapCommentExpression = /\r?\n\/\/# sourceMappingURL=.*$/u
const queryExpression = /\?.*$/u
const normalizeFileId = (id: string) => id.replace(queryExpression, '').replaceAll('\\', '/')
const toPascalCase = (value: string) => {
  const words = value
    .replaceAll(/([0-9a-z])([A-Z])/gu, '$1 $2')
    .split(/[^0-9A-Za-z]+/u)
    .filter(Boolean)
  const name = words.map(word => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`).join('')
  if (!name) {
    return 'Component'
  }
  if (/^[$A-Z_a-z]/u.test(name)) {
    return name
  }
  return `_${name}`
}
const getPreferredComponentName = (id: string) => {
  const pathSegments = normalizeFileId(id).split('/')
  const fileName = pathSegments.at(-1) ?? ''
  const fileStem = fileName.replace(extensionExpression, '')
  const rawName = fileStem === 'index' ? pathSegments.at(-2) ?? fileStem : fileStem
  return toPascalCase(rawName)
}
const hasModifier = (node: ts.Node, kind: ts.SyntaxKind) => ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some(modifier => modifier.kind === kind) ?? false)
const addBindingName = (bindingName: ts.BindingName, names: Set<string>): void => {
  if (ts.isIdentifier(bindingName)) {
    names.add(bindingName.text)
    return
  }
  for (const element of bindingName.elements) {
    if (ts.isOmittedExpression(element)) {
      continue
    }
    addBindingName(element.name, names)
  }
}
const collectRuntimeBindingNames = (sourceFile: ts.SourceFile) => {
  const names = new Set<string>
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const importClause = statement.importClause
      if (!importClause || importClause.isTypeOnly) {
        continue
      }
      if (importClause.name) {
        names.add(importClause.name.text)
      }
      const namedBindings = importClause.namedBindings
      if (!namedBindings) {
        continue
      }
      if (ts.isNamespaceImport(namedBindings)) {
        names.add(namedBindings.name.text)
        continue
      }
      for (const element of namedBindings.elements) {
        if (element.isTypeOnly) {
          continue
        }
        names.add(element.name.text)
      }
      continue
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        addBindingName(declaration.name, names)
      }
      continue
    }
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) {
      if (statement.name) {
        names.add(statement.name.text)
      }
    }
  }
  return names
}
const collectDisplayNameTargets = (sourceFile: ts.SourceFile) => {
  const names = new Set<string>
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement)) {
      continue
    }
    const expression = statement.expression
    if (!ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
      continue
    }
    if (!ts.isPropertyAccessExpression(expression.left) || expression.left.name.text !== 'displayName') {
      continue
    }
    if (!ts.isIdentifier(expression.left.expression)) {
      continue
    }
    names.add(expression.left.expression.text)
  }
  return names
}
const getAvailableName = (preferredName: string, occupiedNames: Set<string>) => {
  if (!occupiedNames.has(preferredName)) {
    return preferredName
  }
  let index = 1
  while (true) {
    const candidate = index === 1 ? `_${preferredName}` : `_${preferredName}${index}`
    if (!occupiedNames.has(candidate)) {
      return candidate
    }
    index += 1
  }
}
const unwrapExpression = (expression: ts.Expression): ts.Expression => {
  let currentExpression = expression
  while (true) {
    if (ts.isParenthesizedExpression(currentExpression) || ts.isAsExpression(currentExpression) || ts.isSatisfiesExpression(currentExpression) || ts.isNonNullExpression(currentExpression) || ts.isPartiallyEmittedExpression(currentExpression) || ts.isTypeAssertionExpression(currentExpression)) {
      currentExpression = currentExpression.expression
      continue
    }
    return currentExpression
  }
}
const isAnonymousFunctionLikeExpression = (expression: ts.Expression) => {
  const unwrappedExpression = unwrapExpression(expression)
  if (ts.isArrowFunction(unwrappedExpression)) {
    return true
  }
  if (ts.isFunctionExpression(unwrappedExpression) || ts.isClassExpression(unwrappedExpression)) {
    return !unwrappedExpression.name
  }
  return false
}
const containsAnonymousFunctionLike = (expression: ts.Expression | undefined): boolean => {
  if (!expression) {
    return false
  }
  const unwrappedExpression = unwrapExpression(expression)
  if (isAnonymousFunctionLikeExpression(unwrappedExpression)) {
    return true
  }
  if (ts.isCallExpression(unwrappedExpression)) {
    return containsAnonymousFunctionLike(unwrappedExpression.expression) || unwrappedExpression.arguments.some(argument => containsAnonymousFunctionLike(argument))
  }
  if (ts.isConditionalExpression(unwrappedExpression)) {
    return containsAnonymousFunctionLike(unwrappedExpression.condition) || containsAnonymousFunctionLike(unwrappedExpression.whenTrue) || containsAnonymousFunctionLike(unwrappedExpression.whenFalse)
  }
  if (ts.isBinaryExpression(unwrappedExpression)) {
    return containsAnonymousFunctionLike(unwrappedExpression.left) || containsAnonymousFunctionLike(unwrappedExpression.right)
  }
  if (ts.isArrayLiteralExpression(unwrappedExpression)) {
    return unwrappedExpression.elements.some(element => ts.isExpression(element) && containsAnonymousFunctionLike(element))
  }
  if (ts.isObjectLiteralExpression(unwrappedExpression)) {
    return unwrappedExpression.properties.some(property => {
      if (ts.isPropertyAssignment(property)) {
        return containsAnonymousFunctionLike(property.initializer)
      }
      if (ts.isSpreadAssignment(property)) {
        return containsAnonymousFunctionLike(property.expression)
      }
      return false
    })
  }
  if (ts.isPropertyAccessExpression(unwrappedExpression)) {
    return containsAnonymousFunctionLike(unwrappedExpression.expression)
  }
  if (ts.isElementAccessExpression(unwrappedExpression)) {
    return containsAnonymousFunctionLike(unwrappedExpression.expression) || containsAnonymousFunctionLike(unwrappedExpression.argumentExpression)
  }
  if (ts.isPrefixUnaryExpression(unwrappedExpression) || ts.isPostfixUnaryExpression(unwrappedExpression)) {
    return containsAnonymousFunctionLike(unwrappedExpression.operand)
  }
  if (ts.isDeleteExpression(unwrappedExpression) || ts.isTypeOfExpression(unwrappedExpression) || ts.isVoidExpression(unwrappedExpression) || ts.isAwaitExpression(unwrappedExpression)) {
    return containsAnonymousFunctionLike(unwrappedExpression.expression)
  }
  if (ts.isYieldExpression(unwrappedExpression)) {
    return containsAnonymousFunctionLike(unwrappedExpression.expression)
  }
  if (ts.isCommaListExpression(unwrappedExpression)) {
    return unwrappedExpression.elements.some(element => containsAnonymousFunctionLike(element))
  }
  if (ts.isTemplateExpression(unwrappedExpression)) {
    return unwrappedExpression.templateSpans.some(span => containsAnonymousFunctionLike(span.expression))
  }
  return false
}
const shouldTransformDefaultExportExpression = (expression: ts.Expression) => {
  const unwrappedExpression = unwrapExpression(expression)
  if (ts.isIdentifier(unwrappedExpression)) {
    return false
  }
  if (isAnonymousFunctionLikeExpression(unwrappedExpression)) {
    return true
  }
  if (ts.isCallExpression(unwrappedExpression)) {
    return containsAnonymousFunctionLike(unwrappedExpression)
  }
  return false
}
const shouldAddDisplayName = (expression: ts.Expression) => {
  const unwrappedExpression = unwrapExpression(expression)
  return ts.isCallExpression(unwrappedExpression) && containsAnonymousFunctionLike(unwrappedExpression)
}
const createDisplayNameAssignment = (localName: string, displayName: string) => ts.factory.createExpressionStatement(ts.factory.createBinaryExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier(localName), 'displayName'), ts.factory.createToken(ts.SyntaxKind.EqualsToken), ts.factory.createStringLiteral(displayName)))
const renameComponentExports = (sourceFile: ts.SourceFile, preferredName: string) => {
  const occupiedNames = collectRuntimeBindingNames(sourceFile)
  const displayNameTargets = collectDisplayNameTargets(sourceFile)
  const statements: Array<ts.Statement> = []
  let changed = false
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement) && !statement.isExportEquals && shouldTransformDefaultExportExpression(statement.expression)) {
      const localName = getAvailableName(preferredName, occupiedNames)
      occupiedNames.add(localName)
      statements.push(ts.factory.createVariableStatement(undefined, ts.factory.createVariableDeclarationList([ts.factory.createVariableDeclaration(ts.factory.createIdentifier(localName), undefined, undefined, statement.expression)], ts.NodeFlags.Const)))
      if ((localName !== preferredName || shouldAddDisplayName(statement.expression)) && !displayNameTargets.has(localName)) {
        statements.push(createDisplayNameAssignment(localName, preferredName))
        displayNameTargets.add(localName)
      }
      statements.push(ts.factory.createExportAssignment(undefined, false, ts.factory.createIdentifier(localName)))
      changed = true
      continue
    }
    if (ts.isFunctionDeclaration(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword) && hasModifier(statement, ts.SyntaxKind.DefaultKeyword) && !statement.name) {
      const localName = getAvailableName(preferredName, occupiedNames)
      occupiedNames.add(localName)
      statements.push(ts.factory.updateFunctionDeclaration(statement, statement.modifiers, statement.asteriskToken, ts.factory.createIdentifier(localName), statement.typeParameters, statement.parameters, statement.type, statement.body))
      if (localName !== preferredName && !displayNameTargets.has(localName)) {
        statements.push(createDisplayNameAssignment(localName, preferredName))
        displayNameTargets.add(localName)
      }
      changed = true
      continue
    }
    if (ts.isClassDeclaration(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword) && hasModifier(statement, ts.SyntaxKind.DefaultKeyword) && !statement.name) {
      const localName = getAvailableName(preferredName, occupiedNames)
      occupiedNames.add(localName)
      statements.push(ts.factory.updateClassDeclaration(statement, statement.modifiers, ts.factory.createIdentifier(localName), statement.typeParameters, statement.heritageClauses, statement.members))
      if (localName !== preferredName && !displayNameTargets.has(localName)) {
        statements.push(createDisplayNameAssignment(localName, preferredName))
        displayNameTargets.add(localName)
      }
      changed = true
      continue
    }
    statements.push(statement)
    if (!ts.isVariableStatement(statement) || !hasModifier(statement, ts.SyntaxKind.ExportKeyword) || hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
      continue
    }
    const displayNameStatements: Array<ts.Statement> = []
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer || !shouldAddDisplayName(declaration.initializer)) {
        continue
      }
      const exportName = declaration.name.text
      if (displayNameTargets.has(exportName)) {
        continue
      }
      displayNameTargets.add(exportName)
      displayNameStatements.push(createDisplayNameAssignment(exportName, exportName))
    }
    if (!displayNameStatements.length) {
      continue
    }
    statements.push(...displayNameStatements)
    changed = true
  }
  return {
    changed,
    sourceFile: changed ? ts.factory.updateSourceFile(sourceFile, statements) : sourceFile,
  }
}
const transformComponentExportNames = (code: string, id: string) => {
  const fileId = normalizeFileId(id)
  if (fileId.includes('/node_modules/') || !componentModuleExpression.test(fileId) || !code.includes('export')) {
    return
  }
  const preferredName = getPreferredComponentName(fileId)
  let changed = false
  const result = ts.transpileModule(code, {
    fileName: fileId,
    compilerOptions: {
      allowJs: true,
      inlineSources: true,
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      newLine: ts.NewLineKind.LineFeed,
      sourceMap: true,
      target: ts.ScriptTarget.ESNext,
      verbatimModuleSyntax: true,
    },
    transformers: {
      before: [
        () => sourceFile => {
          const transformed = renameComponentExports(sourceFile, preferredName)
          changed = transformed.changed
          return transformed.sourceFile
        },
      ],
    },
  })
  if (!changed) {
    return
  }
  return {
    code: result.outputText.replace(sourceMapCommentExpression, ''),
    map: result.sourceMapText,
  }
}
const componentExportNamesPlugin = (): Plugin => ({
  name: 'component-export-names',
  enforce: 'pre',
  transform(code, id) {
    return transformComponentExportNames(code, id)
  },
})

export default componentExportNamesPlugin
