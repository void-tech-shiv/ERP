import { NextResponse } from 'next/server';
import { beginDemo,getDemo } from '../../../../lib/server/demo';
import { fail,validOrigin } from '../../../../lib/server/erp';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
  const d=await getDemo();
  return NextResponse.json(d?{active:true,mode:'demo',student:{id:'DEMO',name:'Demo Student'},csrfToken:d.csrf}:{active:false,mode:'demo'},
    {headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request){
  if(!(await validOrigin()))return fail('Origin rejected',403);
  if(request.headers.get('x-attendly-demo')!=='start')return fail('Explicit demo opt-in required',403);
  if(Number(request.headers.get('content-length')||'0')>0)return fail('Unexpected request body',400);
  try{
    const d=await beginDemo();
    return NextResponse.json({active:true,mode:'demo',student:{id:'DEMO',name:'Demo Student'},csrfToken:d.csrf},
      {headers:{'Cache-Control':'no-store'}});
  }catch{return fail('Demo session not configured',503)}
}
