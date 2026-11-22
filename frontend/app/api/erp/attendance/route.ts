import { NextResponse } from 'next/server';
import { fail, getERPState, parseAttendance, testingEnabled, termOptions, upstream, validOrigin, validateCSRF } from '../../../../lib/server/erp';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  if(!testingEnabled) return fail('Private ERP testing is unavailable',503);
  if(!(await validOrigin())) return fail('Origin rejected',403);
  const state=await getERPState();
  if(!state || state.phase!=='authenticated') return fail('Session expired',401);
  if(!validateCSRF(state.csrf,request.headers.get('x-attendly-csrf'))) return fail('Invalid CSRF token',403);
  try {
    if(Number(request.headers.get('content-length')||'0')>2048) return fail('Request too large',400);
    const body=await request.json();
    const academicYear=String(body?.academicYear||''),semester=String(body?.semester||'');
    const page=await upstream('/index.php?r=studentattendance%2Fstudentdailyattendance%2Fsearchgetinput',state);
    if(page.status!==200) return fail('ERP attendance form unavailable',502);
    const options=termOptions(await page.text());
    const y=options.years.find(item=>item.label===academicYear),s=options.semesters.find(item=>item.label===semester);
    if(!y || !s) return fail('Invalid academic year or semester',400);
    const data=new URLSearchParams({'_csrf':options.csrf,
      'DynamicModel[academicyear]':y.value,'DynamicModel[semesterid]':s.value});
    const response=await upstream('/index.php?r=studentattendance%2Fstudentdailyattendance%2Fcourselist',state,'POST',data);
    if(response.status!==200) return fail('ERP attendance unavailable',502);
    const html=await response.text();
    if(html.length>2_000_000) return fail('Unexpected ERP response size',502);
    const courses=parseAttendance(html);
    return NextResponse.json({source:'erp',student:{id:state.studentId},academicYear,semester,courses},
      {headers:{'Cache-Control':'no-store'}});
  } catch {
    return fail('Could not extract attendance from the ERP response',502);
  }
}
