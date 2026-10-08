export type Role = 'buyer' | 'inspector' | 'admin'
export type User = { id:string; name:string; email:string; role:Role; sandbox:boolean; workspaceId:string }
export type Quote = { id:string; vin:string; items:string[]; total:number; expiresAt:number; pricingVersion:string; sandbox:boolean }
export type Order = { id:string; vin:string; status:'awaiting_confirmation'|'confirmed'|'assigned'|'in_review'|'published'|'cancelled'; total:number; items:string[]; created_at:number; updated_at:number; assigned_at:number|null; inspector_id:string|null; sandbox:boolean; workspace_id:string }
export type Evidence = { id:string; slot:string; original_hash:string; display_hash:string; created_at:number }
export type Report = { id:string; submitted_at:number; evidence_ids:string[]; data:{ inspectedAt:number; vin:string; mileage:number; obd:string; chassis:string; paint:string; conditionOutcome:string; inspectionOutcome:string } }
export type Detail = { order:Order; evidence:Evidence[]; reports:Report[]; reviews:{report_id:string;decision:string;note:string;created_at:number}[]; events:{action:string;detail:string;created_at:number}[] }
export type Finding = { id:string; kind:string; outcome:'clear'|'issue'|'inconclusive'; summary:string; limitations:string; source:string; observedAt:number; recordedAt:number; expiresAt:number; fresh:boolean; sandbox:boolean }
export type Passport = { vin:string; sandbox:boolean; asOf:number; current:Finding[]; history:Finding[]; registryChecks:{kind:string;outcome:string;source:string}[] }
export async function api<T>(path:string, method='GET', body?:unknown):Promise<T> {
  const form=body instanceof FormData
  const response=await fetch('/api'+path,{method,credentials:'same-origin',headers:{'x-sureauto-request':'1',...(!form&&body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined&&method!=='GET'&&method!=='HEAD'?{body:form?body:JSON.stringify(body)}:{})})
  let result
  try { result=await response.json() } catch { throw new Error('The verification service did not respond. Check the API connection and try again.') }
  if(!response.ok)throw new ApiError(result.error||'Request failed.',response.status)
  return result as T
}
export class ApiError extends Error { status:number; constructor(message:string,status:number){super(message);this.status=status} }
export const dateTime=(value:number)=>new Date(Number(value)).toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short'})
export const passportPath=(vin:string,workspace?:string)=>workspace&&workspace!=='live'?`/passport/sandbox/${workspace}/${vin}`:`/passport/${vin}`
export const passportApi=(vin:string,workspace?:string)=>workspace&&workspace!=='live'?`/sandbox/passports/${workspace}/${vin}`:`/passports/${vin}`
export const statusLabels:Record<Order['status'],string>={awaiting_confirmation:'Awaiting confirmation',confirmed:'Ready for dispatch',assigned:'Inspector assigned',in_review:'In QA review',published:'Passport published',cancelled:'Cancelled'}
