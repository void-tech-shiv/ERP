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
  assert.match(parent,/view==='timetable' \? <TimetableStep\/>/);
  assert.match(parent,/view==='seating' \? <ExamSeatingStep\/>/);
  assert.match(parent,/view==='cgpa' \? <CGPAStep\/>/);
  assert.match(ui,/\/api\/erp\/timetable\/terms/);
  assert.match(ui,/\/api\/erp\/timetable\?/);
  assert.doesNotMatch(ui,/localStorage|sessionStorage|IndexedDB|writeERP/);
});
