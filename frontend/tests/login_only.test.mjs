import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const home = readFileSync(new URL('../app/page.tsx', import.meta.url),'utf8');
const login = readFileSync(new URL('../app/api/erp/login/route.ts',import.meta.url),'utf8');
const attendance = readFileSync(new URL('../components/AttendanceStep.tsx',import.meta.url),'utf8');
const oldRoute = readFileSync(new URL('../app/private-test/page.tsx',import.meta.url),'utf8');

test('new homepage contains real ERP login, not a demo or sample data', () => {
  assert.match(home,/Connect to KL ERP/);
  assert.match(home,/api\/erp\/session/);
  assert.match(home,/api\/erp\/challenge/);
  assert.match(home,/api\/erp\/login/);
  assert.match(home,/result\.verified !== true/);
  assert.doesNotMatch(home,/DEMO|DEMO MODE|startDemo|mock records|sample subjects/i);
});
test('authenticated attendance UI is accessible only after verified ERP session', () => {
  assert.match(home,/stage === 'authenticated' && csrf && studentId/);
  assert.match(home,/<AttendanceStep studentId=\{studentId\} csrfToken=\{csrf\}/);
  assert.doesNotMatch(home,/api\/erp\/terms|api\/erp\/attendance/);
});
test('login route retains its strict authenticated dashboard verification', () => {
  assert.doesNotMatch(login,/studentattendance|attendanceFormAccessible/);
  assert.match(login,/inspectERPPage\(html,username\)/);
  assert.match(login,/if\(evidence\.verified\)/);
  assert.match(login,/if\(!verified\) return failure/);
  assert.match(login,/verified:true,stage:'login-only'/);
});
test('academic terms and attendance are explicitly loaded only in the authenticated dashboard', () => {
  assert.match(attendance,/const loadTerms=useCallback\(/);
  assert.match(attendance,/async function syncAttendance\(/);
  assert.match(attendance,/api\/erp\/terms/);
  assert.match(attendance,/api\/erp\/attendance/);
  assert.match(attendance,/Select year/);
  assert.match(attendance,/Select semester/);
  assert.match(attendance,/X-Attendly-CSRF/);
});
test('academic year and semester appear immediately and terms load after verified login', () => {
  assert.match(attendance,/const loadTerms=useCallback\(async\(signal\?:AbortSignal\)/);
  assert.match(attendance,/void loadTerms\(controller\.signal\)/);
  assert.match(attendance,/\[studentId,loadTerms\]/);
  assert.match(attendance,/terms\?\.years\.map/);
  assert.match(attendance,/terms\?\.semesters\.map/);
  assert.match(attendance,/Loading years/);
  assert.match(attendance,/Loading semesters/);
  assert.doesNotMatch(attendance,/Select academic session|at-term-first/);
  assert.doesNotMatch(attendance,/\{!terms\s*\?/);
  assert.match(attendance,/disabled=\{busy\|\|!terms\|\|!year\|\|!semester\}/);
  assert.equal((attendance.match(/onClick=\{\(\)=>void syncAttendance\(\)\}/g)||[]).length,1,
    'attendance must sync only from the explicit button');
});
test('Overview, Attendance, CGPA, Exam Seating and Timetable remain in the sidebar', () => {
  const sidebar=attendance.match(/<aside className="at-sidebar">([\s\S]*?)<\/aside>/)?.[1]||'';
  assert.match(sidebar,/>Overview<\/span>/);
  assert.match(sidebar,/>Attendance<\/span>/);
  assert.match(sidebar,/>CGPA<\/span>/);
  assert.match(sidebar,/>Exam Seating<\/span>/);
  assert.match(sidebar,/>Timetable<\/span>/);
  assert.doesNotMatch(sidebar,/My subjects|Attendance planner|Stay in the know/);
  assert.equal((sidebar.match(/at-nav-item/g)||[]).length,5);
});
test('dashboard does not show crossed-out metric cards or secondary screens', () => {
  assert.doesNotMatch(attendance,/<Metrics\s*\/>|at-metrics|at-metric-value/);
  assert.doesNotMatch(attendance,/setSection\(|section==='subjects'|section==='planner'/);
  assert.doesNotMatch(attendance,/View all/);
  assert.match(attendance,/<SubjectList\s*\/>/);
  assert.match(attendance,/at-goal-ring/);
  assert.match(attendance,/totals\(course\)/);
  assert.match(attendance,/\/api\/erp\/terms/);
  assert.match(attendance,/\/api\/erp\/attendance/);
});
test('cache stores attendance only and clears on logout', () => {
  assert.match(attendance,/writeERP\(\{studentId,academicYear:year,semester,courses,savedAt\}\)/);
  assert.match(home,/await clearERP\(\)/);
  assert.doesNotMatch(attendance,/writeERP\([^)]*password|writeERP\([^)]*captcha/i);
});
test('legacy private-test bookmarks redirect to the home app', () => {
  assert.match(oldRoute,/redirect\('\/'\)/);
});
test('demo API routes and helpers are removed from the deployed frontend', () => {
  for (const p of [
    '../app/api/demo/session/route.ts',
    '../app/api/demo/session/attendance/route.ts',
    '../app/api/demo/logout/route.ts',
    '../lib/demo_session.ts',
  ]) {
    assert.equal(existsSync(new URL(p,import.meta.url)),false,p+' must be absent');
  }
});
