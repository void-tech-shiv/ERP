import { NextResponse } from 'next/server';
import { fail, getERPState, setERPState, testingEnabled, upstream } from '../../../../lib/server/erp';
import { parseSeatingPage, SEATING_PATH, type SeatRecord } from '../../../../lib/server/erp_seating';

export const runtime='nodejs';
export const dynamic='force-dynamic';

/** Only requests the university's fixed exam seating page for the signed-in student.
 * No arbitrary URLs, credentials, raw HTML, or student IDs are returned.
 */
export async function GET(){
  if(!testingEnabled)return fail('Private ERP testing is unavailable',503);
  const state=await getERPState();
  if(!state||state.phase!=='authenticated'||!state.studentId)
    return fail('ERP session expired',401);
  try{
    const records:SeatRecord[]=[];
    const refs=new Set<string>();
    let expectedTotal:number|null=null;
    let page=1;
    while(page<=20){
      const path=SEATING_PATH+(page>1?'&page='+page:'');
      const response=await upstream(path,state);
      if(response.status!==200)return fail('ERP exam seating page is unavailable',502);
      const html=await response.text();
      const result=parseSeatingPage(html,state.studentId,page);
      if(expectedTotal===null)expectedTotal=result.total;
      if(result.total!==expectedTotal)
        return fail('ERP exam seating changed while loading. Retry to refresh.',502);
      for(const seat of result.records){
        if(refs.has(seat.refId))return fail('Duplicate ERP exam seating record received',502);
        refs.add(seat.refId);
        records.push(seat);
      }
      if(result.nextPage===null)break;
      page=result.nextPage;
    }
    if(expectedTotal===null||records.length!==expectedTotal)
      return fail('The ERP exam seating results were incomplete',502);
    await setERPState(state);
    return NextResponse.json({source:'erp',records,count:records.length},
      {headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
  }catch{
    return fail('Could not read exam seating from the authenticated ERP page',502);
  }
}
