import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page=readFileSync(new URL('../app/private-test/page.tsx',import.meta.url),'utf8');
const auth=readFileSync(new URL('../app/api/erp/login/route.ts',import.meta.url),'utf8');
const step=readFileSync(new URL('../components/AttendanceStep.tsx',import.meta.url),'utf8');

test('login remains independent of academic years and attendance',()=>{
  assert.doesNotMatch(auth,/studentattendance|attendanceFormDetected|attendanceFormAccessible|attendanceProbe/);
  assert.match(auth,/inspectERPPage\(html,username\)/);
  assert.match(auth,/if\(evidence\.verified\)/);
  assert.match(auth,/if\(!verified\) return failure/);
  assert.match(auth,/verified:true,stage:'login-only'/);
});
test('attendance step appears only after verified login',()=>{
  assert.match(page,/ERP Login Verified/);
  assert.match(page,/Verify ERP login/);
  assert.match(page,/result\?\.ok!==true \|\| result\?\.verified!==true/);
  assert.match(page,/stage==='authenticated' && csrf && studentId/);
  assert.match(page,/<AttendanceStep studentId=\{studentId\} csrfToken=\{csrf\}/);
  assert.doesNotMatch(page,/\/api\/erp\/terms|\/api\/erp\/attendance/);
});
test('year and semester API is explicit and never runs on attendance step mount',()=>{
  assert.match(step,/async function loadTerms\(/);
  assert.match(step,/async function loadAttendance\(/);
  assert.match(step,/\/api\/erp\/terms/);
  assert.match(step,/\/api\/erp\/attendance/);
  assert.match(step,/Load academic years & semesters/);
  assert.match(step,/Select academic year/);
  assert.match(step,/Select semester/);
  assert.match(step,/X-Attendly-CSRF/);
});
test('LTPS weights and overall percent use conducted-weighted totals',()=>{
  assert.match(step,/PARTS\.filter\(part => course\.components\[part\]\)/);
  assert.match(step,/totals\(course\)\.percentage/);
  assert.match(step,/100 \* attended \/ conducted/);
});
test('attendance cache never contains credentials and logout clears it',()=>{
  assert.match(step,/writeERP\(\{ studentId, academicYear: year, semester, courses, savedAt \}\)/);
  assert.doesNotMatch(step,/writeERP\([^)]*password|writeERP\([^)]*captcha/i);
  assert.match(page,/await clearERP\(\)/);
});
