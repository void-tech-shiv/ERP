import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DAY_NAMES,groupTimetableSessions,LTPS_LABELS,REFERENCE_SLOT_TIMES,
  sessionReferenceTime,sessionSlotLabel,
} from '../lib/timetable_display.ts';

const mk=(day,period,overrides={})=>({
  day,period,raw:'25CS2207E-L - S-3 - RoomNo-C107',
  courseCode:'25CS2207E',component:'L',section:'S-3',room:'C107',...overrides,
});

test('adjacent duplicate ERP class slots become one session',()=>{
  const sessions=groupTimetableSessions([
    mk('Mon',4),mk('Mon',3),mk('Mon',8,{component:'P',raw:'25CS2207E-P - S-3 - RoomNo-C107'}),
  ],'Mon');
  assert.equal(sessions.length,2);
  assert.equal(sessions[0].startPeriod,3);
  assert.equal(sessions[0].endPeriod,4);
  assert.equal(sessions[0].periodCount,2);
  assert.equal(sessionSlotLabel(sessions[0]),'S3 – S4');
  assert.equal(sessionSlotLabel(sessions[1]),'S8');
});
test('subject, component, section, room changes and gaps never merge',()=>{
  const variants=[
    mk('Mon',3),
    mk('Mon',4,{component:'S'}),
    mk('Mon',5,{section:'S-5'}),
    mk('Mon',6,{room:'C410'}),
    mk('Mon',7,{courseCode:'25CS3112E'}),
    mk('Mon',9),
  ];
  assert.equal(groupTimetableSessions(variants,'Mon').length,6);
});
test('per-day grouping never mixes Monday and Tuesday slots',()=>{
  const source=[mk('Mon',3),mk('Mon',4),mk('Tue',3),mk('Tue',4)];
  const mon=groupTimetableSessions(source,'Mon');
  const tue=groupTimetableSessions(source,'Tue');
  assert.equal(mon.length,1);
  assert.equal(tue.length,1);
  assert.equal(mon[0].day,'Mon');
  assert.equal(tue[0].day,'Tue');
});
test('only valid adjacent periods group; empty sessions are supported',()=>{
  assert.deepEqual(groupTimetableSessions([], 'Fri'),[]);
  assert.equal(groupTimetableSessions([mk('Fri',3),mk('Fri',5)], 'Fri').length,2);
  assert.equal(groupTimetableSessions([mk('Fri',-2),mk('Fri',3)], 'Fri').length,1);
});
test('reference slot timings never become verified times for inferred slots',()=>{
  const sess={startPeriod:3,endPeriod:4};
  assert.equal(sessionReferenceTime(sess,true),null);
  assert.equal(sessionReferenceTime(sess,false),'9:20 AM – 11:00 AM');
  assert.equal(sessionReferenceTime({startPeriod:12,endPeriod:13},false),null);
  assert.equal(REFERENCE_SLOT_TIMES.length,11);
  assert.equal(REFERENCE_SLOT_TIMES[10].end,'5:30 PM');
});
test('LTPS badges use original requested weights and full weekday labels',()=>{
  assert.deepEqual(['L','T','P','S'].map(x=>LTPS_LABELS[x].weight),[100,50,50,25]);
  assert.equal(DAY_NAMES.Mon,'Monday');
  assert.equal(DAY_NAMES.Sat,'Saturday');
});
test('UI retains secure API, day filters, dynamic ERP sessions and no persisted timetable',()=>{
  const ui=readFileSync(new URL('../components/TimetableStep.tsx',import.meta.url),'utf8');
  assert.match(ui,/groupTimetableSessions\(timetable\?\.classes\|\|\[\],day\)/);
  assert.match(ui,/activeDay==='all'\|\|activeDay===day/);
  assert.match(ui,/sessionReferenceTime\(session,timetable.periodsInferred\)/);
  assert.match(ui,/timetable\.days\.map\(day=>/);
  assert.match(ui,/\/api\/erp\/timetable\?/);
  assert.match(ui,/timetable\.academicYear/);
  assert.doesNotMatch(ui,/localStorage|sessionStorage|indexedDB|mockTimetable|sampleLessons/);
});
test('day-card CSS includes responsive 3/2/1 column layouts',()=>{
  const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
  assert.match(css,/\.at-time-day-grid\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:1330px\)/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/\.at-time-day-grid,\.at-time-day-grid--single\{grid-template-columns:1fr\}/);
});
