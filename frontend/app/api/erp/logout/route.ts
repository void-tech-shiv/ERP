import { NextResponse } from 'next/server';
import { clearERPState, fail, getERPState, testingEnabled, validOrigin, validateCSRF } from '../../../../lib/server/erp';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  if(!testingEnabled) return fail('Private ERP testing is unavailable',503);
  if(!(await validOrigin())) return fail('Origin rejected',403);
  const state=await getERPState();
  if(!state || state.phase!=='authenticated') return fail('Session expired',401);
  if(!validateCSRF(state.csrf,request.headers.get('x-attendly-csrf'))) return fail('Invalid CSRF token',403);
  await clearERPState();
  return NextResponse.json({active:false},{headers:{'Cache-Control':'no-store'}});
}
