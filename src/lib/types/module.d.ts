declare module '*.module.sass' {
  const classes: Record<string, string>
  export default classes
}
declare module '*.sass' {
  const content: string
  export default content
}
declare module 'postcss-sass' {
  const syntax: any
  export default syntax
}
