import { randomBytes, randomUUID, createHash, scryptSync, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

export const DAY = 86400000
export const id = () => randomUUID()
export const hash = value => createHash('sha256').update(value).digest('hex')
export const token = () => randomBytes(32).toString('hex')
export const vinSchema = z.string().trim().toUpperCase().regex(/^[A-HJ-NPR-Z0-9]{17}$/, 'Use a 17-character VIN without I, O or Q.')
export const text = (max = 2000) => z.string().trim().min(3).max(max)
export const reportSchema = z.object({
  vin: vinSchema, inspectedAt: z.number().int().positive(),
  mileage: z.number().int().min(0).max(3000000),
  obd: text(), chassis: text(), paint: text(),
  conditionOutcome: z.enum(['clear', 'issue', 'inconclusive']),
  inspectionOutcome: z.enum(['clear', 'issue', 'inconclusive']),
  evidenceIds: z.array(z.string().uuid()).min(2).max(6).refine(v => new Set(v).size === v.length, 'Duplicate evidence IDs'),
}).strict()
export const reviewSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('return'), reportId: z.string().uuid(), note: text() }).strict(),
  z.object({ decision: z.literal('publish'), reportId: z.string().uuid(), note: text(), conditionSummary: text(1000), inspectionSummary: text(1000), limitations: text(1000), redactionConfirmed: z.literal(true) }).strict(),
])
export const passwordHash = password => {
  const salt = randomBytes(16).toString('hex')
  return salt + ':' + scryptSync(password, salt, 64).toString('hex')
}
export function passwordMatches(password, stored) {
  if (!stored) return false
  const [salt, expected] = stored.split(':')
  const actual = scryptSync(password, salt, 64)
  const expectedBytes = Buffer.from(expected, 'hex')
  return expectedBytes.length === actual.length && timingSafeEqual(expectedBytes, actual)
}
export function fail(status, message) { const error = new Error(message); error.statusCode = status; throw error }
export async function audit(tx, order, actor, action, detail, now) {
  await tx.query('INSERT INTO audit_events VALUES ($1,$2,$3,$4,$5,$6)', [id(), order, actor, action, detail, now])
}
export async function visibleOrder(tx, user, orderId, lock = false) {
  const row = (await tx.query('SELECT * FROM orders WHERE id=$1 AND workspace_id=$2' + (lock ? ' FOR UPDATE' : ''), [orderId, user.workspace_id])).rows[0]
  if (!row || (user.role === 'buyer' && row.buyer_id !== user.id) || (user.role === 'inspector' && row.inspector_id !== user.id)) fail(404, 'Order not found.')
  return row
}
export async function currentFindings(tx, vin, workspace) {
  return (await tx.query('SELECT DISTINCT ON (kind) * FROM findings WHERE vin=$1 AND workspace_id=$2 ORDER BY kind, sequence DESC', [vin, workspace])).rows
}
export function price(findings, now) {
  const missing = ['condition', 'inspection'].filter(kind => !findings.some(f => f.kind === kind && Number(f.expires_at) > now && f.outcome !== 'inconclusive'))
  // Both kinds require one field visit; a single refresh is not a remote ₦2,500 check.
  return { items: missing, total: missing.length ? 18000 : 0, pricingVersion: 'lagos-field-pilot-v1' }
}
export function publicFinding(f, now) {
  return { id: f.id, kind: f.kind, outcome: f.outcome, summary: f.summary, limitations: f.limitations, source: f.source, observedAt: Number(f.observed_at), recordedAt: Number(f.recorded_at), expiresAt: Number(f.expires_at), fresh: Number(f.expires_at) > now, sandbox: f.sandbox }
}
