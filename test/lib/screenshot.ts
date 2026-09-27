import type {OptisParameter} from 'optis'
import type {Page} from 'puppeteer-core'

import optis from 'optis'

const schema = optis.typed<{
  optional: {
    colorScheme: 'dark' | 'light'
    element: string
  }
}>()
export default async (page: Page, options: OptisParameter<typeof schema>) => {
  options = schema.process(options)
  if (options.colorScheme) {
    await page.emulateMediaFeatures([{
      name: 'prefers-color-scheme',
      value: options.colorScheme,
    }])
  }
  if (options.element) {
    const element = await page.waitForSelector(options.element)
    return element!.screenshot({
      captureBeyondViewport: true,
      omitBackground: true,
    })
  }
  return page.screenshot()
}
