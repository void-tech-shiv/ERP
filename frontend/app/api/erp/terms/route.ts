import { NextResponse } from 'next/server';
import { fail, getERPState, testingEnabled, termOptions, upstream } from '../../../../lib/server/erp';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET() {
  if(!testingEnabled) return fail('Private ERP testing is unavailable',503);
  const state=await getERPState();
  if(!state || state.phase!=='authenticated') return fail('Session expired',401);
  try {
    const result=await upstream('/index.php?r=studentattendance%2Fstudentdailyattendance%2Fsearchgetinput',state);
    if(result.status!==200) return fail('Could not load ERP attendance form',502);
    const terms=termOptions(await result.text());
    return NextResponse.json({years:terms.years.map(x=>x.label),semesters:terms.semesters.map(x=>x.label)},
      {headers:{'Cache-Control':'no-store'}});
  } catch {
    return fail('Could not read ERP academic terms',502);
  }
}
