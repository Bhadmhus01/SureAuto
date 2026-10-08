import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import sharp from 'sharp'
import { z, ZodError } from 'zod'
import { database, migrate } from './db.mjs'
import { DAY, id, token, hash, passwordHash, passwordMatches, fail, audit, visibleOrder, currentFindings, publicFinding, price, vinSchema, text, reportSchema, reviewSchema } from './service.mjs'

export async function createApp(options = {}) {
  const db = options.db ?? await database({ url: process.env.DATABASE_URL, directory: process.env.DATA_DIR || '.data/postgres' })
  await migrate(db)
  const sandbox = options.sandbox ?? process.env.SANDBOX_MODE === 'true'
  // A database belongs to exactly one environment. Never mix live and sandbox data.
  await db.query('CREATE TABLE IF NOT EXISTS deployment_mode (id INTEGER PRIMARY KEY CHECK(id=1), sandbox BOOLEAN NOT NULL)')
  await db.query('INSERT INTO deployment_mode VALUES (1,$1) ON CONFLICT (id) DO NOTHING', [sandbox])
  if ((await db.query('SELECT sandbox FROM deployment_mode WHERE id=1')).rows[0].sandbox !== sandbox) {
    await db.close(); throw new Error('Database mode mismatch. Use a separate database for sandbox and live deployments.')
  }
  const now = options.now ?? Date.now
  const secure = options.secure ?? process.env.COOKIE_SECURE === 'true'
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 })
  app.decorate('db', db)
  await app.register(cookie)
  await app.register(multipart, { limits: { files: 1, fileSize: 5 * 1024 * 1024, fields: 0, parts: 1 } })
  await app.register(rateLimit, { max: 180, timeWindow: '1 minute' })
  const embedded = process.env.COOKIE_EMBEDDED === 'true'
  if (embedded && !secure) throw new Error('Embedded cookies require HTTPS and COOKIE_SECURE=true.')
  const cookieOptions = { httpOnly: true, sameSite: embedded ? 'none' : 'strict', ...(embedded ? {partitioned:true} : {}), secure, path: '/', maxAge: 8 * 3600 }
  app.addHook('onRequest', async (req, reply) => {
    reply.header('X-Robots-Tag', 'noindex, nofollow').header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff')
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
      // Custom header + same-origin only: no CORS support is deliberately installed.
      if (req.headers['x-sureauto-request'] !== '1') fail(403, 'Same-origin request header required.')
      if (req.headers.origin) {
        let origin
        try { origin = new URL(req.headers.origin).host } catch { fail(403, 'Invalid origin.') }
        if (origin !== req.headers.host) fail(403, 'Cross-origin request rejected.')
      }
    }
  })
  const authenticate = async req => {
    const session = req.cookies.sa_session
    if (!session) fail(401, 'Please sign in.')
    const user = (await db.query(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id JOIN workspaces w ON w.id=u.workspace_id WHERE s.hash=$1 AND s.expires_at>$2 AND (w.expires_at IS NULL OR w.expires_at>$2)`, [hash(session), now()])).rows[0]
    if (!user || user.sandbox !== sandbox) fail(401, 'Session expired. Please sign in again.')
    req.user = user
  }
  const roles = (...allowed) => async req => { await authenticate(req); if (!allowed.includes(req.user.role)) fail(403, 'This action requires a different role.') }
  const userView = u => ({ id:u.id, name:u.name, email:u.email, role:u.role, sandbox:u.sandbox, workspaceId:u.workspace_id })
  const signIn = async (reply, user) => {
    const raw = token()
    await db.query('DELETE FROM sessions WHERE expires_at <= $1', [now()])
    await db.query('INSERT INTO sessions VALUES ($1,$2,$3)', [hash(raw), user.id, now() + 8 * 3600000])
    reply.setCookie('sa_session', raw, cookieOptions)
    return { user: userView(user) }
  }
  app.get('/api/health', async () => ({ ok: true, sandbox, storage: process.env.DATABASE_URL ? 'postgresql' : 'embedded-postgresql', payments: 'disabled', registries: 'unavailable' }))
  app.get('/api/auth/session', { preHandler: authenticate }, async req => ({ user: userView(req.user) }))
  app.post('/api/auth/register', { config: { rateLimit: { max: 5, timeWindow:'1 minute' } } }, async (req, reply) => {
    if (sandbox) fail(409, 'Use an isolated sandbox workspace in this environment; real registration is disabled.')
    const data = z.object({name:text(80), email:z.email().max(254).transform(v=>v.toLowerCase()), password:z.string().min(12).max(128)}).strict().parse(req.body)
    const userId=id()
    try { await db.query('INSERT INTO users VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [userId,data.email,data.name,'live','buyer',passwordHash(data.password),false,now()]) }
    catch(e) { if(e.code==='23505') fail(409,'Unable to register this email. Try signing in.'); throw e }
    return signIn(reply, (await db.query('SELECT * FROM users WHERE id=$1',[userId])).rows[0])
  })
  app.post('/api/auth/login', { config: { rateLimit: { max: 10, timeWindow:'1 minute' } } }, async (req,reply) => {
    const data = z.object({ email:z.email().max(254).transform(v=>v.toLowerCase()), password:z.string().max(128) }).strict().parse(req.body)
    const user=(await db.query('SELECT * FROM users WHERE email=$1 AND sandbox=FALSE',[data.email])).rows[0]
    if(!user || !passwordMatches(data.password,user.password_hash)) fail(401,'Email or password is incorrect.')
    if(sandbox) fail(403,'Real accounts cannot sign in to sandbox mode.')
    return signIn(reply,user)
  })
  app.post('/api/auth/logout', async (req,reply) => {
    if(req.cookies.sa_session) await db.query('DELETE FROM sessions WHERE hash=$1',[hash(req.cookies.sa_session)])
    reply.clearCookie('sa_session',{path:'/'}); return {ok:true}
  })
  app.post('/api/sandbox/start', { config: { rateLimit: { max: 5, timeWindow:'1 minute' } } }, async (req,reply) => {
    if(!sandbox) fail(404,'Not found.')
    const workspace=id()
    const user=await db.transaction(async tx=>{
      await tx.query('INSERT INTO workspaces VALUES ($1,TRUE,$2)',[workspace,now()+7*DAY])
      let buyer
      for(const role of ['buyer','inspector','admin']) {
        const row={id:id(),email:`${role}.${workspace}@sandbox.invalid`,name:role==='buyer'?'Pilot buyer':role==='inspector'?'Field inspector':'QA reviewer',workspace_id:workspace,role,sandbox:true}
        await tx.query('INSERT INTO users VALUES ($1,$2,$3,$4,$5,NULL,TRUE,$6)',[row.id,row.email,row.name,workspace,role,now()])
        if(role==='buyer')buyer=row
      }
      return buyer
    })
    return signIn(reply,user)
  })
  app.post('/api/sandbox/role', { preHandler:authenticate }, async (req,reply)=>{
    if(!sandbox || !req.user.sandbox) fail(403,'Role switching is sandbox-only.')
    const {role}=z.object({role:z.enum(['buyer','inspector','admin'])}).strict().parse(req.body)
    const user=(await db.query('SELECT * FROM users WHERE workspace_id=$1 AND role=$2',[req.user.workspace_id,role])).rows[0]
    await db.query('DELETE FROM sessions WHERE hash=$1',[hash(req.cookies.sa_session)])
    return signIn(reply,user)
  })
  const passport = async req=>{
    const vin=vinSchema.parse(req.params.vin)
    const workspace = req.params.workspace ? z.string().uuid().parse(req.params.workspace) : 'live'
    if ((workspace !== 'live') !== sandbox) fail(404, 'Passport scope is not available in this deployment.')
    const w=(await db.query('SELECT * FROM workspaces WHERE id=$1 AND (expires_at IS NULL OR expires_at>$2)',[workspace,now()])).rows[0]
    if(!w) fail(404,'This sandbox passport has expired or does not exist.')
    const history=(await db.query('SELECT * FROM findings WHERE vin=$1 AND workspace_id=$2 ORDER BY sequence DESC',[vin,workspace])).rows
    const current=history.filter((f,i)=>history.findIndex(x=>x.kind===f.kind)===i)
    return { vin, sandbox:w.sandbox, scope: w.sandbox ? 'sandbox' : 'live', verified: false, asOf:now(), current:current.map(f=>publicFinding(f,now())), history:history.map(f=>publicFinding(f,now())), registryChecks:['customs','theft','ownership','accident'].map(kind=>({kind,outcome:'unavailable',source:'No authorized provider connected'})) }
  }
  app.get('/api/passports/:vin',passport)
  app.get('/api/sandbox/passports/:workspace/:vin',passport)
  app.post('/api/quotes', {preHandler:roles('buyer')}, async req=>{
    const {vin}=z.object({vin:vinSchema}).strict().parse(req.body)
    const result=price(await currentFindings(db,vin,req.user.workspace_id),now())
    const quote={id:id(),vin,...result,expiresAt:now()+15*60000, sandbox:req.user.sandbox}
    await db.query('INSERT INTO quotes VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[quote.id,req.user.workspace_id,req.user.id,vin,JSON.stringify(result.items),result.total,result.pricingVersion,quote.expiresAt,now(),req.user.sandbox])
    return quote
  })
  app.post('/api/orders', {preHandler:roles('buyer')}, async req=>{
    const {quoteId}=z.object({quoteId:z.string().uuid()}).strict().parse(req.body)
    return db.transaction(async tx=>{
      const q=(await tx.query('SELECT * FROM quotes WHERE id=$1 AND buyer_id=$2 FOR UPDATE',[quoteId,req.user.id])).rows[0]
      if(!q)fail(404,'Quote not found.')
      const existing=(await tx.query('SELECT * FROM orders WHERE quote_id=$1',[q.id])).rows[0]
      if(existing)return existing
      if(Number(q.expires_at)<=now())fail(409,'Quote expired. Please request a new quote.')
      const current=price(await currentFindings(tx,q.vin,q.workspace_id),now())
      if(current.total!==q.total || JSON.stringify(current.items)!==JSON.stringify(q.items))fail(409,'Findings changed. Please request a new quote; fresh checks stay free.')
      if(!q.total)fail(409,'All supported checks are fresh. No order or payment is needed.')
      const active=(await tx.query("SELECT id FROM orders WHERE vin=$1 AND workspace_id=$2 AND status NOT IN ('published','cancelled')",[q.vin,q.workspace_id])).rows[0]
      if(active)fail(409,'An active inspection already exists for this VIN. No duplicate order was created.')
      const orderId=id()
      await tx.query(`INSERT INTO orders (id,workspace_id,quote_id,buyer_id,vin,status,total,items,created_at,updated_at,sandbox) VALUES ($1,$2,$3,$4,$5,'awaiting_confirmation',$6,$7,$8,$8,$9)`,[orderId,q.workspace_id,q.id,req.user.id,q.vin,q.total,JSON.stringify(q.items),now(),q.sandbox])
      await audit(tx,orderId,req.user.id,'order_created','Order requested; no payment collected.',now())
      return (await tx.query('SELECT * FROM orders WHERE id=$1',[orderId])).rows[0]
    })
  })
  app.get('/api/orders',{preHandler:authenticate},async req=>{
    const filter=req.user.role==='buyer'?' AND buyer_id=$2':req.user.role==='inspector'?' AND inspector_id=$2':''
    return {orders:(await db.query('SELECT * FROM orders WHERE workspace_id=$1'+filter+' ORDER BY created_at DESC LIMIT 100',filter?[req.user.workspace_id,req.user.id]:[req.user.workspace_id])).rows}
  })
  app.get('/api/orders/:id',{preHandler:authenticate},async req=>{
    const order=await visibleOrder(db,req.user,req.params.id)
    const reports=(await db.query('SELECT * FROM reports WHERE order_id=$1 ORDER BY revision DESC',[order.id])).rows
    const reviews=(await db.query('SELECT rv.* FROM reviews rv JOIN reports rp ON rp.id=rv.report_id WHERE rp.order_id=$1 ORDER BY rv.created_at DESC',[order.id])).rows
    const events=(await db.query('SELECT action,detail,created_at FROM audit_events WHERE order_id=$1 ORDER BY created_at,id',[order.id])).rows
    const evidence=req.user.role==='buyer'?[]:(await db.query('SELECT id,slot,original_hash,display_hash,created_at FROM evidence WHERE order_id=$1 ORDER BY created_at',[order.id])).rows
    return {order,reports:req.user.role==='buyer'?[]:reports,reviews:req.user.role==='buyer'?[]:reviews,events,evidence}
  })
  app.post('/api/orders/:id/confirm',{preHandler:roles('buyer')},async req=>{
    if(!sandbox||!req.user.sandbox)fail(503,'Payment confirmation is not integrated. No funds were taken.')
    return db.transaction(async tx=>{
      const order=await visibleOrder(tx,req.user,req.params.id,true)
      if(order.status==='confirmed')return {ok:true}
      if(order.status!=='awaiting_confirmation')fail(409,'Order cannot be confirmed in its current state.')
      await tx.query("UPDATE orders SET status='confirmed',updated_at=$2 WHERE id=$1",[order.id,now()])
      await audit(tx,order.id,req.user.id,'sandbox_confirmed','Simulated confirmation. No charge, bank transfer or registry lookup occurred.',now())
      return {ok:true}
    })
  })
  app.get('/api/inspectors',{preHandler:roles('admin')},async req=>({inspectors:(await db.query("SELECT id,name FROM users WHERE workspace_id=$1 AND role='inspector'",[req.user.workspace_id])).rows}))
  app.post('/api/orders/:id/assign',{preHandler:roles('admin')},async req=>{
    const {inspectorId}=z.object({inspectorId:z.string().uuid()}).strict().parse(req.body)
    return db.transaction(async tx=>{
      const order=await visibleOrder(tx,req.user,req.params.id,true)
      if(order.status!=='confirmed')fail(409,'Only confirmed orders can be assigned.')
      const inspector=(await tx.query("SELECT id FROM users WHERE id=$1 AND workspace_id=$2 AND role='inspector'",[inspectorId,req.user.workspace_id])).rows[0]
      if(!inspector)fail(400,'Choose an inspector from this workspace.')
      await tx.query("UPDATE orders SET status='assigned',inspector_id=$2,assigned_at=$3,updated_at=$3 WHERE id=$1",[order.id,inspector.id,now()])
      await audit(tx,order.id,req.user.id,'inspector_assigned','Inspector assigned. Assignment expires in seven days.',now())
      return {ok:true}
    })
  })
  app.post('/api/orders/:id/renew',{preHandler:roles('admin')},async req=>{
    const {note}=z.object({note:text(500)}).strict().parse(req.body)
    return db.transaction(async tx=>{
      const order=await visibleOrder(tx,req.user,req.params.id,true)
      if(order.status!=='assigned')fail(409,'Only assigned inspections can be renewed.')
      await tx.query('UPDATE orders SET assigned_at=$2,updated_at=$2 WHERE id=$1',[order.id,now()])
      await audit(tx,order.id,req.user.id,'assignment_renewed','Assignment renewed by QA; reason recorded in operational event: '+note,now())
      return {ok:true}
    })
  })
  app.post('/api/orders/:id/cancel',{preHandler:roles('buyer','admin')},async req=>db.transaction(async tx=>{
    const order=await visibleOrder(tx,req.user,req.params.id,true)
    if(!['awaiting_confirmation','confirmed'].includes(order.status))fail(409,'Only unassigned orders can be cancelled.')
    await tx.query("UPDATE orders SET status='cancelled',updated_at=$2 WHERE id=$1",[order.id,now()])
    await audit(tx,order.id,req.user.id,'order_cancelled','Cancelled before assignment. No refund processed; payments are disabled.',now())
    return {ok:true}
  }))
  app.post('/api/orders/:id/evidence',{preHandler:roles('inspector')},async req=>{
    const slot=z.enum(['dashboard','pillar','exterior','chassis']).parse(req.query.slot)
    const file=await req.file()
    if(!file)fail(400,'Select a JPEG, PNG or WebP photo.')
    const original=await file.toBuffer()
    if(file.file.truncated)fail(413,'Photo exceeds 5 MB.')
    let display
    try {
      const processor=sharp(original,{limitInputPixels:20000000})
      const metadata=await processor.metadata()
      if(!['jpeg','png','webp'].includes(metadata.format))fail(400,'Only JPEG, PNG and WebP photos are supported.')
      display=await processor.rotate().resize({width:1400,height:1400,fit:'inside',withoutEnlargement:true}).jpeg({quality:78}).toBuffer()
    } catch { fail(400,'Invalid or oversized image. Use a JPEG, PNG or WebP under 5 MB and 20 megapixels.') }
    return db.transaction(async tx=>{
      const order=await visibleOrder(tx,req.user,req.params.id,true)
      if(order.status!=='assigned'||Number(order.assigned_at)+7*DAY<=now())fail(409,'An active, unexpired assignment is required.')
      const count=(await tx.query('SELECT COUNT(*) AS count FROM evidence WHERE order_id=$1',[order.id])).rows[0].count
      if(Number(count)>=20)fail(409,'Evidence limit reached. Contact QA for assistance.')
      const evidenceId=id()
      await tx.query('INSERT INTO evidence VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[evidenceId,order.id,req.user.id,slot,hash(original),hash(display),display,now()])
      await audit(tx,order.id,req.user.id,'evidence_received',`${slot} photo received; hash recorded and display metadata stripped.`,now())
      return {id:evidenceId,slot,originalHash:hash(original),displayHash:hash(display)}
    })
  })
  app.get('/api/evidence/:id',{preHandler:roles('admin','inspector')},async(req,reply)=>{
    const evidence=(await db.query('SELECT * FROM evidence WHERE id=$1',[req.params.id])).rows[0]
    if(!evidence)fail(404,'Evidence not found.')
    await visibleOrder(db,req.user,evidence.order_id)
    return reply.header('Content-Type','image/jpeg').header('Content-Disposition','inline; filename="evidence.jpg"').send(Buffer.from(evidence.bytes))
  })
  app.post('/api/orders/:id/report',{preHandler:roles('inspector')},async req=>{
    const data=reportSchema.parse(req.body)
    return db.transaction(async tx=>{
      const order=await visibleOrder(tx,req.user,req.params.id,true)
      if(order.status!=='assigned'||Number(order.assigned_at)+7*DAY<=now())fail(409,'An active, unexpired assignment is required.')
      if(data.inspectedAt<Number(order.assigned_at)||data.inspectedAt>now())fail(400,'Inspection time must be within this assignment and not in the future.')
      if(data.vin!==order.vin)fail(400,'Observed VIN must match the assignment. Escalate a mismatch rather than submitting.')
      const photos=(await tx.query('SELECT id,slot FROM evidence WHERE order_id=$1 AND id=ANY($2::text[])',[order.id,data.evidenceIds])).rows
      if(photos.length!==data.evidenceIds.length||!['dashboard','pillar'].every(slot=>photos.some(p=>p.slot===slot)))fail(400,'Attach dashboard and B-pillar evidence belonging to this assignment.')
      const reportId=id()
      const {evidenceIds,...fields}=data
      await tx.query('INSERT INTO reports (id,order_id,inspector_id,data,evidence_ids,submitted_at) VALUES ($1,$2,$3,$4,$5,$6)',[reportId,order.id,req.user.id,JSON.stringify(fields),JSON.stringify(evidenceIds),now()])
      await tx.query("UPDATE orders SET status='in_review',updated_at=$2 WHERE id=$1",[order.id,now()])
      await audit(tx,order.id,req.user.id,'report_submitted','Inspection submitted for independent QA. No finding published.',now())
      return {id:reportId}
    })
  })
  app.post('/api/orders/:id/review',{preHandler:roles('admin')},async req=>{
    const data=reviewSchema.parse(req.body)
    return db.transaction(async tx=>{
      const order=await visibleOrder(tx,req.user,req.params.id,true)
      if(order.status!=='in_review')fail(409,'This order is not awaiting QA.')
      const report=(await tx.query('SELECT * FROM reports WHERE id=$1 AND order_id=$2',[data.reportId,order.id])).rows[0]
      if(!report)fail(404,'Report not found.')
      const latest=(await tx.query('SELECT id FROM reports WHERE order_id=$1 ORDER BY revision DESC LIMIT 1',[order.id])).rows[0]
      if(latest.id!==report.id)fail(409,'This report was superseded. Refresh before reviewing.')
      if(data.decision==='publish' && Number(report.data.inspectedAt)+90*DAY<=now())fail(409,'Inspection observations have expired. Return the report for a new inspection.')
      if(report.inspector_id===req.user.id)fail(403,'Inspectors cannot approve their own reports.')
      await tx.query('INSERT INTO reviews VALUES ($1,$2,$3,$4,$5,$6)',[id(),report.id,req.user.id,data.decision,data.note,now()])
      if(data.decision==='publish') {
        for(const kind of order.items) {
          const outcome=report.data[kind+'Outcome']
          await tx.query('INSERT INTO findings (id,workspace_id,vin,kind,outcome,summary,limitations,source,observed_at,recorded_at,expires_at,report_id,sandbox) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[id(),order.workspace_id,order.vin,kind,outcome,data[kind+'Summary'],data.limitations,order.sandbox?'Sandbox field inspection · QA reviewed':'SureAuto field inspection · QA reviewed',Number(report.data.inspectedAt),now(),Number(report.data.inspectedAt)+90*DAY,report.id,order.sandbox])
        }
        await tx.query("UPDATE orders SET status='published',updated_at=$2 WHERE id=$1",[order.id,now()])
      } else {
        await tx.query("UPDATE orders SET status='assigned',assigned_at=$2,updated_at=$2 WHERE id=$1",[order.id,now()])
      }
      await audit(tx,order.id,req.user.id,data.decision==='publish'?'qa_published':'qa_returned',data.decision==='publish'?'Approved findings published; private evidence excluded.':'QA requested a revised inspection submission.',now())
      return {ok:true}
    })
  })
  app.setErrorHandler((error,req,reply)=>{
    if(error instanceof ZodError)return reply.code(400).send({error:error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')})
    if(error.code==='23505')return reply.code(409).send({error:'A conflicting request already exists. Refresh to see the current state.'})
    const status=error.statusCode>=400&&error.statusCode<600?error.statusCode:500
    if(status===500) app.log.error(error)
    reply.code(status).send({error:status===500?'Unexpected server error. Please try again.':error.message})
  })
  app.addHook('onClose',async()=>db.close())
  return app
}
