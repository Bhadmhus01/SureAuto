import { describe, it, expect } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { database } from '../server/db.mjs'
import { createApp } from '../server/app.mjs'
import { DAY, price } from '../server/service.mjs'

const headers={'x-sureauto-request':'1'}
const cookie=r=>'sa_session='+r.cookies.find(c=>c.name==='sa_session').value

describe('storage and deployment safety',()=>{
 it('persists orders and cookie sessions across a server restart; rejects environment mixing',async()=>{
   const folder=await mkdtemp(join(tmpdir(),'sureauto-db-'))
   let app
   try{
     app=await createApp({db:await database({directory:folder}),sandbox:true})
     const s=await app.inject({method:'POST',url:'/api/sandbox/start',headers,payload:{}})
     const h={...headers,cookie:cookie(s)}
     const q=await app.inject({method:'POST',url:'/api/quotes',headers:h,payload:{vin:'1HGCM82633A123456'}})
     const o=await app.inject({method:'POST',url:'/api/orders',headers:h,payload:{quoteId:q.json().id}})
     const orderId=o.json().id
     expect(o.statusCode).toBe(200)
     await app.close();app=null
     app=await createApp({db:await database({directory:folder}),sandbox:true})
     const read=await app.inject({method:'GET',url:'/api/orders/'+orderId,headers:h})
     expect(read.statusCode).toBe(200);expect(read.json().order.id).toBe(orderId)
     await app.close();app=null
     await expect(createApp({db:await database({directory:folder}),sandbox:false})).rejects.toThrow('Database mode mismatch')
   }finally{if(app)await app.close();await rm(folder,{recursive:true,force:true})}
 },30000)
 it('live registration always produces a buyer and has no sandbox role escalation',async()=>{
   const app=await createApp({db:await database({directory:'memory://'}),sandbox:false})
   try{
     const info={name:'Test Buyer',email:'buyer@example.test',password:'long-test-passphrase-only'}
     expect((await app.inject({method:'POST',url:'/api/auth/register',headers,payload:{...info,role:'admin'}})).statusCode).toBe(400)
     const r=await app.inject({method:'POST',url:'/api/auth/register',headers,payload:info})
     expect(r.statusCode).toBe(200);expect(r.json().user.role).toBe('buyer')
     const h={...headers,cookie:cookie(r)}
     expect((await app.inject({method:'POST',url:'/api/sandbox/start',headers,payload:{}})).statusCode).toBe(404)
     expect((await app.inject({method:'POST',url:'/api/sandbox/role',headers:h,payload:{role:'admin'}})).statusCode).toBe(403)
     expect((await app.inject({method:'POST',url:'/api/orders/irrelevant/confirm',headers:h,payload:{}})).statusCode).toBe(503)
     const stored=(await app.db.query('SELECT password_hash FROM users WHERE email=$1',[info.email])).rows[0]
     expect(stored.password_hash).not.toContain(info.password)
     const login=await app.inject({method:'POST',url:'/api/auth/login',headers,payload:{email:info.email,password:info.password}})
     expect(login.statusCode).toBe(200)
     expect(login.cookies[0].httpOnly).toBe(true)
     await app.inject({method:'POST',url:'/api/auth/logout',headers:h,payload:{}})
     expect((await app.inject({method:'GET',url:'/api/auth/session',headers:h})).statusCode).toBe(401)
   }finally{await app.close()}
 },30000)
 it('charges again for inconclusive or expired observations, not fresh adverse results',()=>{
   const now=Date.now()
   const fresh=[{kind:'condition',expires_at:now+DAY,outcome:'clear'},{kind:'inspection',expires_at:now+DAY,outcome:'issue'}]
   expect(price(fresh,now).total).toBe(0)
   expect(price([{...fresh[0],outcome:'inconclusive'},fresh[1]],now)).toMatchObject({items:['condition'],total:18000})
   expect(price([{...fresh[0],expires_at:now},fresh[1]],now)).toMatchObject({items:['condition'],total:18000})
 })
})
