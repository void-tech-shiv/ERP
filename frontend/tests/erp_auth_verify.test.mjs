import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectERPPage } from '../lib/server/erp_auth_verify.ts';

const student='2500000001';
test('verifies observed dashboard Welcome ID with nested formatting',()=>{
  const e=inspectERPPage('<html><body><h2>Welcome <b>'+student+'</b></h2><a href="/index.php?r=studentattendance">Attendance</a></body></html>',student);
  assert.equal(e.verified,true);
  assert.equal(e.identityVisible,true);
  assert.equal(e.loginForm,false);
});
test('accepts a changed greeting only when visible identity and dashboard navigation coexist',()=>{
  const html='<html><body><div>Student '+student+'</div><a href="/index.php?r=studentattendance">Attendance</a></body></html>';
  assert.equal(inspectERPPage(html,student).verified,true);
});
test('rejects a login form even when its markup contains the same student ID',()=>{
  const html='<html><body><h2>Welcome '+student+'</h2><form><input name="LoginForm[password]"></form></body></html>';
  const e=inspectERPPage(html,student);
  assert.equal(e.loginForm,true);
  assert.equal(e.verified,false);
});
test('does not treat an unrelated page with the ID as authenticated',()=>{
  const html='<html><body><p>Student '+student+'</p></body></html>';
  const e=inspectERPPage(html,student);
  assert.equal(e.identityVisible,true);
  assert.equal(e.dashboardMarkers,false);
  assert.equal(e.verified,false);
});
test('rejects login page with ID only in form value',()=>{
  const html='<html><body><form><input name="LoginForm[username]" value="'+student+'"><input name="LoginForm[captcha]"></form></body></html>';
  assert.equal(inspectERPPage(html,student).verified,false);
});
test('ignores ID injected in JavaScript',()=>{
  const html='<html><body><script>const id="'+student+'"</script><a href="studentattendance">Attendance</a></body></html>';
  assert.equal(inspectERPPage(html,student).verified,false);
});
test('different identity cannot pass verification',()=>{
  const html='<html><body>Welcome 2500000002</body></html>';
  assert.equal(inspectERPPage(html,student).verified,false);
});
