import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTimetableTerms,parseTimetable,TIMETABLE_RESULT_ROUTE } from '../lib/server/erp_timetable.ts';

const form='<html><body><form action="/index.php" method="get">'+
'<input name="r" value="'+TIMETABLE_RESULT_ROUTE+'" type="hidden"/>'+
'<select name="UniversityMasterAcademicTimetableView[academicyear]">'+
'<option value="">Select year</option><option value="29">2026-2027</option><option value="19">2025-2026</option></select>'+
'<select name="UniversityMasterAcademicTimetableView[semesterid]">'+
'<option value="">Select semester</option><option value="1">Odd Sem</option><option value="2">Even Sem</option></select>'+
'</form></body></html>';
const header='<tr><th>0day</th>'+Array.from({length:11},(_,i)=>'<th>'+String(i+1)+'</th>').join('')+'</tr>';
function day(label,entries={}){
  return '<tr><td>'+label+'</td>'+
  Array.from({length:11},(_,i)=>'<td>'+(entries[i+1]||'-')+'</td>').join('')+'</tr>';
}
const grid='<html><body><h3>Academic Timetable</h3><table><thead>'+header+
  '</thead><tbody>'+
  day('Mon',{3:'25CS2103E-L - S-4 - RoomNo-C410',4:'25CS2103E-L - S-4 - RoomNo-C410',9:'25CS2107E-S - S-5 - RoomNo-C110'})+
  day('Tue',{5:'25CS2104E-L - S-5 - RoomNo-C110'})+
  day('Wed',{6:'25FL2111E-P - S-1 - RoomNo-C408'})+
  day('Fri',{8:'25SP2105E-S - S-1 - RoomNo-CRICKET NETS'})+
  day('Sat',{})+'</tbody></table></body></html>';

