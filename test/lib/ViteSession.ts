import type {OptisParameter, OptisProcessed} from 'optis'
import type {ViteDevServer} from 'vite'

import type {AddressInfo} from 'net'

import optis from 'optis'
import {createServer} from 'vite'

export default class ViteSession implements AsyncDisposable {
  static schema = optis({
    defaults: {
      root: process.cwd(),
    },
  })

  static formatAddress(address: AddressInfo) {
    const host = ['0.0.0.0', '::'].includes(address.address) ? '127.0.0.1' : address.address
    return `http://${host}:${address.port}`
  }

  readonly options: OptisProcessed<typeof ViteSession.schema>
  server: ViteDevServer | undefined

  constructor(options: OptisParameter<typeof ViteSession.schema>) {
    this.options = ViteSession.schema.process(options)
  }

  get url() {
    if (!this.server) {
      throw new Error('Vite server is not initialized')
    }
    const address = this.server.httpServer!.address()
    if (!address) {
      throw new Error('Vite server did not return a listening address')
    }
    if (typeof address === 'string') {
      return address
    }
    return ViteSession.formatAddress(address)
  }

  async init() {
    this.server = await createServer({
      root: this.options.root,
      server: {
        host: '127.0.0.1',
      },
    })
    await this.server.listen()
  }

  async [Symbol.asyncDispose]() {
    await this.server?.close()
  }
}
