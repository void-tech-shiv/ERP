import test from 'node:test';
import assert from 'node:assert/strict';
import { usesPjaxLogin, usesPjaxTimetable } from '../lib/server/erp_pjax.ts';
import { readFileSync } from 'node:fs';

test('official ERP login POST uses PJAX request mode',()=>{
  assert.equal(usesPjaxLogin('POST','https://newerp.kluniversity.in/index.php?r=site%2Flogin'),true);
});
test('attendance and CAPTCHA requests never receive login PJAX marker',()=>{
  assert.equal(usesPjaxLogin('POST','https://newerp.kluniversity.in/index.php?r=studentattendance%2Fstudentdailyattendance%2Fcourselist'),false);
  assert.equal(usesPjaxLogin('GET','https://newerp.kluniversity.in/index.php?r=site%2Fcaptcha'),false);
  assert.equal(usesPjaxLogin('GET','https://newerp.kluniversity.in/index.php?r=site%2Flogin'),false);
});
test('external host and unexpected paths cannot enable PJAX',()=>{
  assert.equal(usesPjaxLogin('POST','https://evil.example/index.php?r=site%2Flogin'),false);
  assert.equal(usesPjaxLogin('POST','http://newerp.kluniversity.in/index.php?r=site%2Flogin'),false);
  assert.equal(usesPjaxLogin('POST','https://newerp.kluniversity.in/other?r=site%2Flogin'),false);
});
test('upstream fetch explicitly uses official PJAX header conditionally',()=>{
  const source=readFileSync(new URL('../lib/server/erp.ts',import.meta.url),'utf8');
  assert.match(source,/usesPjaxLogin\(method,url\(path\)\)/);
  assert.match(source,/'X-PJAX':'true'/);
});

test('official timetable GET uses PJAX only for the fixed university timetable route',()=>{
  const route='https://newerp.kluniversity.in/index.php?r=timetables%2Funiversitymasteracademictimetableview%2Findividualstudenttimetableget&UniversityMasterAcademicTimetableView%5Bacademicyear%5D=29';
  assert.equal(usesPjaxTimetable('GET',route),true);
  assert.equal(usesPjaxTimetable('POST',route),false);
  assert.equal(usesPjaxTimetable('GET',route.replace('https:','http:')),false);
  assert.equal(usesPjaxTimetable('GET',route.replace('newerp.kluniversity.in','evil.example')),false);
  assert.equal(usesPjaxTimetable('GET','https://newerp.kluniversity.in/index.php?r=studentattendance%2Fstudentdailyattendance%2Fcourselist'),false);
  assert.equal(usesPjaxTimetable('GET','https://newerp.kluniversity.in/index.php?r=site%2Fcaptcha'),false);
});
test('upstream includes browser PJAX request headers only for timetable GET',()=>{
  const source=readFileSync(new URL('../lib/server/erp.ts',import.meta.url),'utf8');
  assert.match(source,/usesPjaxTimetable\(method,target\)/);
  assert.match(source,/timetablePjax\?\{/);
  assert.match(source,/'X-Requested-With':'XMLHttpRequest'/);
  assert.match(source,/'X-PJAX':'true'/);
});
