import { createApp } from './app.mjs'
if (process.env.NODE_ENV === 'production') {
  if (process.env.SANDBOX_MODE === 'true') throw new Error('Sandbox must run as a separate non-production deployment and database.')
  if (!process.env.DATABASE_URL || process.env.COOKIE_SECURE !== 'true') throw new Error('Production requires DATABASE_URL, HTTPS and COOKIE_SECURE=true.')
}
const app = await createApp()
await app.listen({ port: Number(process.env.API_PORT || 3001), host: '0.0.0.0' })
console.log(`SureAuto API listening on ${process.env.API_PORT || 3001}; sandbox=${process.env.SANDBOX_MODE === 'true'}. No payment or registry provider connected.`)
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { await app.close(); process.exit(0) })
