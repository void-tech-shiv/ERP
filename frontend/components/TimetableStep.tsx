'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, MapPin, RefreshCw, ShieldCheck } from 'lucide-react';

type Option={value:string;label:string};
type Terms={years:Option[];semesters:Option[]};
type ClassSlot={
  day:string;period:number;raw:string;courseCode:string|null;
  component:'L'|'T'|'P'|'S'|null;section:string|null;room:string|null;
};
type Timetable={
  source:'erp';academicYear:string;semester:string;
  days:string[];periods:number[];classes:ClassSlot[];
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
    Array.isArray(value.periods)&&value.periods.length>=3&&value.periods.length<=16&&
    value.periods.every(p=>Number.isSafeInteger(p)&&p>=1&&p<=16)&&
    Array.isArray(value.classes)&&value.classes.length<=160&&
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

export default function TimetableStep(){
  const [terms,setTerms]=useState<Terms|null>(null);
  const [year,setYear]=useState('');
  const [semester,setSemester]=useState('');
  const [timetable,setTimetable]=useState<Timetable|null>(null);
  const [loading,setLoading]=useState<'terms'|'timetable'|'idle'>('terms');
  const [error,setError]=useState('');

  const loadTerms=useCallback(async(signal?:AbortSignal)=>{
    setLoading('terms');setError('');
    try{
      const data=await get<unknown>('/api/erp/timetable/terms',signal);
      if(!isTerms(data))throw new Error('Invalid timetable session options from ERP.');
      if(signal?.aborted)return;
      setTerms(data);
      setYear(old=>data.years.some(x=>x.value===old)?old:'');
      setSemester(old=>data.semesters.some(x=>x.value===old)?old:'');
    }catch(e){
      if(!signal?.aborted)setError(e instanceof Error?e.message:'Failed to load academic sessions.');
    }finally{if(!signal?.aborted)setLoading('idle');}
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    void loadTerms(controller.signal);
    return ()=>controller.abort();
  },[loadTerms]);

  async function sync(){
    if(!year||!semester||loading!=='idle')return;
    setLoading('timetable');setError('');setTimetable(null);
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
  const classMap=useMemo(()=>{
    const map=new Map<string,ClassSlot>();
    for(const item of timetable?.classes||[])map.set(item.day+'|'+item.period,item);
    return map;
  },[timetable]);
  const busy=loading!=='idle';
  return <div className="at-timetable">
    <div className="at-time-heading">
      <div><div className="at-section-label">MY WEEKLY SCHEDULE</div>
        <h1>Class timetable</h1><p>Courses, LTPS components, sections and rooms from your ERP.</p>
      </div>
      <span className="at-session-badge"><ShieldCheck size={16}/> Authenticated ERP</span>
    </div>

    <section className="at-term-card at-time-session">
      <div className="at-term-card-heading"><div className="at-term-icon"><CalendarDays size={19}/></div>
        <div><strong>Academic session</strong><p>Select an academic year and semester to view classes.</p></div></div>
      <div className="at-term-controls">
        <label>Academic year
          <select value={year} onChange={event=>{setYear(event.target.value);setTimetable(null)}} disabled={busy||!terms}>
            <option value="">{loading==='terms'?'Loading years…':'Select year'}</option>
            {terms?.years.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>Semester
          <select value={semester} onChange={event=>{setSemester(event.target.value);setTimetable(null)}} disabled={busy||!terms}>
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
      <div className="at-time-grid-heading">
        <div><h2>Weekly timetable</h2>
          <p>{timetable.academicYear} · {timetable.semester} · {timetable.days.length} teaching days</p></div>
        <span><Clock3 size={15}/> Period numbers from ERP</span>
      </div>
      <section className="at-panel at-time-grid-panel">
        <div className="at-time-grid-scroll">
          <table className="at-time-grid">
            <thead><tr><th scope="col" className="at-time-sticky">Day</th>
              {timetable.periods.map(period=><th scope="col" key={period}>S{period}</th>)}</tr></thead>
            <tbody>{timetable.days.map(day=><tr key={day}>
              <th scope="row" className="at-time-sticky">{day}</th>
              {timetable.periods.map(period=>{
                const current=classMap.get(day+'|'+period);
                return <td key={period}>
                  {current&&<div className="at-time-class" title={current.raw}>
                    <strong>{current.courseCode||current.raw}</strong>
                    {current.component&&<span className="at-time-component">{current.component}</span>}
                    {current.section&&<small>{current.section}</small>}
                    {current.room&&<span className="at-time-room"><MapPin size={12}/>{current.room}</span>}
                    {!current.courseCode&&<small>ERP timetable entry</small>}
                  </div>}
                </td>;
              })}
            </tr>)}</tbody>
          </table>
        </div>
      </section>
      <p className="at-time-note"><ShieldCheck size={16}/>
        Times are intentionally omitted because this ERP response provides period numbers,
        not verified start and end times. Confirm daily timing with your university schedule.</p>
    </>}
    {!timetable&&loading==='idle'&&!error&&
      <div className="at-time-empty"><CalendarDays size={30}/>
        <strong>Your weekly timetable will appear here</strong>
        <p>Select year and semester, then click Sync timetable.</p></div>}
  </div>;
}
