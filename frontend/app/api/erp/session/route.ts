import { NextResponse } from 'next/server';
import { getERPState, testingEnabled, fail } from '../../../../lib/server/erp';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET() {
  if(!testingEnabled) return fail('Private ERP testing is unavailable',503);
  const state=await getERPState();
  if(!state || state.phase!=='authenticated') return NextResponse.json({active:false},{headers:{'Cache-Control':'no-store'}});
  return NextResponse.json({active:true,studentId:state.studentId,csrfToken:state.csrf},{headers:{'Cache-Control':'no-store'}});
}
