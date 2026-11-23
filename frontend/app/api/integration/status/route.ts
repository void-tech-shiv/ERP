import { NextResponse } from 'next/server';
export const runtime='nodejs';
export async function GET(){
  return NextResponse.json({
    enabled:false,
    privateAccess:process.env.ERP_PRIVATE_TEST_ENABLED==='1' && process.env.VERCEL_ENV!=='production',
  },{headers:{'Cache-Control':'no-store'}});
}
