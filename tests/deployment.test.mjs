import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.mjs'
import { database } from '../server/db.mjs'
import { runtimeConfig } from '../server/config.mjs'

let app
beforeAll(async () => {
  app = await createApp({ db: await database({ directory: 'memory://' }), sandbox: true })
})
afterAll(async () => {
  await app.close()
})

describe('deployment readiness and fail-closed configuration', () => {
  it('exposes separate liveness and database-readiness checks without enabling integrations', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/health/live' })).json()).toEqual({ ok: true })
    expect((await app.inject({ method: 'GET', url: '/api/health/ready' })).json()).toEqual({ ok: true, sandbox: true })
    expect((await app.inject({ method: 'GET', url: '/api/health' })).json()).toMatchObject({
      payments: 'disabled',
      registries: 'unavailable',
    })
  })

  it('returns not-ready when the database probe fails without disclosing internals', async () => {
    const query = app.db.query
    app.db.query = async () => { throw new Error('private database connection details') }
    try {
      const response = await app.inject({ method: 'GET', url: '/api/health/ready' })
      expect(response.statusCode).toBe(503)
      expect(response.json()).toEqual({ ok: false })
      expect(JSON.stringify(response.json())).not.toContain('private database connection details')
    } finally {
      app.db.query = query
    }
  })

  it('requires a separate database and secure, non-embedded cookies for production', () => {
    expect(runtimeConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://sureauto:example@db/sureauto',
      SANDBOX_MODE: 'false',
      COOKIE_SECURE: 'true',
      TRUST_PROXY: 'true',
      API_PORT: '3001',
    })).toMatchObject({ production: true, sandbox: false, secureCookies: true, trustProxy: true, registrationEnabled: false, port: 3001 })

    expect(() => runtimeConfig({ NODE_ENV: 'production', COOKIE_SECURE: 'true' })).toThrow('DATABASE_URL')
    expect(() => runtimeConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://db/sureauto' })).toThrow('COOKIE_SECURE=true')
    expect(() => runtimeConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://db/sureauto', COOKIE_SECURE: 'true', SANDBOX_MODE: 'true' })).toThrow('separate non-production')
    expect(() => runtimeConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://db/sureauto', COOKIE_SECURE: 'true', COOKIE_EMBEDDED: 'true' })).toThrow('not production')
    expect(runtimeConfig({ NODE_ENV: 'development' }).registrationEnabled).toBe(true)
    expect(runtimeConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://db/sureauto', COOKIE_SECURE: 'true', PUBLIC_REGISTRATION_ENABLED: 'true' }).registrationEnabled).toBe(true)
    expect(() => runtimeConfig({ API_PORT: '70000' })).toThrow('API_PORT')
    expect(() => runtimeConfig({ TRUST_PROXY: 'sometimes' })).toThrow('TRUST_PROXY')
    expect(() => runtimeConfig({ PUBLIC_REGISTRATION_ENABLED: 'sometimes' })).toThrow('PUBLIC_REGISTRATION_ENABLED')
  })
})
