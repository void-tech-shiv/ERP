import test from 'node:test';
import assert from 'node:assert/strict';
import { usesPjaxLogin, usesTimetableDocumentGet } from '../lib/server/erp_pjax.ts';
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
  assert.match(source,/usesPjaxLogin\(method,target\)/);
  assert.match(source,/officialLoginPost \? \{'X-PJAX':'true'\}/);
  assert.match(source,/'X-PJAX':'true'/);
});

test('only fixed first-party timetable GET gets document-style request context',()=>{
  const route='https://newerp.kluniversity.in/index.php?r=timetables%2Funiversitymasteracademictimetableview%2Findividualstudenttimetableget&UniversityMasterAcademicTimetableView%5Bacademicyear%5D=29';
  assert.equal(usesTimetableDocumentGet('GET',route),true);
  assert.equal(usesTimetableDocumentGet('POST',route),false);
  assert.equal(usesTimetableDocumentGet('GET',route.replace('https:','http:')),false);
  assert.equal(usesTimetableDocumentGet('GET',route.replace('newerp.kluniversity.in','evil.example')),false);
  assert.equal(usesTimetableDocumentGet('GET','https://newerp.kluniversity.in/index.php?r=studentattendance%2Fstudentdailyattendance%2Fcourselist'),false);
  assert.equal(usesTimetableDocumentGet('GET','https://newerp.kluniversity.in/index.php?r=site%2Fcaptcha'),false);
});

test('upstream does not force PJAX/XHR for a timetable document GET',()=>{
  const source=readFileSync(new URL('../lib/server/erp.ts',import.meta.url),'utf8');
  assert.match(source,/usesTimetableDocumentGet\(method,target\)/);
  assert.match(source,/timetableDocumentGet\?\{/);
  assert.match(source,/'Accept':'text\/html,application\/xhtml\+xml,application\/xml/);
  const getBlock=source.slice(source.indexOf("} : {",source.indexOf("export async function upstream")),
    source.indexOf("}),",source.indexOf("export async function upstream"))+3);
  assert.doesNotMatch(getBlock,/'X-PJAX'\s*:/);
  assert.doesNotMatch(getBlock,/'X-Requested-With'\s*:/);
  assert.match(source,/usesPjaxLogin\(method,target\)/);
  assert.match(source,/officialLoginPost \? \{'X-PJAX':'true'\}/);
});
