import { createApp } from './app.mjs'
import { runtimeConfig } from './config.mjs'

const config = runtimeConfig()
const app = await createApp({ trustProxy: config.trustProxy, registrationEnabled: config.registrationEnabled })
await app.listen({ port: config.port, host: '0.0.0.0' })
console.log(`SureAuto API listening on ${config.port}; sandbox=${config.sandbox}. No payment or registry provider connected.`)
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { await app.close(); process.exit(0) })
