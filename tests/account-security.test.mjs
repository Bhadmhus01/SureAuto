import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.mjs'
import { database } from '../server/db.mjs'

const headers = { 'x-sureauto-request': '1' }
const cookie = response => `sa_session=${response.cookies.find(item => item.name === 'sa_session').value}`
const call = (app, method, url, body, session) => app.inject({
  method,
  url,
  headers: { ...headers, ...(session ? { cookie: session } : {}) },
  ...(body === undefined ? {} : { payload: body }),
})

let live, sandbox, inviteOnly
beforeAll(async () => {
  live = await createApp({ db: await database({ directory: 'memory://' }), sandbox: false })
  sandbox = await createApp({ db: await database({ directory: 'memory://' }), sandbox: true })
  inviteOnly = await createApp({ db: await database({ directory: 'memory://' }), sandbox: false, registrationEnabled: false })
})
afterAll(async () => {
  await Promise.all([live.close(), sandbox.close(), inviteOnly.close()])
})

describe('live account password security', () => {
  it('changes a password only after current-password verification and revokes old sessions', async () => {
    const account = { name: 'Security Test', email: 'security@example.test', password: 'old-test-password-123' }
    const registration = await call(live, 'POST', '/api/auth/register', account)
    expect(registration.statusCode).toBe(200)
    const firstSession = cookie(registration)
    const login = await call(live, 'POST', '/api/auth/login', { email: account.email, password: account.password })
    expect(login.statusCode).toBe(200)
    const secondSession = cookie(login)

    const wrongPassword = await call(live, 'POST', '/api/auth/password', {
      currentPassword: 'incorrect-password',
      newPassword: 'new-test-password-456',
    }, firstSession)
    expect(wrongPassword.statusCode).toBe(403)
    expect((await call(live, 'GET', '/api/auth/session', undefined, firstSession)).statusCode).toBe(200)

    expect((await call(live, 'POST', '/api/auth/password', {
      currentPassword: account.password,
      newPassword: 'short',
    }, firstSession)).statusCode).toBe(400)
    expect((await call(live, 'POST', '/api/auth/password', {
      currentPassword: account.password,
      newPassword: account.password,
      unexpected: true,
    }, firstSession)).statusCode).toBe(400)

    const changed = await call(live, 'POST', '/api/auth/password', {
      currentPassword: account.password,
      newPassword: 'new-test-password-456',
    }, firstSession)
    expect(changed.statusCode).toBe(200)
    expect(changed.json()).toEqual({ ok: true })
    expect(changed.cookies[0].httpOnly).toBe(true)
    const rotatedSession = cookie(changed)
    expect(rotatedSession).not.toBe(firstSession)

    expect((await call(live, 'GET', '/api/auth/session', undefined, rotatedSession)).statusCode).toBe(200)
    expect((await call(live, 'GET', '/api/auth/session', undefined, firstSession)).statusCode).toBe(401)
    expect((await call(live, 'GET', '/api/auth/session', undefined, secondSession)).statusCode).toBe(401)
    expect((await call(live, 'POST', '/api/auth/login', { email: account.email, password: account.password })).statusCode).toBe(401)
    expect((await call(live, 'POST', '/api/auth/login', { email: account.email, password: 'new-test-password-456' })).statusCode).toBe(200)

    const stored = (await live.db.query('SELECT password_hash FROM users WHERE email=$1', [account.email])).rows[0].password_hash
    expect(stored).not.toContain(account.password)
    expect(stored).not.toContain('new-test-password-456')
  })

  it('keeps public sign-up closed unless an operator enables it', async () => {
    expect((await call(inviteOnly, 'GET', '/api/health')).json().registrationEnabled).toBe(false)
    const response = await call(inviteOnly, 'POST', '/api/auth/register', {
      name: 'Invite Test', email: 'invite@example.test', password: 'test-password-with-12-chars',
    })
    expect(response.statusCode).toBe(503)
    expect(response.json().error).toContain('disabled for this deployment')
  })

  it('rejects account-password operations in isolated sandbox workspaces', async () => {
    const started = await call(sandbox, 'POST', '/api/sandbox/start', {})
    expect(started.statusCode).toBe(200)
    const result = await call(sandbox, 'POST', '/api/auth/password', {
      currentPassword: 'not-a-sandbox-password',
      newPassword: 'new-test-password-456',
    }, cookie(started))
    expect(result.statusCode).toBe(403)
  })
})
