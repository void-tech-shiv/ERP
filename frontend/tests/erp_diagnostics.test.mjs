import test from 'node:test';
import assert from 'node:assert/strict';
import {cookieTransition, attendanceFormDetected} from '../lib/server/erp_diagnostics.ts';

test('cookie diagnostics report counts, never values',()=>{
  const before={SESSION:'private-value-1',csrf:'secret'};
  const after={SESSION:'private-value-2',csrf:'secret',_identity:'private-id'};
  const signal=cookieTransition(before,after);
  assert.deepEqual(signal,{before:2,after:3,changed:true});
  assert.equal(JSON.stringify(signal).includes('private'),false);
});

test('cookie diagnostics identify unchanged cookie jars',()=>{
  assert.deepEqual(cookieTransition({SESSION:'abc'},{SESSION:'abc'}),{before:1,after:1,changed:false});
});

test('attendance form requires year, semester and CSRF',()=>{
  const html='<html><form><input name="_csrf" value="not-exported"><select name="DynamicModel[academicyear]"></select><select name="DynamicModel[semesterid]"></select></form></html>';
  assert.equal(attendanceFormDetected(html),true);
});

test('login page cannot be mistaken for authenticated attendance form',()=>{
  const html='<form><input name="LoginForm[username]"><input name="LoginForm[captcha]"></form>';
  assert.equal(attendanceFormDetected(html),false);
});

test('partial semester/year form is rejected',()=>{
  assert.equal(attendanceFormDetected('<select name="DynamicModel[academicyear]"></select>'),false);
});
