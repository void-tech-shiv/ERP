import { NextResponse } from 'next/server';
import { fail, getERPState, setERPState, parseAttendance, testingEnabled, termOptions, upstream, validOrigin, validateCSRF } from '../../../../lib/server/erp';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(request:Request) {
  if(!testingEnabled) return fail('Private ERP testing is unavailable',503);
  if(!(await validOrigin())) return fail('Origin rejected',403);
  const state=await getERPState();
  if(!state || state.phase!=='authenticated') return fail('Session expired',401);
  if(!validateCSRF(state.csrf,request.headers.get('x-attendly-csrf')))
    return fail('Invalid CSRF token',403);
  try {
    if(Number(request.headers.get('content-length')||'0')>2048)
      return fail('Request too large',400);
    const body=await request.json();
    const academicYear=String(body?.academicYear||''), semester=String(body?.semester||'');
    if(academicYear.length>40 || semester.length>40)
      return fail('Invalid academic term',400);

    // Re-read the term form within this authenticated student's cookie jar.
    // Avoid hardcoding the university's internal term IDs or CSRF token.
    const page=await upstream('/index.php?r=studentattendance%2Fstudentdailyattendance%2Fsearchgetinput',state);
    if(page.status!==200) return fail('ERP attendance selection page unavailable',502);
    const source=await page.text();
    if(source.length>2_000_000) return fail('Unexpected ERP term response size',502);
    const options=termOptions(source);
    const y=options.years.find(item=>item.label===academicYear);
    const s=options.semesters.find(item=>item.label===semester);
    if(!y || !s) return fail('Choose an available academic year and semester',400);

    const data=new URLSearchParams({
      '_csrf':options.csrf,
      'DynamicModel[academicyear]':y.value,
      'DynamicModel[semesterid]':s.value,
    });
    const response=await upstream(
      '/index.php?r=studentattendance%2Fstudentdailyattendance%2Fcourselist',
      state,'POST',data
    );
    if(response.status!==200) return fail('ERP attendance request was rejected',502);
    const html=await response.text();
    if(html.length>2_000_000) return fail('Unexpected ERP attendance response size',502);
    const courses=parseAttendance(html);
    // Session cookies can rotate on the term form or course-list request.
    await setERPState(state);
    return NextResponse.json({
      source:'erp',student:{id:state.studentId},academicYear,semester,courses,
    },{headers:{'Cache-Control':'no-store'}});
  } catch {
    return fail('Could not extract attendance from the ERP response',502);
  }
}
