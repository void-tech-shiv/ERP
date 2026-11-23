import { NextResponse } from 'next/server';
import { fail, getERPState, setERPState, testingEnabled, termOptions, upstream } from '../../../../lib/server/erp';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET() {
  if(!testingEnabled) return fail('Private ERP testing is unavailable',503);
  const state=await getERPState();
  if(!state || state.phase!=='authenticated') return fail('Session expired',401);
  try {
    const result=await upstream('/index.php?r=studentattendance%2Fstudentdailyattendance%2Fsearchgetinput',state);
    if(result.status!==200) return fail('ERP academic-term page could not be loaded',502);
    const html=await result.text();
    if(html.length>2_000_000) return fail('ERP academic-term response too large',502);
    const terms=termOptions(html);
    if(!terms.years.length || !terms.semesters.length)
      return fail('No selectable academic years or semesters were returned',502);
    // A new Yii session cookie may be issued when navigating to this page.
    // Persist only the updated encrypted cookie jar; never cache raw HTML/CSRF.
    await setERPState(state);
    return NextResponse.json({
      years:terms.years.map(x=>x.label),
      semesters:terms.semesters.map(x=>x.label),
    },{headers:{'Cache-Control':'no-store'}});
  } catch {
    return fail('Could not read ERP academic terms from the authenticated page',502);
  }
}
