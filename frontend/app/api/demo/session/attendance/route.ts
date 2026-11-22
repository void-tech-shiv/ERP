import { NextResponse } from 'next/server';
import { getDemo,demoAttendance } from '../../../../../lib/server/demo';
import { fail } from '../../../../../lib/server/erp';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
  if(!(await getDemo()))return fail('Demo session expired',401);
  return NextResponse.json(demoAttendance(),{headers:{'Cache-Control':'no-store'}});
}
