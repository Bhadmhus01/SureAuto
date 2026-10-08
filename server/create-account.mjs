import { z } from 'zod'
import { database, migrate } from './db.mjs'
import { id, passwordHash } from './service.mjs'

const [role, email, name] = process.argv.slice(2)
const fields = z.object({
  role: z.enum(['buyer', 'inspector', 'admin']),
  email: z.email().max(254).transform(value => value.toLowerCase()),
  name: z.string().trim().min(3).max(80),
  password: z.string().min(12).max(128),
}).parse({ role, email, name, password: process.env.SUREAUTO_ACCOUNT_PASSWORD })

if (!process.env.DATABASE_URL) {
  throw new Error('Account provisioning requires DATABASE_URL pointing to the live PostgreSQL database.')
}

const db = await database({ url: process.env.DATABASE_URL })
try {
  await migrate(db)
  const mode = await db.query("SELECT to_regclass('deployment_mode') AS table_name")
  if (!mode.rows[0].table_name) {
    throw new Error('Start the live API once to initialize its deployment mode before provisioning accounts.')
  }
  if ((await db.query('SELECT sandbox FROM deployment_mode WHERE id=1')).rows[0]?.sandbox !== false) {
    throw new Error('Cannot provision live accounts in a sandbox database.')
  }
  await db.query('INSERT INTO users VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [
    id(), fields.email, fields.name, 'live', fields.role, passwordHash(fields.password), false, Date.now(),
  ])
  console.log(`Created a ${fields.role} account. No password is printed or stored in plaintext.`)
} finally {
  await db.close()
}
