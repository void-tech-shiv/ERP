import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { totals,fmt } from '../lib/calculator.ts';
import { groupTimetableSessions } from '../lib/timetable_display.ts';

const overview=readFileSync(new URL('../components/OverviewStep.tsx',import.meta.url),'utf8');
const shell=readFileSync(new URL('../components/AttendanceStep.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');

test('Overview is the default post-login tab and existing sections still work',()=>{
  assert.match(shell,/useState<'overview'\|'attendance'\|'cgpa'\|'seating'\|'timetable'>\('overview'\)/);
  assert.match(shell,/>Overview<\/span>/);
  assert.match(shell,/view==='overview' \? <OverviewStep/);
  assert.match(shell,/view==='cgpa' \? <CGPAStep\/>/);
  assert.match(shell,/view==='seating' \? <ExamSeatingStep\/>/);
  assert.match(shell,/view==='timetable' \? <TimetableStep\/>/);
  assert.match(shell,/onRefreshAttendance=\{syncAttendance\}/);
});
test('nickname greeting is editable and only explicitly saved on this browser',()=>{
  assert.match(overview,/greeting\(now\.getHours\(\)\)/);
  assert.match(overview,/nickname\|\|'Student'/);
  assert.match(overview,/editingNickname\?/);
  assert.match(overview,/localStorage\.setItem\(key,safe\)/);
  assert.match(overview,/localStorage\.removeItem\(key\)/);
  assert.match(overview,/attendly:nickname:v1:/);
  assert.doesNotMatch(overview,/localStorage\.setItem\([^)]*(cgpa|grades|password|csrf|courses)/i);
});
test('CGPA is hidden by default, fetched only when Show is pressed, cleared on Hide',()=>{
  assert.match(overview,/const \[cgpaVisible,setCgpaVisible\]=useState\(false\)/);
  assert.match(overview,/if\(!cgpaVisible\)return;/);
  assert.match(overview,/getJson\('\/api\/erp\/cgpa',controller\.signal\)/);
  assert.match(overview,/setCgpaVisible\(false\);setCgpa\(null\)/);
  assert.match(overview,/aria-label=\{cgpaVisible\?'Hide CGPA':'Show CGPA'\}/);
  assert.match(overview,/\{!cgpaVisible\?'••••'/);
  assert.doesNotMatch(overview,/writeERP\(|sessionStorage\.setItem\(|IndexedDB/);
});
test('attendance uses weighted LTPS totals only for the selected academic year and semester',()=>{
  assert.match(overview,/attendance\.academicYear===year&&/);
  assert.match(overview,/attendance\.semester===semester\?attendance:null/);
  assert.match(overview,/shownAttendance\.courses\.map\(totals\)/);
  assert.match(overview,/onRefreshAttendance\(\)/);
  assert.match(overview,/shownAttendance\.cached\?'Saved snapshot/);
  const course={code:'TEST',name:'Synthetic subject',components:{
    L:{attended:2,conducted:2},P:{attended:1,conducted:2},S:{attended:1,conducted:2},
  }};
  const result=totals(course);
  assert.equal(result.a,2.75);
  assert.equal(result.t,3.5);
  assert.equal(fmt(result.percentage),'78.57%');
});
test('today class list filters real ERP days and groups repeated periods',()=>{
  assert.match(overview,/getJson\('\/api\/erp\/timetable\/terms'\)/);
  assert.match(overview,/getJson\('\/api\/erp\/timetable\?'\+params\.toString\(\)\)/);
  assert.match(overview,/groupTimetableSessions\(liveTimetable\.classes,localDay\)/);
  assert.match(overview,/sessionReferenceTime\(item,liveTimetable\.periodsInferred\)/);
  assert.match(overview,/liveTimetable\?\.periodsInferred/);
  const sample={day:'Mon',raw:'25CS2207E-L - S-3 - RoomNo-C107',courseCode:'25CS2207E',
    component:'L',section:'S-3',room:'C107'};
  const items=[{...sample,period:3},{...sample,period:4},
    {...sample,day:'Tue',period:3}];
  const monday=groupTimetableSessions(items,'Mon');
  assert.equal(monday.length,1);
  assert.equal(monday[0].periodCount,2);
});
test('active semester is selected explicitly, and upstream reads remain authenticated',()=>{
  assert.match(overview,/Select year/);
  assert.match(overview,/Select semester/);
  assert.match(overview,/!canSync\|\|overviewBusy/);
  assert.match(overview,/await onRefreshAttendance\(\)/);
  assert.match(overview,/credentials:'same-origin',cache:'no-store'/);
  assert.doesNotMatch(overview,/mockTimetable|DEMO|const sampleCourses=/);
});
test('overview is responsive with accessible controls and privacy labels',()=>{
  assert.match(css,/\.at-home-stat-grid\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:1150px\)/);
  assert.match(css,/@media\(max-width:650px\)/);
  assert.match(css,/\.at-home-stat-grid\{grid-template-columns:1fr;gap:11px\}/);
  assert.match(overview,/aria-label="Current semester selection"/);
  assert.match(overview,/aria-pressed=\{cgpaVisible\}/);
  assert.match(overview,/Nickname is optional and saved only on this browser/);
});
