import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  classifyTimetableFailure, parseTimetable, timetableStructureFingerprint, TIMETABLE_RESULT_ROUTE,
} from '../lib/server/erp_timetable.ts';

test('classifies a complete and fragment-style university Forbidden page',()=>{
  assert.equal(classifyTimetableFailure('<div class="site-error"><h1>Forbidden</h1><h5>You are not allowed to perform this action.</h5></div>'),'TT_FORBIDDEN_HTML');
  assert.equal(classifyTimetableFailure('<h1>Forbidden</h1>'),'TT_FORBIDDEN_HTML');
});
test('distinguishes a session-expired ERP login from an empty timetable',()=>{
  const login='<form><input name="LoginForm[username]"/><input name="LoginForm[password]"/></form>';
  assert.equal(classifyTimetableFailure(login),'TT_LOGIN_REQUIRED');
  assert.throws(()=>parseTimetable(login),/TT_LOGIN_REQUIRED/);
});
test('recognizes a search form being returned instead of results',()=>{
  const form='<form method="get" action="/index.php"><input type="hidden" name="r" value="'+
    TIMETABLE_RESULT_ROUTE+'"/><select name="UniversityMasterAcademicTimetableView[academicyear]"></select></form>';
  assert.equal(classifyTimetableFailure(form),'TT_SEARCH_FORM');
  assert.throws(()=>parseTimetable(form),/TT_SEARCH_FORM/);
});
test('classifies empty and unfamiliar results without exposing ERP response',()=>{
  assert.equal(classifyTimetableFailure('<p>No results found</p>'),'TT_EMPTY_RESULT');
  assert.equal(classifyTimetableFailure('<table><tr><th>Name</th></tr><tr><td>private test value</td></tr></table>'),'TT_UNRECOGNIZED_TABLE');
  assert.equal(classifyTimetableFailure('<div>ERP welcome</div>'),'TT_UNEXPECTED_RESPONSE');
  assert.equal(classifyTimetableFailure('<h3>Academic Timetable</h3><table><tr><th>Period</th></tr></table>'),
    'TT_TIMETABLE_HEADER_CHANGED');
  assert.equal(classifyTimetableFailure('<nav>Student Timetable</nav><table><tr><th>Notice</th></tr></table>'),
    'TT_UNRECOGNIZED_TABLE');
  const text=String(()=>{});
  assert.doesNotMatch(JSON.stringify({
    code:classifyTimetableFailure('<table><tr><th>Name</th></tr><tr><td>PRIVATE-STUDENT-123</td></tr></table>'),
  }),/PRIVATE-STUDENT-123/);
});
test('API maps structural errors to fixed safe codes instead of generic TT_GRID_MISSING',()=>{
  const route=readFileSync(new URL('../app/api/erp/timetable/route.ts',import.meta.url),'utf8');
  for(const code of ['TT_LOGIN_REQUIRED','TT_FORBIDDEN_HTML','TT_SEARCH_FORM','TT_EMPTY_RESULT','TT_UNRECOGNIZED_TABLE','TT_TIMETABLE_HEADER_CHANGED','TT_UNEXPECTED_RESPONSE'])
    assert.match(route,new RegExp(code));
  assert.doesNotMatch(route,/return fail\(reason|return NextResponse\.json\(\{.*html/);
});

test('timetable structure fingerprint reports table shape and never raw cell contents',()=>{
  const html='<html><body><h3>Academic Timetable</h3>'+
    '<table><tr><th>Day</th><th>1</th><th>2</th><th>3</th></tr>'+
    '<tr><td>Mon</td><td>SECRET-STUDENT-ID</td><td>ROOM-C408</td><td>-</td></tr>'+
    '<tr><td>Tue</td><td>-</td><td>-</td><td>-</td></tr></table>'+
    '<meta name="csrf-token" content="VERY-PRIVATE-TOKEN"/></body></html>';
  const shape=timetableStructureFingerprint(html);
  assert.equal(shape,'TT_SHAPE_T1_D2_H1_N4_P3_W4_C4');
  assert.doesNotMatch(shape,/SECRET|STUDENT|ROOM|PRIVATE|csrf|C408/i);
});
test('diagnostic code character set is strictly numeric counts',()=>{
  const shape=timetableStructureFingerprint('<table><tr><th>User 123456</th><th>Password</th></tr></table>');
  assert.match(shape,/^TT_SHAPE_T\d{1,2}_D\d{1,2}_H\d{1,2}_N\d{1,2}_P\d{1,2}_W\d{1,2}_C\d{1,2}$/);
});
test('local API maps timetable errors to fixed safe structural diagnostics',()=>{
  const api=readFileSync(new URL('../app/api/erp/timetable/route.ts',import.meta.url),'utf8');
  assert.match(api,/process\.env\.NODE_ENV!=='production'/);
  assert.match(api,/TT_SHAPE_T\\d/);
  assert.match(api,/TT_TIMETABLE_HEADER_CHANGED\]'\s*\+\s*shape/);
  assert.doesNotMatch(api,/return fail\(reason/);
});
