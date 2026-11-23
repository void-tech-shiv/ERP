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
    if(response.status===403)return fail('ERP returned HTTP 403 for the timetable request [TT_HTTP_403]',502);
    if(response.status>=300&&response.status<400)
      return fail('ERP redirected the timetable request [TT_REDIRECT]',502);
    if(response.status!==200)
      return fail('ERP timetable returned an unexpected status [TT_HTTP_OTHER]',502);
    const timetable=parseTimetable(await response.text());
    await setERPState(state);
    return NextResponse.json({
      source:'erp',academicYear:terms.years.find(x=>x.value===year)!.label,
      semester:terms.semesters.find(x=>x.value===semester)!.label,...timetable,
    },{headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
  }catch(error){
    // Fixed diagnostic labels only. Never return HTML, student IDs, cookies,
    // CSRF values, redirect URLs or upstream exception details to the client.
    const reason=error instanceof Error?error.message:'';
    if(reason==='ERP denied timetable access')
      return fail('Official ERP showed a Forbidden page [TT_FORBIDDEN_HTML]',502);
    if(reason.startsWith('ERP timetable grid not found: TT_LOGIN_REQUIRED'))
      return fail('ERP returned its login page. Please sign in again [TT_LOGIN_REQUIRED]',401);
    if(reason.startsWith('ERP timetable grid not found: TT_FORBIDDEN_HTML'))
      return fail('University ERP denied timetable access [TT_FORBIDDEN_HTML]',502);
    if(reason.startsWith('ERP timetable grid not found: TT_SEARCH_FORM'))
      return fail('ERP returned the search form instead of a timetable [TT_SEARCH_FORM]',502);
    if(reason.startsWith('ERP timetable grid not found: TT_EMPTY_RESULT'))
      return fail('ERP returned no timetable entries for this session [TT_EMPTY_RESULT]',502);
    if(reason.startsWith('ERP timetable grid not found: TT_UNRECOGNIZED_TABLE'))
      return fail('ERP returned a table with an unrecognized layout [TT_UNRECOGNIZED_TABLE]',502);
    if(reason.startsWith('ERP timetable grid not found'))
      return fail('ERP did not return a recognizable timetable response [TT_UNEXPECTED_RESPONSE]',502);
    if(reason.startsWith('ERP timetable day row changed')||
       reason.startsWith('Unexpected ERP timetable cell size'))
      return fail('ERP timetable layout changed [TT_LAYOUT_CHANGED]',502);
    return fail('Could not retrieve timetable from the authenticated ERP session [TT_FETCH_ERROR]',502);
  }
}
