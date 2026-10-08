import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { createApp } from '../server/app.mjs'
import { database } from '../server/db.mjs'

let app, buyer, admin, inspector, outsider, workspace, orderId, reportId
let clock = Date.parse('2026-10-08T12:00:00Z')
const vin='1HGCM82633A123456'
const headers={ 'x-sureauto-request':'1' }
const call=(method,url,body,cookie)=>app.inject({method,url,headers:{...headers,...(cookie?{cookie}:{})},payload:body})
const session=r=>r.cookies.find(c=>c.name==='sa_session').name+'='+r.cookies.find(c=>c.name==='sa_session').value
beforeAll(async()=>{
  app=await createApp({db:await database({url:process.env.TEST_DATABASE_URL,directory:'memory://'}),sandbox:true,now:()=>clock})
  const r=await call('POST','/api/sandbox/start',{})
  expect(r.statusCode).toBe(200)
  buyer=session(r);workspace=r.json().user.workspaceId
  const a=await call('POST','/api/sandbox/role',{role:'admin'},buyer);admin=session(a)
  const i=await call('POST','/api/sandbox/role',{role:'inspector'},admin);inspector=session(i)
  const b=await call('POST','/api/sandbox/role',{role:'buyer'},inspector);buyer=session(b)
  outsider=session(await call('POST','/api/sandbox/start',{}))
},30000)
afterAll(async()=>{await app.close()})
async function role(next,current){const r=await call('POST','/api/sandbox/role',{role:next},current);expect(r.statusCode).toBe(200);return session(r)}
async function upload(slot,cookie){
 const photo=await sharp({create:{width:12,height:12,channels:3,background:'#aaccee'}}).jpeg().toBuffer()
 const boundary='----sureauto-test'
 const payload=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),photo,Buffer.from(`\r\n--${boundary}--\r\n`)])
 return app.inject({method:'POST',url:`/api/orders/${orderId}/evidence?slot=${slot}`,headers:{...headers,cookie,'content-type':`multipart/form-data; boundary=${boundary}`},payload})
}
describe('persistent verification workflow API',()=>{
 it('rejects unauthenticated, cross-origin and invalid requests',async()=>{
   expect((await call('POST','/api/quotes',{vin})).statusCode).toBe(401)
   expect((await app.inject({method:'POST',url:'/api/sandbox/start',payload:{}})).statusCode).toBe(403)
   expect((await app.inject({method:'POST',url:'/api/sandbox/start',headers:{...headers,origin:'https://evil.example'},payload:{}})).statusCode).toBe(403)
   expect((await call('POST','/api/quotes',{vin:'INVALID'},buyer)).statusCode).toBe(400)
 })
 it('quotes field work honestly, creates an idempotent order, rejects duplicate dispatch',async()=>{
   const q=await call('POST','/api/quotes',{vin},buyer)
   expect(q.statusCode).toBe(200);expect(q.json().total).toBe(18000)
   const order=await call('POST','/api/orders',{quoteId:q.json().id},buyer)
   expect(order.statusCode).toBe(200);orderId=order.json().id
   const repeat=await call('POST','/api/orders',{quoteId:q.json().id},buyer)
   expect(repeat.json().id).toBe(orderId)
   const q2=await call('POST','/api/quotes',{vin},buyer)
   expect((await call('POST','/api/orders',{quoteId:q2.json().id},buyer)).statusCode).toBe(409)
 })
 it('protects orders across workspace boundaries and prevents buyer assignment',async()=>{
   expect((await call('GET',`/api/orders/${orderId}`,undefined,outsider)).statusCode).toBe(404)
   expect((await call('POST',`/api/orders/${orderId}/assign`,{inspectorId:workspace},buyer)).statusCode).toBe(403)
   expect((await call('POST',`/api/orders/${orderId}/confirm`,{},buyer)).statusCode).toBe(200)
 })
 it('assigns only confirmed orders to an inspector in the workspace',async()=>{
   admin=await role('admin',buyer)
   const people=(await call('GET','/api/inspectors',undefined,admin)).json().inspectors
   expect((await call('POST',`/api/orders/${orderId}/assign`,{inspectorId:people[0].id},admin)).statusCode).toBe(200)
   expect((await call('POST',`/api/orders/${orderId}/assign`,{inspectorId:people[0].id},admin)).statusCode).toBe(409)
   inspector=await role('inspector',admin)
 })
 it('blocks expired assignments and allows an administrator to renew them',async()=>{
   await app.db.query('UPDATE orders SET assigned_at=$2 WHERE id=$1',[orderId,clock-8*86400000])
   expect((await upload('dashboard',inspector)).statusCode).toBe(409)
   expect((await call('POST',`/api/orders/${orderId}/renew`,{note:'Need more time'},inspector)).statusCode).toBe(403)
   admin=await role('admin',inspector)
   expect((await call('POST',`/api/orders/${orderId}/renew`,{note:'Inspection rescheduled within pilot'},admin)).statusCode).toBe(200)
   inspector=await role('inspector',admin)
 })
 it('stores hashed evidence privately; requires VIN match and two evidence slots',async()=>{
   const a=await upload('dashboard',inspector);const b=await upload('pillar',inspector)
   expect(a.statusCode).toBe(200);expect(b.statusCode).toBe(200)
   expect(a.json().originalHash).toHaveLength(64)
   expect((await call('GET',`/api/evidence/${a.json().id}`)).statusCode).toBe(401)
   expect((await call('GET',`/api/evidence/${a.json().id}`,undefined,outsider)).statusCode).toBe(403)
   const fields={vin,inspectedAt:clock,mileage:45000,obd:'P0420 pending; no safety scan available',chassis:'No visible weld repairs in accessible areas',paint:'Hood 220 microns; doors 140 microns',conditionOutcome:'clear',inspectionOutcome:'issue',evidenceIds:[a.json().id,b.json().id]}
   expect((await call('POST',`/api/orders/${orderId}/report`,{...fields,vin:'2T2BZMCA0JC123456'},inspector)).statusCode).toBe(400)
   const r=await call('POST',`/api/orders/${orderId}/report`,fields,inspector)
   expect(r.statusCode).toBe(200);reportId=r.json().id
   expect((await call('POST',`/api/orders/${orderId}/report`,fields,inspector)).statusCode).toBe(409)
 })
 it('does not publish unreviewed findings; inspectors cannot approve',async()=>{
   const p=await call('GET',`/api/sandbox/passports/${workspace}/${vin}`)
   expect(p.json().current).toHaveLength(0)
   expect((await call('POST',`/api/orders/${orderId}/review`,{decision:'return',reportId,note:'Needs review'},inspector)).statusCode).toBe(403)
 })
 it('publishes after independent QA, preserves adverse outcome, excludes private details',async()=>{
   admin=await role('admin',inspector)
   const data={decision:'publish',reportId,note:'Evidence checked',conditionSummary:'Accessible chassis surfaces showed no visible weld repairs.',inspectionSummary:'P0420 pending; further diagnosis required.',limitations:'Visual and scan observations only. No registry checks or safety guarantee.',redactionConfirmed:true}
   const r=await call('POST',`/api/orders/${orderId}/review`,data,admin)
   expect(r.statusCode).toBe(200)
   expect((await call('POST',`/api/orders/${orderId}/review`,data,admin)).statusCode).toBe(409)
   const p=(await call('GET',`/api/sandbox/passports/${workspace}/${vin}`)).json()
   expect(p.current).toHaveLength(2);expect(p.sandbox).toBe(true)
   expect(p.current.find(f=>f.kind==='inspection').outcome).toBe('issue')
   expect(p.current.every(f=>f.fresh)).toBe(true)
   expect(p.registryChecks.every(f=>f.outcome==='unavailable')).toBe(true)
   expect(JSON.stringify(p)).not.toContain('inspector_id')
   expect(JSON.stringify(p)).not.toContain('evidenceIds')
   expect((await call('GET',`/api/passports/${vin}?workspace=${workspace}`)).statusCode).toBe(404)
 })
 it('charges zero for existing fresh findings, even when adverse',async()=>{
   buyer=await role('buyer',admin)
   const q=(await call('POST','/api/quotes',{vin},buyer)).json()
   expect(q.total).toBe(0);expect(q.items).toHaveLength(0)
   expect((await call('POST','/api/orders',{quoteId:q.id},buyer)).statusCode).toBe(409)
 })
 it('returns QA submissions without publication and permits a corrected revision',async()=>{
   const value='2T2BZMCA0JC123456'
   const q=(await call('POST','/api/quotes',{vin:value},buyer)).json()
   const created=(await call('POST','/api/orders',{quoteId:q.id},buyer)).json()
   const originalOrderId=orderId
   orderId=created.id
   await call('POST',`/api/orders/${orderId}/confirm`,{},buyer)
   admin=await role('admin',buyer)
   const staff=(await call('GET','/api/inspectors',undefined,admin)).json().inspectors[0]
   await call('POST',`/api/orders/${orderId}/assign`,{inspectorId:staff.id},admin)
   inspector=await role('inspector',admin)
   const a=(await upload('dashboard',inspector)).json(),b=(await upload('pillar',inspector)).json()
   const body={vin:value,inspectedAt:clock,mileage:10000,obd:'Incomplete scan',chassis:'No lift available',paint:'Tool unavailable',conditionOutcome:'inconclusive',inspectionOutcome:'inconclusive',evidenceIds:[a.id,b.id]}
   const first=(await call('POST',`/api/orders/${orderId}/report`,body,inspector)).json()
   admin=await role('admin',inspector)
   expect((await call('POST',`/api/orders/${orderId}/review`,{decision:'return',reportId:first.id,note:'Clarify what could not be scanned.'},admin)).statusCode).toBe(200)
   expect((await call('GET',`/api/sandbox/passports/${workspace}/${value}`)).json().current).toHaveLength(0)
   inspector=await role('inspector',admin)
   const second=(await call('POST',`/api/orders/${orderId}/report`,{...body,obd:'ECU accessible; safety modules not scanned'},inspector)).json()
   admin=await role('admin',inspector)
   expect((await call('POST',`/api/orders/${orderId}/review`,{decision:'return',reportId:first.id,note:'Old revision'},admin)).statusCode).toBe(409)
   expect((await call('POST',`/api/orders/${orderId}/review`,{decision:'publish',reportId:second.id,note:'Limitations checked',conditionSummary:'Lift and paint equipment unavailable',inspectionSummary:'Safety modules not scanned',limitations:'Inconclusive observations; further inspection needed',redactionConfirmed:true},admin)).statusCode).toBe(200)
   const detail=(await call('GET',`/api/orders/${orderId}`,undefined,admin)).json()
   expect(detail.reports).toHaveLength(2);expect(detail.reviews).toHaveLength(2)
   expect((await call('GET',`/api/sandbox/passports/${workspace}/${value}`)).json().current.every(f=>f.outcome==='inconclusive')).toBe(true)
   buyer=await role('buyer',admin)
   expect((await call('POST','/api/quotes',{vin:value},buyer)).json().total).toBe(18000)
   orderId=originalOrderId
 })
 it('expires quotes and prevents changes after publication',async()=>{
   const q=(await call('POST','/api/quotes',{vin:'2T2BZMCA0JC123456'},buyer)).json()
   clock+=16*60000
   expect((await call('POST','/api/orders',{quoteId:q.id},buyer)).statusCode).toBe(409)
   expect((await call('POST',`/api/orders/${orderId}/cancel`,{},buyer)).statusCode).toBe(409)
   const detail=(await call('GET',`/api/orders/${orderId}`,undefined,buyer)).json()
   expect(detail.reports).toHaveLength(0);expect(detail.evidence).toHaveLength(0)
   expect(detail.events.map(e=>e.action)).toContain('qa_published')
 })
})
