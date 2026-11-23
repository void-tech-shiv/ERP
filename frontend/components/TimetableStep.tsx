'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, MapPin, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  DAY_NAMES, groupTimetableSessions, LTPS_LABELS, REFERENCE_SLOT_TIMES,
  sessionReferenceTime, sessionSlotLabel,
  type TimetableSlot,
} from '../lib/timetable_display';

type Option={value:string;label:string};
type Terms={years:Option[];semesters:Option[]};
type ClassSlot=TimetableSlot;
type Timetable={
  source:'erp';academicYear:string;semester:string;
  days:string[];periods:number[];classes:ClassSlot[];periodsInferred:boolean;
};
function isTerms(raw:unknown):raw is Terms {
  if(!raw||typeof raw!=='object')return false;
  const value=raw as Partial<Terms>;
  return [value.years,value.semesters].every(list=>
    Array.isArray(list)&&list.length>0&&list.length<=60&&list.every(o=>
      o&&typeof o.value==='string'&&/^\d{1,3}$/.test(o.value)&&
      typeof o.label==='string'&&o.label.length<=60));
}
function isTimetable(raw:unknown):raw is Timetable {
  if(!raw||typeof raw!=='object')return false;
  const value=raw as Partial<Timetable>;
  return value.source==='erp'&&typeof value.academicYear==='string'&&
    typeof value.semester==='string'&&Array.isArray(value.days)&&
    value.days.length>0&&value.days.length<=7&&
    value.days.every(d=>typeof d==='string'&&/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/.test(d))&&
    Array.isArray(value.periods)&&value.periods.length>=3&&value.periods.length<=32&&
    value.periods.every(p=>Number.isSafeInteger(p)&&p>=1&&p<=32)&&
    typeof value.periodsInferred==='boolean'&&
    Array.isArray(value.classes)&&value.classes.length<=220&&
    value.classes.every(s=>s&&typeof s.day==='string'&&value.days!.includes(s.day)&&
      value.periods!.includes(s.period)&&typeof s.raw==='string'&&s.raw.length<=280);
}
async function get<T>(path:string,signal?:AbortSignal):Promise<T> {
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',signal});
  const data:unknown=await response.json().catch(()=>null);
  if(!response.ok){
    const detail=data&&typeof data==='object'&&'error' in data&&typeof data.error==='string'
      ?data.error:'Could not load timetable from ERP.';
    throw new Error(response.status===401?'ERP session expired. Please sign in again.':detail);
  }
  return data as T;
}

