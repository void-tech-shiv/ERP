import { load } from 'cheerio';

export const TIMETABLE_FORM_ROUTE='timetables/universitymasteracademictimetableview/indexstudentindisearch';
export const TIMETABLE_RESULT_ROUTE='timetables/universitymasteracademictimetableview/individualstudenttimetableget';
export const TIMETABLE_FORM_PATH='/index.php?r=timetables%2Funiversitymasteracademictimetableview%2Findexstudentindisearch';

export type TimetableOption={value:string;label:string};
export type TimetableTerms={years:TimetableOption[];semesters:TimetableOption[]};
export type TimetableClass={
  day:string;period:number;raw:string;courseCode:string|null;
  component:'L'|'T'|'P'|'S'|null;section:string|null;room:string|null;
};
export type Timetable={days:string[];periods:number[];classes:TimetableClass[]};

const tidy=(value:string)=>value.replace(/\s+/g,' ').trim();
const YEAR_NAME='UniversityMasterAcademicTimetableView[academicyear]';
const SEM_NAME='UniversityMasterAcademicTimetableView[semesterid]';

export function parseTimetableTerms(html:string):TimetableTerms {
  if(html.length>2_000_000)throw new Error('ERP timetable form too large');
  const $=load(html);
  const form=$('form').filter((_,el)=>$(el).find('input[name="r"]').attr('value')===TIMETABLE_RESULT_ROUTE).first();
  if(!form.length||form.attr('method')?.toLowerCase()!=='get')
    throw new Error('ERP timetable search form not found');
  function options(name:string):TimetableOption[]{
    const input=form.find('select').filter((_,el)=>$(el).attr('name')===name).first();
    if(!input.length)throw new Error('ERP timetable options changed');
    const found=input.find('option').toArray().map(el=>({
      value:$(el).attr('value')||'',label:tidy($(el).text())
    })).filter(x=>/^\d{1,3}$/.test(x.value)&&x.label.length<=60&&x.label);
    if(!found.length||found.length>60||new Set(found.map(x=>x.value)).size!==found.length)
      throw new Error('Invalid ERP timetable options');
    return found;
  }
  return {years:options(YEAR_NAME),semesters:options(SEM_NAME)};
}

const DAY_LABELS:Record<string,string>={
  mon:'Mon',monday:'Mon',tue:'Tue',tuesday:'Tue',
  wed:'Wed',wednesday:'Wed',thu:'Thu',thursday:'Thu',
  fri:'Fri',friday:'Fri',sat:'Sat',saturday:'Sat',
  sun:'Sun',sunday:'Sun',
};
function parseCell(raw:string,day:string,period:number):TimetableClass {
  const codePart=raw.match(/^([A-Z0-9]{5,28})\s*[-–]\s*([LTPS])(?=\s*[-–]|\s|$)/i);
  const section=raw.match(/\bS\s*-\s*\d+(?:\s*-\s*(?!RoomNo\b)[A-Za-z]{1,3}\d{0,3})?\b/i);
  const room=raw.match(/\bRoom\s*No\s*[-:]\s*(.+)$/i);
  return {
    day,period,raw,
    courseCode:codePart?codePart[1].toUpperCase():null,
    component:codePart?codePart[2].toUpperCase() as 'L'|'T'|'P'|'S':null,
    section:section?tidy(section[0]):null,
    room:room?tidy(room[1]):null,
  };
}

/**
 * Only structural classifications; never expose raw ERP HTML, student names,
 * credentials, CSRF, cookie data or arbitrary upstream text to the browser.
 */
export type TimetableFailure=
  'TT_FORBIDDEN_HTML'|'TT_LOGIN_REQUIRED'|'TT_SEARCH_FORM'|
  'TT_EMPTY_RESULT'|'TT_UNRECOGNIZED_TABLE'|'TT_UNEXPECTED_RESPONSE';

export function classifyTimetableFailure(html:string):TimetableFailure {
  const $=load(html);
  const visible=$('body').text().replace(/\s+/g,' ').trim().slice(0,100_000);
  if($('.site-error').length&&/forbidden|not allowed to perform this action/i.test($('.site-error').text())||
     $('h1,h2,h3,h4,h5').toArray().some(el=>/^\s*Forbidden\s*$/i.test($(el).text()))||
     /You are not allowed to perform this action/i.test(visible))
    return 'TT_FORBIDDEN_HTML';
  if($('input[name="LoginForm[password]"]').length||
     $('form').filter((_,el)=>$(el).find('input[name="LoginForm[username]"]').length>0).length)
    return 'TT_LOGIN_REQUIRED';
  if($('form').filter((_,el)=>
    $(el).find('input[name="r"]').attr('value')===TIMETABLE_RESULT_ROUTE).length)
    return 'TT_SEARCH_FORM';
  if(/no results found|no records found|no timetable found/i.test(visible))
    return 'TT_EMPTY_RESULT';
  if($('table').length)
    return 'TT_UNRECOGNIZED_TABLE';
  return 'TT_UNEXPECTED_RESPONSE';
}

/** Parses the actual table structure shown by KL ERP: Day, period numbers,
 * and class cells. The sample grid is used only in tests, never as live data.
 * Unrecognized cell text is preserved for display, not silently discarded.
 */
export function parseTimetable(html:string):Timetable {
  if(html.length>2_000_000)throw new Error('ERP timetable result too large');
  const $=load(html);
  if($('.site-error').text().match(/forbidden|not allowed to perform/i))
    throw new Error('ERP denied timetable access');
  let result:Timetable|null=null;
  $('table').each((_,table)=>{
    const rows=$(table).find('tr').toArray();
    if(rows.length<2)return;
    const first=$(rows[0]).children('th,td').toArray().map(c=>tidy($(c).text()));
    if(!/^(?:0\s*)?day$/i.test(first[0]||''))return;
    const periods=first.slice(1).map(Number);
    if(periods.length<3||periods.length>16||
       periods.some((p,i)=>!Number.isInteger(p)||p<1||p>16||(i>0&&p<=periods[i-1])))return;
    const days:string[]=[];
    const classes:TimetableClass[]=[];
    for(const row of rows.slice(1)){
      const cells=$(row).children('td,th').toArray();
      if(!cells.length)continue;
      const label=tidy($(cells[0]).text()).toLowerCase();
      const day=DAY_LABELS[label];
      if(!day)continue; // Ignore footer/summary rows, not a scheduled day.
      if(days.includes(day)||cells.length!==periods.length+1)
        throw new Error('ERP timetable day row changed');
      days.push(day);
      for(let i=1;i<cells.length;i++){
        const cell=$(cells[i]);
        // Preserve spaces around HTML <br> even when ERP omits whitespace.
        const inner=(cell.html()||'').replace(/<br\s*\/?>/gi,' ');
        const raw=tidy(load('<div id="text">'+inner+'</div>')('#text').text());
        if(!raw||/^[-–]+$/.test(raw))continue;
        if(raw.length>280)throw new Error('Unexpected ERP timetable cell size');
        classes.push(parseCell(raw,day,periods[i-1]));
        if(classes.length>160)throw new Error('Too many ERP timetable entries');
      }
    }
    if(!days.length)throw new Error('No valid ERP timetable day rows');
    result={days,periods,classes};
    return false;
  });
  if(!result)throw new Error('ERP timetable grid not found: '+classifyTimetableFailure(html));
  return result;
}