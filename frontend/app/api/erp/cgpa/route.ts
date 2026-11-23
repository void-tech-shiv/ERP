import { NextResponse } from 'next/server';
import { fail, getERPState, setERPState, testingEnabled, upstream } from '../../../../lib/server/erp';
import { parseCGPA } from '../../../../lib/server/erp_cgpa';

export const runtime='nodejs';
export const dynamic='force-dynamic';

/** Read-only, authenticated university CGPA retrieval. */
export async function GET() {
  if(!testingEnabled) return fail('Private ERP testing is unavailable',503);
  const session=await getERPState();
  if(!session || session.phase!=='authenticated' || !session.studentId)
    return fail('ERP session expired',401);
  try {
    const response=await upstream(
      '/index.php?r=studentinfo%2Fstudentendexamresult%2Fsearchgetmycgpa',
      session
    );
    if(response.status!==200) return fail('ERP CGPA page was unavailable',502);
    const html=await response.text();
    // No raw HTML, personal names, IDs, tokens or cookies leave the server.
    const report=parseCGPA(html,session.studentId);
    await setERPState(session);
    return NextResponse.json({source:'erp',...report},
      {headers:{'Cache-Control':'no-store'}});
  } catch {
    return fail('Could not read your CGPA from the authenticated ERP page',502);
  }
}
