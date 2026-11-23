import { NextResponse } from 'next/server';
import { fail, getERPState, setERPState, testingEnabled, upstream } from '../../../../../lib/server/erp';
import { parseTimetableTerms, TIMETABLE_FORM_PATH } from '../../../../../lib/server/erp_timetable';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(){
  if(!testingEnabled)return fail('Private ERP testing is unavailable',503);
  const state=await getERPState();
  if(!state||state.phase!=='authenticated'||!state.studentId)
    return fail('ERP session expired',401);
  try{
    const response=await upstream(TIMETABLE_FORM_PATH,state);
    if(response.status!==200)return fail('Could not load ERP timetable search form',502);
    const options=parseTimetableTerms(await response.text());
    await setERPState(state);
    return NextResponse.json(options,{headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
  }catch{
    return fail('Could not load timetable year and semester options from ERP',502);
  }
}
