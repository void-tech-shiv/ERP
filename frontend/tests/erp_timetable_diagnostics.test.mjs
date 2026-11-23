import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  classifyTimetableFailure, parseTimetable, TIMETABLE_RESULT_ROUTE,
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
  const text=String(()=>{});
  assert.doesNotMatch(JSON.stringify({
    code:classifyTimetableFailure('<table><tr><th>Name</th></tr><tr><td>PRIVATE-STUDENT-123</td></tr></table>'),
  }),/PRIVATE-STUDENT-123/);
});
test('API maps structural errors to fixed safe codes instead of generic TT_GRID_MISSING',()=>{
  const route=readFileSync(new URL('../app/api/erp/timetable/route.ts',import.meta.url),'utf8');
  for(const code of ['TT_LOGIN_REQUIRED','TT_FORBIDDEN_HTML','TT_SEARCH_FORM','TT_EMPTY_RESULT','TT_UNRECOGNIZED_TABLE','TT_UNEXPECTED_RESPONSE'])
    assert.match(route,new RegExp(code));
  assert.doesNotMatch(route,/return fail\(reason|return NextResponse\.json\(\{.*html/);
});
