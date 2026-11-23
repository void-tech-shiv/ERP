import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCGPA } from '../lib/server/erp_cgpa.ts';

const student='0000012345';
function fixture({id=student,summary=true,badge=true,table=true}={}){
  const sum=summary?'<div class="text-primary fw-medium">Registered Credits: 20 , Result Declared Credits : 20, Obtained Credits : 18.5, Result Awaiting Credits : 0, Cumulative : 145</div>':'';
  const value=badge?'<div class="badge text-bg-success">CGPA : 7.25</div>':'';
  const columns=['#','University Id','Student Name','Course Code','Course Name',
    'Grade','Grade Point','Credits','Promotion','Reg Academic Year','Reg Sem',''];
  const header='<thead><tr>'+columns.map(c=>'<th>'+c+'</th>').join('')+'</tr></thead>';
  const course=(code,name,grade,point,credits,sem)=>{
    const cells=['1',id,'TEST STUDENT',code,name,grade,point,credits,'P','2026-2027',sem,''];
    return '<tr>'+cells.map(c=>'<td>'+c+'</td>').join('')+'</tr>';
  };
  const rows=table?'<table>'+header+'<tbody>'+
    course('CS101','Algorithms','A+','9','3.5','Odd Sem')+
    course('CS102','Databases','F(F,F)','0','0','Even Sem')+
    '</tbody></table>':'';
  return '<html><body><div id="p0">'+sum+value+'<div id="w0">'+rows+'</div></div></body></html>';
}

test('parses ERP credit summary, CGPA and course grades',()=>{
  const report=parseCGPA(fixture(),student);
  assert.equal(report.cgpa,7.25);
  assert.deepEqual([report.registeredCredits,report.declaredCredits,
    report.obtainedCredits,report.awaitingCredits,report.cumulative],
    [20,20,18.5,0,145]);
  assert.equal(report.courses.length,2);
  assert.deepEqual(report.courses[0],{
    code:'CS101',name:'Algorithms',grade:'A+',gradePoint:9,credits:3.5,
    promotion:'P',academicYear:'2026-2027',semester:'Odd Sem'
  });
  assert.equal(report.courses[1].grade,'F(F,F)');
  assert.equal(report.courses[1].credits,0);
});
test('does not leak IDs or student names in parsed output',()=>{
  const json=JSON.stringify(parseCGPA(fixture(),student));
  assert.doesNotMatch(json,/0000012345|TEST STUDENT|_csrf|csrf-token/);
});
test('refuses CGPA page for a different student',()=>{
  assert.throws(()=>parseCGPA(fixture({id:'0000099999'}),student),/another ERP account/);
});
test('refuses login pages or missing grade tables',()=>{
  assert.throws(()=>parseCGPA('<html><form><input name="LoginForm[username]"></form></html>',student));
  assert.throws(()=>parseCGPA(fixture({table:false}),student),/grade table/);
  assert.throws(()=>parseCGPA(fixture({summary:false}),student),/credit summary/);
  assert.throws(()=>parseCGPA(fixture({badge:false}),student),/CGPA value/);
});
test('rejects excessively large HTML and invalid CGPA',()=>{
  assert.throws(()=>parseCGPA(' '.repeat(2_000_001),student));
  assert.throws(()=>parseCGPA(fixture().replace('CGPA : 7.25','CGPA : 21.5'),student));
});
test('CGPA route requires authenticated ERP session and fixed endpoint',()=>{
  const route=readFileSync(new URL('../app/api/erp/cgpa/route.ts',import.meta.url),'utf8');
  assert.match(route,/phase!=='authenticated'/);
  assert.match(route,/searchgetmycgpa/);
  assert.match(route,/parseCGPA\(html,session.studentId\)/);
  assert.match(route,/Cache-Control':'no-store'/);
  assert.doesNotMatch(route,/LoginForm\[password\]|getstudentinternalmarks/);
});
test('CGPA view is fetched on tab open, not cached with credentials',()=>{
  const ui=readFileSync(new URL('../components/CGPAStep.tsx',import.meta.url),'utf8');
  const parent=readFileSync(new URL('../components/AttendanceStep.tsx',import.meta.url),'utf8');
  assert.match(ui,/api\/erp\/cgpa/);
  assert.match(parent,/view==='cgpa' \? <CGPAStep\/>/);
  assert.match(parent,/onClick=\{\(\)=>setView\('cgpa'\)\}/);
  assert.doesNotMatch(ui,/localStorage|IndexedDB|writeERP/);
});
