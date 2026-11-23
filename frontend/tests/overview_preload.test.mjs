import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const overview=readFileSync(new URL('../components/OverviewStep.tsx',import.meta.url),'utf8');
const workspace=readFileSync(new URL('../components/AttendanceStep.tsx',import.meta.url),'utf8');
const settings=readFileSync(new URL('../components/SettingsStep.tsx',import.meta.url),'utf8');

test('saved current semester triggers real Overview preloading without button click',()=>{
  assert.match(workspace,/autoLoadCurrentSession=\{Boolean\(/);
  assert.match(workspace,/activePreferences\.currentYear===year&&activePreferences\.currentSemester===semester/);
  assert.match(overview,/if\(!autoLoadCurrentSession\|\|!canSync\|\|attendanceBusy\|\|/);
  assert.match(overview,/autoStarted\.current\.add\(currentKey\)/);
  assert.match(overview,/void refreshOverview\(\)/);
  assert.match(overview,/await onRefreshAttendance\(\)/);
  assert.match(overview,/getJson\('\/api\/erp\/timetable\/terms'\)/);
  assert.match(overview,/getJson\('\/api\/erp\/timetable\?'\+params\.toString\(\)\)/);
  assert.match(overview,/onClick=\{\(\)=>void refreshOverview\(\)\}/);
});

test('does not preload a missing, invalid, or unsaved academic term',()=>{
  assert.match(overview,/const canSync=Boolean\(year&&semester&&terms\?\.years\.includes\(year\)&&/);
  assert.match(overview,/terms\?\.semesters\.includes\(semester\)\)/);
  assert.match(overview,/if\(!autoLoadCurrentSession\|\|!canSync/);
  assert.match(workspace,/activePreferences\.currentYear&&activePreferences\.currentSemester&&/);
  assert.match(workspace,/setYear\(restored\.currentYear\)/);
  assert.match(workspace,/setSemester\(restored\.currentSemester\)/);
});

test('edits on Overview save back to student-specific Settings, not just local form state',()=>{
  assert.match(workspace,/function changeOverviewYear\(next:string\)/);
  assert.match(workspace,/function changeOverviewSemester\(next:string\)/);
  assert.match(workspace,/savePreferences\(\{\.\.\.activePreferences,currentYear:next,currentSemester:semester\}\)/);
  assert.match(workspace,/savePreferences\(\{\.\.\.activePreferences,currentYear:year,currentSemester:next\}\)/);
  assert.match(workspace,/writeStudentPreferences\(window\.localStorage,studentId,clean\)/);
  assert.match(overview,/onNicknameChange\(safe\)/);
  assert.match(workspace,/onNicknameChange=\{nickname=>savePreferences/);
  assert.match(overview,/onNavigate\('settings'\)/);
});

test('preloaded timetable is only reused for current student, term and recent successful data',()=>{
  assert.match(workspace,/OverviewTimetableCache & \{studentId:string\}/);
  assert.match(workspace,/overviewTimetable\?\.studentId===studentId\?overviewTimetable:null/);
  assert.match(overview,/cachedTimetable\?\.key===currentKey/);
  assert.match(overview,/Date\.now\(\)-cachedTimetable\.loadedAt<5\*60\*1000/);
  assert.match(overview,/shownAttendance&&!shownAttendance\.cached/);
  assert.match(overview,/Date\.now\(\)-new Date\(shownAttendance\.savedAt\)\.getTime\(\)<5\*60\*1000/);
  assert.match(overview,/onTimetableLoaded\(nextCache\)/);
  assert.match(workspace,/setOverviewTimetable\(null\)/);
});

test('CGPA remains masked by default, reveals only when opted in, and fetch is sequenced after auto preload',()=>{
  const prefs=readFileSync(new URL('../lib/student_preferences.ts',import.meta.url),'utf8');
  assert.match(prefs,/showCgpa:false/);
  assert.match(overview,/const cgpaVisible=showCgpa/);
  assert.match(overview,/const readyForCGPA=!autoLoadCurrentSession\|\|!canSync\|\|autoCompleteKey===currentKey/);
  assert.match(overview,/if\(!cgpaVisible\|\|!readyForCGPA\)return;/);
  assert.match(overview,/getJson\('\/api\/erp\/cgpa',controller\.signal\)/);
  assert.match(overview,/onCgpaVisibilityChange\(!cgpaVisible\)/);
  assert.match(overview,/\{!cgpaVisible\?'••••'/);
});

test('today classes and attendance are filtered by saved semester and local weekday',()=>{
  assert.match(overview,/const shownAttendance=attendance&&attendance\.academicYear===year&&/);
  assert.match(overview,/attendance\.semester===semester\?attendance:null/);
  assert.match(overview,/groupTimetableSessions\(liveTimetable\.classes,localDay\)/);
  assert.match(overview,/const localDay=now\?todayKey\(now\):null/);
  assert.match(overview,/shownAttendance\.courses\.map\(totals\)/);
  assert.match(workspace,/selectedDisplay=display&&display\.academicYear===year&&display\.semester===semester/);
});

test('Settings explains preload and keeps existing Save controls',()=>{
  assert.match(settings,/automatically loads attendance and today’s classes on Overview/);
  assert.match(settings,/After saving, Overview will automatically load/);
  assert.match(settings,/Save settings/);
});
