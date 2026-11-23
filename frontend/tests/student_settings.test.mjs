import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_STUDENT_PREFERENCES,readStudentPreferences,writeStudentPreferences,
  sanitizeStudentPreferences,
} from '../lib/student_preferences.ts';

const mockStorage=()=>{
  const entries=new Map();
  return {
    getItem:key=>entries.has(key)?entries.get(key):null,
    setItem:(key,value)=>entries.set(key,value),
    removeItem:key=>entries.delete(key),
    entries,
  };
};

test('new student defaults to hidden CGPA and blank profile, year and semester',()=>{
  assert.deepEqual(readStudentPreferences(mockStorage(),'student-one'),DEFAULT_STUDENT_PREFERENCES);
  assert.equal(DEFAULT_STUDENT_PREFERENCES.showCgpa,false);
});

test('preferences save and load per authenticated student without sharing account settings',()=>{
  const storage=mockStorage();
  writeStudentPreferences(storage,'student-one',{
    nickname:'Sam',currentYear:'2026-2027',currentSemester:'Even Sem',showCgpa:true,
  });
  assert.deepEqual(readStudentPreferences(storage,'student-one'),{
    nickname:'Sam',currentYear:'2026-2027',currentSemester:'Even Sem',showCgpa:true,
  });
  assert.deepEqual(readStudentPreferences(storage,'student-two'),DEFAULT_STUDENT_PREFERENCES);
  assert.equal([...storage.entries.keys()][0],'attendly:settings:v1:student-one');
});

test('invalid and unexpected settings cannot introduce credentials, grades or arbitrary fields',()=>{
  const raw={
    nickname:'  First    Name '.repeat(7),
    currentYear:'1234-untrusted',
    currentSemester:'Unknown',
    showCgpa:'true',
    password:'very-private',cgpa:9.54,attendance:42,
  };
  const prefs=sanitizeStudentPreferences(raw);
  assert.equal(prefs.nickname.length<=32,true);
  assert.equal(prefs.currentYear,'');
  assert.equal(prefs.currentSemester,'');
  assert.equal(prefs.showCgpa,false);
  assert.deepEqual(Object.keys(prefs).sort(),['currentSemester','currentYear','nickname','showCgpa']);
});

test('legacy nickname is migrated only into the new preferences object',()=>{
  const storage=mockStorage();
  storage.setItem('attendly:nickname:v1:student-one','  Old Nick  ');
  assert.deepEqual(readStudentPreferences(storage,'student-one'),{
    nickname:'Old Nick',currentYear:'',currentSemester:'',showCgpa:false,
  });
});

test('bad saved JSON and disabled storage fail closed to defaults',()=>{
  const storage=mockStorage();
  storage.setItem('attendly:settings:v1:student-one','{broken');
  assert.deepEqual(readStudentPreferences(storage,'student-one'),DEFAULT_STUDENT_PREFERENCES);
  const unavailable={getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')}};
  assert.deepEqual(readStudentPreferences(unavailable,'student-two'),DEFAULT_STUDENT_PREFERENCES);
});

test('Settings is wired into sidebar and Overview via shared props',()=>{
  const shell=readFileSync(new URL('../components/AttendanceStep.tsx',import.meta.url),'utf8');
  const overview=readFileSync(new URL('../components/OverviewStep.tsx',import.meta.url),'utf8');
  const timetable=readFileSync(new URL('../components/TimetableStep.tsx',import.meta.url),'utf8');
  assert.match(shell,/view==='settings' \? <SettingsStep/);
  assert.match(shell,/>Settings<\/span>/);
  assert.match(shell,/preferences=\{activePreferences\}/);
  assert.match(shell,/onSave=\{savePreferences\}/);
  assert.match(shell,/nickname=\{activePreferences\.nickname\}/);
  assert.match(shell,/showCgpa=\{activePreferences\.showCgpa\}/);
  assert.match(shell,/onNicknameChange=\{nickname=>savePreferences/);
  assert.match(shell,/onCgpaVisibilityChange=\{showCgpa=>savePreferences/);
  assert.match(timetable,/currentYear=''/);
  assert.match(timetable,/data\.years\.find\(x=>x\.label===currentYear\)/);
  assert.match(overview,/if\(!cgpaVisible\)return;/);
});

test('Settings requires valid paired academic term selections and deliberate save',()=>{
  const ui=readFileSync(new URL('../components/SettingsStep.tsx',import.meta.url),'utf8');
  assert.match(ui,/hasYear!==hasSemester/);
  assert.match(ui,/terms\?\.years\.includes\(value\.currentYear\)/);
  assert.match(ui,/terms\?\.semesters\.includes\(value\.currentSemester\)/);
  assert.match(ui,/onSave\(value\)/);
  assert.match(ui,/Save settings/);
  assert.match(ui,/role="switch" aria-label="Show CGPA on Overview"/);
  assert.match(ui,/aria-checked=\{draft\.showCgpa\}/);
  assert.doesNotMatch(ui,/api\/erp\/cgpa|localStorage\.setItem|writeERP\(/);
});

test('Settings remains responsive and never advertises grade storage',()=>{
  const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../components/SettingsStep.tsx',import.meta.url),'utf8');
  assert.match(css,/\.at-settings-term-fields\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/\.at-settings-term-fields\{grid-template-columns:1fr\}/);
  assert.match(ui,/CGPA is hidden by default/);
  assert.match(ui,/grades and CGPA values are never saved/);
});
