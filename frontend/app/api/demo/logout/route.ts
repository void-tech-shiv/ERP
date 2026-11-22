import { NextResponse } from 'next/server';
import { demoCSRF,endDemo,getDemo } from '../../../../lib/server/demo';
import { fail,validOrigin } from '../../../../lib/server/erp';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
  if(!(await validOrigin()))return fail('Origin rejected',403);
  const session=await getDemo();
  if(!session)return fail('Demo session expired',401);
  if(!demoCSRF(session,request.headers.get('x-attendly-csrf')))return fail('Invalid CSRF',403);
  await endDemo();
  return NextResponse.json({active:false,mode:'demo'},{headers:{'Cache-Control':'no-store'}});
}
