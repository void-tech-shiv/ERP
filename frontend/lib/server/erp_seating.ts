import { load } from 'cheerio';

export const SEATING_ROUTE='examsection/exam-invigilator-student-room-allotment-info/stud_my_seating_plan';
export const SEATING_PATH='/index.php?r=examsection%2Fexam-invigilator-student-room-allotment-info%2Fstud_my_seating_plan';

export type SeatRecord={
  refId:string;
  examDate:string;
  examType:string;
  examSlot:string;
  courseCode:string;
  roomNo:string;
};
export type SeatingPage={
  records:SeatRecord[];
  first:number;
  last:number;
  total:number;
  nextPage:number|null;
};

const norm=(x:string)=>x.replace(/\s+/g,' ').trim();
const EXPECTED=['ref.id','exam date','exam type','exam slot','student university id','course code','room no'];
const LIMIT=300;
function pageFromLink(href:string):number|null {
  try {
    const url=new URL(href,'https://newerp.kluniversity.in');
    if(url.origin!=='https://newerp.kluniversity.in'||url.pathname!=='/index.php'||
       url.searchParams.get('r')!==SEATING_ROUTE)return null;
    const number=url.searchParams.get('page')||'';
    if(!/^\d{1,3}$/.test(number))return null;
    const value=Number(number);
    return value>=1&&value<=20?value:null;
  } catch {return null;}
}

/** Extract only exam seating details, checking each row's student identity.
 * Fails closed for an expired login page, a different account, or changed headers.
 */
export function parseSeatingPage(html:string,studentId:string,expectedPage=1):SeatingPage{
  if(!/^\d{5,24}$/.test(studentId)||html.length>2_000_000||
     !Number.isSafeInteger(expectedPage)||expectedPage<1||expectedPage>20)
    throw new Error('Invalid exam seating response');
  const $=load(html);
  const table=$('table').filter((_,element)=>{
    const labels=$(element).find('thead th').map((_,th)=>norm($(th).text()).toLowerCase()).get();
    return EXPECTED.every(h=>labels.includes(h));
  }).first();
  if(!table.length)throw new Error('ERP exam seating table not found');
  const grid=table.closest('.grid-view');
  if(!grid.length)throw new Error('ERP seating results grid changed');
  const labels=table.find('thead th').map((_,th)=>norm($(th).text()).toLowerCase()).get();
  const col=(key:string)=>labels.indexOf(key);
  const summary=norm(grid.find('.summary').first().text());
  const range=summary.match(/showing\s+(\d+)\s*[-–]\s*(\d+)\s+of\s+(\d+)\s+items?/i);
  // Yii GridView may render an empty-state row instead of normal pagination.
  if(!range && /no results found/i.test(norm(grid.text())) &&
     !table.find('tbody tr td').filter((_,td)=>!$(td).attr('colspan')).length)
    return {records:[],first:0,last:0,total:0,nextPage:null};
  if(!range)throw new Error('ERP seating pagination summary changed');
  const first=Number(range[1]),last=Number(range[2]),total=Number(range[3]);
  if(total<1||total>LIMIT||first<1||last<first||last>total||
     first!==(expectedPage-1)*20+1||last-first+1>20)
    throw new Error('Invalid ERP seating page range');
  const records:SeatRecord[]=[];
  table.find('tbody tr').each((_,tr)=>{
    const values=$(tr).children('td').map((_,td)=>norm($(td).text())).get();
    if(!values.length)return;
    if(values.length<labels.length)throw new Error('Incomplete ERP seating row');
    if(values[col('student university id')]!==studentId)
      throw new Error('Exam seating belongs to another ERP account');
    const refId=values[col('ref.id')];
    const examDate=values[col('exam date')];
    const examType=values[col('exam type')];
    const examSlot=values[col('exam slot')];
    const courseCode=values[col('course code')];
    const roomNo=values[col('room no')];
    if(!/^\d{1,24}$/.test(refId)||
       !/^\d{4}-\d{2}-\d{2}$/.test(examDate)||
       !Number.isFinite(Date.parse(examDate+'T00:00:00Z'))||
       !examType||examType.length>60||!examSlot||examSlot.length>40||
       !courseCode||courseCode.length>50||!roomNo||roomNo.length>100)
      throw new Error('Invalid ERP seating row');
    records.push({refId,examDate,examType,examSlot,courseCode,roomNo});
  });
  if(records.length!==last-first+1)throw new Error('ERP seating page is incomplete');
  const nextPage=last<total?expectedPage+1:null;
  if(nextPage!==null){
    const found=grid.find('.pagination a[href]').toArray().some(a=>
      pageFromLink($(a).attr('href')||'')===nextPage
    );
    if(!found||nextPage>20)throw new Error('ERP seating next page was not found');
  }
  return {records,first,last,total,nextPage};
}
