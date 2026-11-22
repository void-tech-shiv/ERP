import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

const NAME='attendly_demo_session';
const TTL=60*60*1000;

type DemoData={csrf:string;expires:number};

function key():string {
  const s=process.env.ERP_SESSION_SECRET||'';
  if(!/^[a-f0-9]{64}$/i.test(s))throw new Error('Demo session secret not configured');
  return s;
}
function sign(raw:string):string{
  return createHmac('sha256',key()).update('demo:'+raw).digest('base64url');
}
function cookie(raw:string):string {
  return raw+'.'+sign(raw);
}
function decode(input?:string):DemoData|null {
  if(!input)return null;
  const parts=input.split('.');
  if(parts.length!==2) return null;
  try{
    const expected=sign(parts[0]);
    if(parts[1].length!==expected.length || !timingSafeEqual(Buffer.from(parts[1]),Buffer.from(expected)))return null;
    const data=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8')) as DemoData;
    return typeof data.csrf==='string' && typeof data.expires==='number' && data.expires>Date.now()?data:null;
  }catch{return null}
}
export async function getDemo():Promise<DemoData|null> {
  return decode((await cookies()).get(NAME)?.value);
}
export async function beginDemo(){
  const data={csrf:randomBytes(24).toString('base64url'),expires:Date.now()+TTL};
  const token=Buffer.from(JSON.stringify(data)).toString('base64url');
  (await cookies()).set(NAME,cookie(token),{
    httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',
    path:'/api/demo',maxAge:3600,
  });
  return data;
}
export async function endDemo(){
  (await cookies()).delete(NAME);
}
export function demoCSRF(data:DemoData,header:string|null) {
  return !!header && data.csrf.length===header.length &&
    timingSafeEqual(Buffer.from(data.csrf),Buffer.from(header));
}
export function demoAttendance(){
  return {source:'demo',student:{id:'DEMO',name:'Demo Student'},courses:[
    {code:'25AI2101',name:'Machine Learning',components:[
      {type:'L',attended:34,conducted:40},{type:'T',attended:11,conducted:12},{type:'P',attended:16,conducted:18}]},
    {code:'25CS2202',name:'Database Management Systems',components:[
      {type:'L',attended:38,conducted:42},{type:'P',attended:14,conducted:18}]},
    {code:'25MA2103',name:'Probability & Statistics',components:[
      {type:'L',attended:29,conducted:38},{type:'T',attended:10,conducted:14}]},
    {code:'25AI2204',name:'Deep Learning Foundations',components:[
      {type:'L',attended:37,conducted:40},{type:'P',attended:17,conducted:20},{type:'S',attended:5,conducted:8}]},
    {code:'25UC2205',name:'Professional Communication',components:[
      {type:'L',attended:26,conducted:30},{type:'S',attended:10,conducted:12}]}
  ]};
}
