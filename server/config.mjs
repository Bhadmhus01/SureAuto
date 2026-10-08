const parseBoolean = (name, value, fallback = false) => {
  if (value === undefined) return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`${name} must be set to either true or false.`)
}

export function runtimeConfig(env = process.env) {
  const production = env.NODE_ENV === 'production'
  const sandbox = parseBoolean('SANDBOX_MODE', env.SANDBOX_MODE, false)
  const secureCookies = parseBoolean('COOKIE_SECURE', env.COOKIE_SECURE, false)
  const embeddedCookies = parseBoolean('COOKIE_EMBEDDED', env.COOKIE_EMBEDDED, false)
  const trustProxy = parseBoolean('TRUST_PROXY', env.TRUST_PROXY, false)
  const registrationEnabled = parseBoolean('PUBLIC_REGISTRATION_ENABLED', env.PUBLIC_REGISTRATION_ENABLED, !production)
  const port = Number(env.API_PORT || 3001)

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('API_PORT must be an integer between 1 and 65535.')
  }
  if (production && sandbox) {
    throw new Error('Sandbox must run as a separate non-production deployment and database.')
  }
  if (production && !env.DATABASE_URL) {
    throw new Error('Production requires DATABASE_URL.')
  }
  if (production && !secureCookies) {
    throw new Error('Production requires HTTPS and COOKIE_SECURE=true.')
  }
  if (production && embeddedCookies) {
    throw new Error('COOKIE_EMBEDDED is for HTTPS embedded previews, not production deployments.')
  }
  if (embeddedCookies && !secureCookies) {
    throw new Error('Embedded cookies require HTTPS and COOKIE_SECURE=true.')
  }

  return { production, sandbox, secureCookies, embeddedCookies, trustProxy, registrationEnabled, port }
}