test('reads academic year and semester IDs from the authorized GET form',()=>{
  const result=parseTimetableTerms(form);
  assert.deepEqual(result.years,[{value:'29',label:'2026-2027'},{value:'19',label:'2025-2026'}]);
  assert.deepEqual(result.semesters,[{value:'1',label:'Odd Sem'},{value:'2',label:'Even Sem'}]);
  assert.throws(()=>parseTimetableTerms(form.replace('method="get"','method="post"')));
  assert.throws(()=>parseTimetableTerms('<html><form><input name="LoginForm[password]"></form></html>'));
});
test('parses weekly day-period grid and all available LTPS/rooms',()=>{
  const result=parseTimetable(grid);
  assert.deepEqual(result.days,['Mon','Tue','Wed','Fri','Sat']);
  assert.deepEqual(result.periods,[1,2,3,4,5,6,7,8,9,10,11]);
  assert.equal(result.classes.length,6);
  const lecture=result.classes[0];
  assert.equal(lecture.day,'Mon');
  assert.equal(lecture.period,3);
  assert.equal(lecture.courseCode,'25CS2103E');
  assert.equal(lecture.component,'L');
  assert.equal(lecture.section,'S-4');
  assert.equal(lecture.room,'C410');
  assert.equal(result.classes.at(-1)?.room,'CRICKET NETS');
});
test('finds a real timetable header after an ERP title row',()=>{
  const extraHeader=grid.replace('<thead>'+header,
    '<thead><tr><th colspan="12">Academic Timetable</th></tr>'+header);
  const parsed=parseTimetable(extraHeader);
  assert.equal(parsed.periods.length,11);
  assert.equal(parsed.classes[0].courseCode,'25CS2103E');
});
test('skips unrelated layout tables before the actual timetable grid',()=>{
  const withOtherTable=grid.replace('<h3>Academic Timetable</h3>',
    '<table><tr><th>Notice</th></tr><tr><td>Another panel</td></tr></table><h3>Academic Timetable</h3>');
  const parsed=parseTimetable(withOtherTable);
  assert.equal(parsed.classes.length,6);
});
test('accepts standard S-prefixed period headers from real-world schedules',()=>{
  const sHeaders=grid.replace('<th>1</th>','<th>S1</th>')
    .replace('<th>2</th>','<th>S2</th>')
    .replace('<th>3</th>','<th>S3</th>');
  const parsed=parseTimetable(sHeaders);
  assert.deepEqual(parsed.periods.slice(0,3),[1,2,3]);
});
test('parses the observed 25-column five-day ERP grid without a header row',()=>{
  const slots=24;
  const cells=(day,entries={})=>'<tr><td>'+day+'</td>'+
    Array.from({length:slots},(_,i)=>'<td>'+(entries[i+1]||'-')+'</td>').join('')+'</tr>';
  const result='<html><h3>Academic Timetable</h3><table><tbody>'+
    cells('Mon',{3:'25CS2207E-L - S-3 - RoomNo-C107',24:'25AD2203E-P - S-1 - RoomNo-C409'})+
    cells('Tue',{5:'25CS2206E-L - S-5 - RoomNo-C111'})+
    cells('Wed',{4:'25CS3112E-S - S-1 - RoomNo-C111'})+
    cells('Fri',{8:'25SP2105E-S - S-1 - RoomNo-CRICKET NETS'})+
    cells('Sat',{6:'25CS2207E-S - S-3 - RoomNo-C107'})+
    '</tbody></table></html>';
  const parsed=parseTimetable(result);
  assert.deepEqual(parsed.days,['Mon','Tue','Wed','Fri','Sat']);
  assert.equal(parsed.periods.length,24);
  assert.equal(parsed.periods.at(-1),24);
  assert.equal(parsed.periodsInferred,true);
  assert.equal(parsed.classes.length,6);
  assert.deepEqual({day:parsed.classes[1].day,period:parsed.classes[1].period,room:parsed.classes[1].room},
    {day:'Mon',period:24,room:'C409'});
});
test('accepts a 25-column grid with explicit university period numbers',()=>{
  const labels='<tr><th>Day</th>'+Array.from({length:24},(_,i)=>'<th>'+(i+1)+'</th>').join('')+'</tr>';
  const make=(day)=>'<tr><td>'+day+'</td>'+Array.from({length:24},(_,i)=>
    '<td>'+(i===3?'25CS2207E-L - S-3 - RoomNo-C107':'-')+'</td>').join('')+'</tr>';
  const parsed=parseTimetable('<table><thead>'+labels+'</thead><tbody>'+make('Mon')+make('Tue')+
    make('Wed')+make('Fri')+make('Sat')+'</tbody></table>');
  assert.equal(parsed.periodsInferred,false);
  assert.equal(parsed.periods.length,24);
  assert.equal(parsed.classes[0].period,4);
});
test('never infers classes from a non-timetable 25-column table',()=>{
  const day=(label)=>'<tr><td>'+label+'</td>'+('<td>PRIVATE</td>'.repeat(24))+'</tr>';
  assert.throws(()=>parseTimetable('<table>'+day('Mon')+day('Tue')+day('Wed')+day('Fri')+day('Sat')+'</table>'),
    /grid not found/);
});
test('rejects forbidden response instead of displaying fake class data',()=>{
  assert.throws(()=>parseTimetable('<html><div class="site-error"><h1>Forbidden</h1><h5>You are not allowed to perform this action.</h5></div></html>'),
    /ERP denied timetable access/);
  assert.throws(()=>parseTimetable('<html><h1>Forbidden</h1></html>'),/grid not found/);
  assert.throws(()=>parseTimetable('<html><h1>Login</h1></html>'),/grid not found/);
});
test('rejects malformed timetable day/period data',()=>{
  assert.throws(()=>parseTimetable(grid.replace('<th>3</th>','<th>2</th>')),/grid not found/);
  assert.throws(()=>parseTimetable(grid.replace('</tr><tr><td>Tue','</tr><tr><td>Mon')),/day row changed/);
});
test('backend validates the user session and fixed server-side query parameters',()=>{
  const result=readFileSync(new URL('../app/api/erp/timetable/route.ts',import.meta.url),'utf8');
  const terms=readFileSync(new URL('../app/api/erp/timetable/terms/route.ts',import.meta.url),'utf8');
  assert.match(result,/phase!=='authenticated'/);
  assert.match(terms,/phase!=='authenticated'/);
  assert.match(result,/UniversityMasterAcademicTimetableView\[academicyear\]/);
  assert.match(result,/UniversityMasterAcademicTimetableView\[semesterid\]/);
  assert.match(result,/parseTimetable\(await response.text\(\)\)/);
  assert.match(result,/Cache-Control':'private, no-store'/);
  assert.doesNotMatch(result,/method:'POST'|LoginForm\[password\]|rawHtml:/);
});
test('Timetable is available alongside existing secure Attendance, CGPA, and Exam Seating views',()=>{
  const parent=readFileSync(new URL('../components/AttendanceStep.tsx',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../components/TimetableStep.tsx',import.meta.url),'utf8');
  assert.match(parent,/view==='timetable' \? <TimetableStep/);
  assert.match(parent,/view==='seating' \? <ExamSeatingStep\/>/);
  assert.match(parent,/view==='cgpa' \? <CGPAStep key=\{studentId\}\/>/);
  assert.match(ui,/\/api\/erp\/timetable\/terms/);
  assert.match(ui,/\/api\/erp\/timetable\?/);
  assert.doesNotMatch(ui,/localStorage|sessionStorage|IndexedDB|writeERP/);
});