export default function TimetableStep({
  currentYear='',currentSemester='',
}:{currentYear?:string;currentSemester?:string}){
  const [terms,setTerms]=useState<Terms|null>(null);
  const [year,setYear]=useState('');
  const [semester,setSemester]=useState('');
  const [timetable,setTimetable]=useState<Timetable|null>(null);
  const [loading,setLoading]=useState<'terms'|'timetable'|'idle'>('terms');
  const [error,setError]=useState('');
  const [activeDay,setActiveDay]=useState('all');

  const loadTerms=useCallback(async(signal?:AbortSignal)=>{
    setLoading('terms');setError('');
    try{
      const data=await get<unknown>('/api/erp/timetable/terms',signal);
      if(!isTerms(data))throw new Error('Invalid timetable session options from ERP.');
      if(signal?.aborted)return;
      setTerms(data);
      setYear(old=>data.years.some(x=>x.value===old)?old:
        data.years.find(x=>x.label===currentYear)?.value||'');
      setSemester(old=>data.semesters.some(x=>x.value===old)?old:
        data.semesters.find(x=>x.label===currentSemester)?.value||'');
    }catch(e){
      if(!signal?.aborted)setError(e instanceof Error?e.message:'Failed to load academic sessions.');
    }finally{if(!signal?.aborted)setLoading('idle');}
  },[currentYear,currentSemester]);

  useEffect(()=>{
    const controller=new AbortController();
    void loadTerms(controller.signal);
    return ()=>controller.abort();
  },[loadTerms]);

  async function sync(){
    if(!year||!semester||loading!=='idle')return;
    setLoading('timetable');setError('');setTimetable(null);setActiveDay('all');
    try{
      const params=new URLSearchParams({year,semester});
      const data=await get<unknown>('/api/erp/timetable?'+params.toString());
      if(!isTimetable(data))throw new Error('ERP returned an unexpected timetable layout.');
      if(data.academicYear!==terms?.years.find(x=>x.value===year)?.label||
         data.semester!==terms?.semesters.find(x=>x.value===semester)?.label)
        throw new Error('Timetable academic session did not match your selection.');
      setTimetable(data);
    }catch(e){
      setError(e instanceof Error?e.message:'Unable to fetch timetable.');
    }finally{setLoading('idle');}
  }

  const sessionsByDay=useMemo(()=>{
    const map=new Map<string,ReturnType<typeof groupTimetableSessions>>();
    for(const day of timetable?.days||[]){
      map.set(day,groupTimetableSessions(timetable?.classes||[],day));
    }
    return map;
  },[timetable]);
  const daysToShow=useMemo(()=>timetable?.days.filter(day=>
    activeDay==='all'||activeDay===day
  )||[],[timetable,activeDay]);

  const busy=loading!=='idle';

  return <div className="at-timetable at-time-redesign">
    <div className="at-time-heading">
      <div>
        <div className="at-section-label">MY WEEKLY SCHEDULE</div>
        <h1>Class timetable</h1>
        <p>Your registered courses, LTPS components, sections and rooms from ERP.</p>
      </div>
      <span className="at-session-badge"><ShieldCheck size={16}/> Authenticated ERP</span>
    </div>

    <section className="at-term-card at-time-session">
      <div className="at-term-card-heading">
        <div className="at-term-icon"><CalendarDays size={19}/></div>
        <div><strong>Academic session</strong><p>Select the year and semester to view your classes.</p></div>
      </div>
      <div className="at-term-controls">
        <label>Academic year
          <select value={year} onChange={event=>{setYear(event.target.value);setTimetable(null);setActiveDay('all')}} disabled={busy||!terms}>
            <option value="">{loading==='terms'?'Loading years…':'Select year'}</option>
            {terms?.years.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>Semester
          <select value={semester} onChange={event=>{setSemester(event.target.value);setTimetable(null);setActiveDay('all')}} disabled={busy||!terms}>
            <option value="">{loading==='terms'?'Loading semesters…':'Select semester'}</option>
            {terms?.semesters.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <button className="at-btn at-btn-primary" type="button" disabled={busy||!year||!semester}
          onClick={()=>void sync()}><RefreshCw size={17}/>
          {loading==='timetable'?'Syncing…':'Sync timetable'}</button>
        <button type="button" className="at-icon-button at-terms-reload" aria-label="Reload timetable terms"
          title="Reload timetable terms" disabled={busy} onClick={()=>void loadTerms()}>
          <RefreshCw size={18}/></button>
      </div>
    </section>

    {error&&<div role="alert" className="at-message at-message-error">{error}</div>}
    {loading==='timetable'&&<div className="at-panel at-time-loading">
      <span className="at-spinner"/> Reading your university timetable…
    </div>}
    {timetable&&<>
      <section className="at-time-meta-panel" aria-label="Class legend and reference timings">
        <div className="at-time-meta-top">
          <div className="at-time-weights">
            <span className="at-time-meta-caption">LTPS weights</span>
            {(['L','T','P','S'] as const).map(part=><span key={part}
              className={'at-time-weight at-time-weight--'+part}>
              <strong>{part}</strong> {LTPS_LABELS[part].name}
              <small>{LTPS_LABELS[part].weight}%</small>
            </span>)}
          </div>
          <span className="at-time-reference-note"><Clock3 size={15}/> Reference slot times · not verified by ERP</span>
        </div>
        <div className="at-time-slots-scroll">
          <div className="at-time-slots-legend">
            {REFERENCE_SLOT_TIMES.map(slot=><div className="at-time-slot-marker" key={slot.slot}>
              <strong>S{slot.slot}</strong><span>{slot.start} – {slot.end}</span>
            </div>)}
          </div>
        </div>
        {timetable.periodsInferred&&<p className="at-time-position-warning">
          ERP response had no readable period headers. Class slot numbers below are positions
          inferred from its columns; reference times above may not match those positions.
        </p>}
      </section>

      <div className="at-time-schedule-top">
        <div><h2>Weekly timetable</h2>
          <p>{timetable.academicYear} · {timetable.semester} · {timetable.days.length} teaching days</p></div>
        <span className="at-time-summary-count">
          {timetable.days.reduce((total,day)=>total+(sessionsByDay.get(day)?.length||0),0)} class sessions
        </span>
      </div>

      <nav className="at-time-day-tabs" aria-label="Timetable day filter">
        <button type="button" className={activeDay==='all'?'active':''}
          aria-pressed={activeDay==='all'} onClick={()=>setActiveDay('all')}>
          Full week
        </button>
        {timetable.days.map(day=><button type="button" key={day}
          className={activeDay===day?'active':''} aria-pressed={activeDay===day}
          onClick={()=>setActiveDay(day)}>{DAY_NAMES[day]||day}</button>)}
      </nav>

      <div className={'at-time-day-grid '+(activeDay!=='all'?'at-time-day-grid--single':'')}>
        {daysToShow.map((day)=>{
          const sessions=sessionsByDay.get(day)||[];
          const number=timetable.days.indexOf(day)+1;
          return <section className="at-time-day-card" key={day}
            aria-label={(DAY_NAMES[day]||day)+' classes'}>
            <header className="at-time-day-head">
              <span className="at-time-day-number">{String(number).padStart(2,'0')}</span>
              <div><h3>{DAY_NAMES[day]||day}</h3>
                <p>{sessions.length?'Scheduled classes':'No classes listed'}</p></div>
              <span className="at-time-day-count">
                {sessions.length} {sessions.length===1?'class':'classes'}
              </span>
            </header>
            <div className="at-time-day-lessons">
              {sessions.map((session)=>{
                const kind=session.component||'unknown';
                const referenceTime=sessionReferenceTime(session,timetable.periodsInferred);
                return <article className={'at-time-lesson at-time-lesson--'+kind}
                  key={day+'-'+session.startPeriod+'-'+session.endPeriod+'-'+(session.courseCode||session.raw)}>
                  <div className="at-time-lesson-left">
                    {referenceTime&&<span className="at-time-lesson-time">{referenceTime}</span>}
                    <span className="at-time-lesson-slots">{sessionSlotLabel(session)}</span>
                    {!referenceTime&&<small>{timetable.periodsInferred?'Period position':'Time not available'}</small>}
                  </div>
                  <div className="at-time-lesson-right">
                    <div className="at-time-lesson-title">
                      <strong>{session.courseCode||session.raw}</strong>
                      {session.component&&<span className={'at-time-type at-time-type--'+session.component}
                        title={LTPS_LABELS[session.component].name}>{session.component}</span>}
                      {session.section&&<span className="at-time-lesson-section">{session.section}</span>}
                    </div>
                    <div className="at-time-lesson-room">
                      <MapPin size={13}/>{session.room||'Room not listed'}
                    </div>
                  </div>
                </article>;
              })}
              {!sessions.length&&<div className="at-time-no-lessons">No classes scheduled for this day.</div>}
            </div>
          </section>;
        })}
      </div>
      <p className="at-time-note"><ShieldCheck size={16}/>
        Only class details returned by your authenticated university ERP session are shown.
        Consecutive identical periods are combined into one card. The S1–S11 times are
        provided as a reference, not confirmed by ERP; check the university timetable
        for official start times, especially when period positions are inferred.</p>
    </>}
    {!timetable&&loading==='idle'&&!error&&
      <div className="at-time-empty"><CalendarDays size={30}/>
        <strong>Your weekly timetable will appear here</strong>
        <p>Select year and semester, then click Sync timetable.</p></div>}
  </div>;
}
