import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ui=readFileSync(new URL('../app/private-test/page.tsx',import.meta.url),'utf8');
const auth=readFileSync(new URL('../app/api/erp/login/route.ts',import.meta.url),'utf8');

test('login-only page does not request academic years or attendance',()=>{
  assert.doesNotMatch(ui,/\/api\/erp\/terms|\/api\/erp\/attendance/);
  assert.match(ui,/ERP Login Verified/);
  assert.match(ui,/Verify ERP login/);
});

test('backend login route does not access attendance register',()=>{
  assert.doesNotMatch(auth,/studentattendance|attendanceFormDetected|attendanceFormAccessible|attendanceProbe/);
});

test('backend success requires identity verification, not redirect status alone',()=>{
  assert.match(auth,/inspectERPPage\(html,username\)/);
  assert.match(auth,/if\(evidence\.verified\)/);
  assert.match(auth,/if\(!verified\) return failure/);
  assert.match(auth,/verified:true,stage:'login-only'/);
});

test('front end only shows verified after explicit success result',()=>{
  assert.match(ui,/result\?\.ok!==true \|\| result\?\.verified!==true/);
  assert.match(ui,/setStage\('authenticated'\)/);
});
