// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import Workflow from '../src/workflow/Workflow'

const fetchMock=vi.fn()
const response=(body:unknown,status=200)=>({ok:status<400,status,json:async()=>body})
beforeEach(()=>{history.replaceState(null,'','/verification');vi.stubGlobal('fetch',fetchMock);fetchMock.mockReset()})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
describe('verification workspace',()=>{
 it('creates an isolated sandbox and requests a server-calculated quote',async()=>{
   fetchMock.mockImplementation(async(url:string)=>{
     if(url==='/api/health')return response({sandbox:true})
     if(url==='/api/auth/session')return response({error:'Please sign in.'},401)
     if(url==='/api/sandbox/start')return response({user:{id:'buyer',name:'Pilot buyer',role:'buyer',sandbox:true,workspaceId:'sandbox'}})
     if(url==='/api/orders')return response({orders:[]})
     if(url==='/api/quotes')return response({id:'quote',vin:'1HGCM82633A123456',items:['condition','inspection'],total:18000,expiresAt:Date.now()+900000,pricingVersion:'lagos-field-pilot-v1'})
     return response({error:'Unexpected request'},500)
   })
   render(<Workflow/>)
   fireEvent.click(await screen.findByRole('button',{name:'Start sandbox workflow'}))
   await screen.findByRole('heading',{name:'Before you commit, check.'})
   fireEvent.change(screen.getByLabelText('Vehicle identification number'),{target:{value:'1HGCM82633A123456'}})
   fireEvent.click(screen.getByRole('button',{name:'Get inspection quote'}))
   await screen.findByRole('heading',{name:'₦18,000'})
   expect(fetchMock.mock.calls.find(([url])=>url==='/api/quotes')?.[1].body).toBe(JSON.stringify({vin:'1HGCM82633A123456'}))
   expect(screen.getByRole('button',{name:'Request inspection'})).toBeTruthy()
 })
 it('does not expose the sandbox role switcher for live users',async()=>{
   fetchMock.mockImplementation(async(url:string)=>response(url==='/api/health'?{sandbox:false}:url==='/api/auth/session'?{user:{id:'buyer',name:'Buyer',role:'buyer',sandbox:false,workspaceId:'live'}}:{orders:[]}))
   render(<Workflow/>);await screen.findByRole('heading',{name:'Before you commit, check.'})
   expect(screen.queryByText('SANDBOX ROLE SWITCHER')).toBeNull()
   expect(screen.queryByRole('button',{name:'Dispatch & QA'})).toBeNull()
 })
 it('shows service errors instead of fabricating successful results',async()=>{
   fetchMock.mockRejectedValue(new Error('Service offline'))
   render(<Workflow/>);await screen.findByRole('alert')
   expect(screen.getByRole('alert').textContent).toContain('Service offline')
 })
})
