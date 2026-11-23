import { load } from 'cheerio';

/** Return only academic results; do not forward student names, IDs, CSRF or HTML. */
export type CGPACourse = {
  code:string; name:string; grade:string; gradePoint:number; credits:number;
  promotion:string; academicYear:string; semester:string;
};
export type CGPAReport = {
  cgpa:number; registeredCredits:number; declaredCredits:number;
  obtainedCredits:number; awaitingCredits:number; cumulative:number;
  courses:CGPACourse[];
};
const clean=(value:string)=>value.replace(/\s+/g,' ').trim();
function requiredNumber(text:string,label:string):number {
  // Labels are hardcoded English words and spaces, not user-supplied regex.
  const match=text.match(new RegExp('\\b'+label+'\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)','i'));
  if(!match) throw new Error('CGPA credit summary changed: '+label);
  const number=Number(match[1]);
  if(!Number.isFinite(number)||number<0||number>100000)
    throw new Error('Invalid CGPA credit summary');
  return number;
}

/** Match the observed #p0 PJAX summary and grades. Reject wrong-account pages. */
export function parseCGPA(html:string,authenticatedStudentId:string):CGPAReport {
  if(!/^\d{5,24}$/.test(authenticatedStudentId)||html.length>2_000_000)
    throw new Error('Invalid authenticated CGPA response');
  const $=load(html);
  const scope=$('#p0').first();
  if(!scope.length)throw new Error('CGPA result section not found');
  const summary=clean(scope.find('.text-primary.fw-medium').first().text());
  const badge=scope.find('.badge').filter((_,el)=>/\bCGPA\s*:/i.test($(el).text())).first();
  const value=clean(badge.text()).match(/\bCGPA\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
  if(!value)throw new Error('CGPA value not found');
  const cgpa=Number(value[1]);
  if(!Number.isFinite(cgpa)||cgpa<0||cgpa>10)throw new Error('Invalid CGPA value');

  const needed=['university id','course code','course name','grade','grade point',
    'credits','promotion','reg academic year','reg sem'];
  const table=scope.find('table').filter((_,el)=>{
    const headings=$(el).find('thead th').map((_,th)=>clean($(th).text()).toLowerCase()).get();
    return needed.every(h=>headings.includes(h));
  }).first();
  if(!table.length)throw new Error('CGPA grade table not found');
  const headers=table.find('thead th').map((_,th)=>clean($(th).text()).toLowerCase()).get();
  const col=(label:string)=>headers.indexOf(label);
  const courses:CGPACourse[]=[];
  table.find('tbody tr').each((_,tr)=>{
    const cells=$(tr).children('td').map((_,td)=>clean($(td).text())).get();
    if(!cells.length||cells.every(cell=>!cell))return;
    if(cells.length<headers.length)throw new Error('Incomplete CGPA grade row');
    if(cells[col('university id')]!==authenticatedStudentId)
      throw new Error('CGPA page belongs to another ERP account');
    const code=cells[col('course code')],name=cells[col('course name')];
    const grade=cells[col('grade')],promotion=cells[col('promotion')];
    const academicYear=cells[col('reg academic year')],semester=cells[col('reg sem')];
    const pointText=cells[col('grade point')],creditText=cells[col('credits')];
    if(!code||code.length>45||!name||name.length>200||
       !grade||grade.length>20||promotion.length>30||
       !academicYear||academicYear.length>30||!semester||semester.length>40||
       !/^\d+(?:\.\d+)?$/.test(pointText)||!/^\d+(?:\.\d+)?$/.test(creditText))
      throw new Error('Invalid CGPA course row');
    const gradePoint=Number(pointText),credits=Number(creditText);
    if(gradePoint>10||credits>50)throw new Error('CGPA course values out of range');
    courses.push({code,name,grade,gradePoint,credits,promotion,academicYear,semester});
    if(courses.length>400)throw new Error('CGPA grade table too large');
  });
  if(!courses.length)throw new Error('No CGPA course results found');
  return {
    cgpa,
    registeredCredits:requiredNumber(summary,'Registered Credits'),
    declaredCredits:requiredNumber(summary,'Result Declared Credits'),
    obtainedCredits:requiredNumber(summary,'Obtained Credits'),
    awaitingCredits:requiredNumber(summary,'Result Awaiting Credits'),
    cumulative:requiredNumber(summary,'Cumulative'),
    courses,
  };
}
