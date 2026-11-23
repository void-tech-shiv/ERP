import { NextRequest, NextResponse } from 'next/server';
import { fail, getERPState, setERPState, testingEnabled, upstream } from '../../../../lib/server/erp';
import {
  parseTimetable, parseTimetableTerms, TIMETABLE_FORM_PATH, TIMETABLE_RESULT_ROUTE,
} from '../../../../lib/server/erp_timetable';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:NextRequest){
  if(!testingEnabled)return fail('Private ERP testing is unavailable',503);
  const state=await getERPState();
  if(!state||state.phase!=='authenticated'||!state.studentId)
    return fail('ERP session expired',401);
  const year=request.nextUrl.searchParams.get('year')||'';
  const semester=request.nextUrl.searchParams.get('semester')||'';
  if(!/^\d{1,3}$/.test(year)||!/^\d{1,2}$/.test(semester))
    return fail('Select an academic year and semester',400);
  try{
    // First load the authenticated search form. Never trust year IDs supplied
    // by the client, or send arbitrary upstream URL/route parameters.
    const formResponse=await upstream(TIMETABLE_FORM_PATH,state);
    if(formResponse.status!==200)return fail('Could not load ERP timetable search form',502);
    const terms=parseTimetableTerms(await formResponse.text());
    if(!terms.years.some(x=>x.value===year)||!terms.semesters.some(x=>x.value===semester))
      return fail('Academic session is not available in ERP',400);
    const params=new URLSearchParams({
      r:TIMETABLE_RESULT_ROUTE,
      'UniversityMasterAcademicTimetableView[academicyear]':year,
      'UniversityMasterAcademicTimetableView[semesterid]':semester,
    });
    const response=await upstream('/index.php?'+params.toString(),state);
    if(response.status===403)return fail('ERP denied this timetable request',502);
    if(response.status!==200)return fail('ERP timetable is temporarily unavailable',502);
    const timetable=parseTimetable(await response.text());
    await setERPState(state);
    return NextResponse.json({
      source:'erp',academicYear:terms.years.find(x=>x.value===year)!.label,
      semester:terms.semesters.find(x=>x.value===semester)!.label,...timetable,
    },{headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
  }catch{
    return fail('ERP timetable could not be loaded. The university may be denying this request.',502);
  }
}
