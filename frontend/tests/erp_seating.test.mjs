import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSeatingPage } from '../lib/server/erp_seating.ts';

const id='0000012345';
const names=['#','Ref.Id','Exam Date','Exam Type','Exam Slot',
  'Student University Id','Course Code','Room No','Createon',''];
const row=(i,student=id)=>{
  const values=[String(i),String(3100000+i),'2026-10-'+String(31-i).padStart(2,'0'),
    'End Semester','am',student,'25CS2103E','S907','2026-10-17 15:28:14',''];
  return '<tr>'+values.map(v=>'<td>'+v+'</td>').join('')+'</tr>';
};
function fixture(page=1,student=id,total=29){
  const first=(page-1)*20+1,last=Math.min(page*20,total);
  const rows=Array.from({length:last-first+1},(_,index)=>row(first+index,student)).join('');
  const link='<ul class="pagination"><li><a href="/index.php?r=examsection%2Fexam-invigilator-student-room-allotment-info%2Fstud_my_seating_plan&page=2">2</a></li></ul>';
  return '<html><head><meta name="csrf-token" content="SENSITIVE"></head><body>'+
    '<div class="grid-view" id="w0"><div class="summary">Showing '+
    first+'-'+last+' of '+total+' items.</div><table><thead><tr>'+
    names.map(n=>'<th>'+n+'</th>').join('')+'</tr></thead><tbody>'+rows+
    '</tbody></table>'+(page===1?link:'')+'</div></body></html>';
}

test('parses actual seating columns and a 20-row first page',()=>{
  const parsed=parseSeatingPage(fixture(),id,1);
  assert.equal(parsed.total,29);
  assert.equal(parsed.records.length,20);
  assert.equal(parsed.nextPage,2);
  assert.deepEqual(parsed.records[0],{
    refId:'3100001',examDate:'2026-10-30',examType:'End Semester',
    examSlot:'am',courseCode:'25CS2103E',roomNo:'S907'
  });
});
test('supports ERP pagination to read all 29 rows',()=>{
  const first=parseSeatingPage(fixture(),id,1);
  const second=parseSeatingPage(fixture(2),id,2);
  assert.equal(second.records.length,9);
  assert.equal(second.nextPage,null);
  assert.equal(first.records.length+second.records.length,29);
});
test('rejects a seating page from any other university ID',()=>{
  assert.throws(()=>parseSeatingPage(fixture(1,'0000099999'),id),/another ERP account/);
});
test('rejects HTML login screens and incomplete rows',()=>{
  assert.throws(()=>parseSeatingPage('<html><form>Login</form></html>',id),/table not found/);
  assert.throws(()=>parseSeatingPage(fixture(1,id).replace('S907',''),id),/Invalid ERP seating row/);
});
test('rejects a stale second page and a missing next-page link',()=>{
  assert.throws(()=>parseSeatingPage(fixture(1),id,2),/page range/);
  assert.throws(()=>parseSeatingPage(fixture().replace(/<ul class="pagination">[\s\S]*?<\/ul>/,''),id,1),/next page/);
});
test('parses zero allotments without creating fake exams',()=>{
  const empty='<div class="grid-view"><table><thead><tr>'+
    names.map(n=>'<th>'+n+'</th>').join('')+
    '</tr></thead><tbody><tr><td colspan="10">No results found.</td></tr></tbody></table></div>';
  const parsed=parseSeatingPage(empty,id);
  assert.deepEqual(parsed,{records:[],first:0,last:0,total:0,nextPage:null});
});
test('strips university ID, CSRF, and personal details from results',()=>{
  const output=JSON.stringify(parseSeatingPage(fixture(),id,1));
  assert.doesNotMatch(output,/0000012345|SENSITIVE|csrf-token|Student University Id/);
});
test('backend is read-only and requires authenticated private ERP session',()=>{
  const api=readFileSync(new URL('../app/api/erp/seating/route.ts',import.meta.url),'utf8');
  assert.match(api,/testingEnabled/);
  assert.match(api,/phase!=='authenticated'/);
  assert.match(api,/parseSeatingPage\(html,state.studentId,page\)/);
  assert.match(api,/Cache-Control':'private, no-store'/);
  assert.match(api,/if\(refs.has\(seat.refId\)\)/);
  assert.doesNotMatch(api,/method:'POST'|LoginForm\[password\]/);
});
test('CGPA and Attendance remain and seat data is not cached',()=>{
  const ui=readFileSync(new URL('../components/ExamSeatingStep.tsx',import.meta.url),'utf8');
  const main=readFileSync(new URL('../components/AttendanceStep.tsx',import.meta.url),'utf8');
  assert.match(ui,/api\/erp\/seating/);
  assert.match(main,/Exam Seating/);
  assert.match(main,/view==='seating' \? <ExamSeatingStep\/>/);
  assert.match(main,/view==='cgpa' \? <CGPAStep\/>/);
  assert.match(main,/api\/erp\/attendance/);
  assert.doesNotMatch(ui,/localStorage|sessionStorage|indexedDB|writeERP/);
});
