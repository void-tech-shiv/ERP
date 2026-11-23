'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, BookOpen, CalendarDays, Clock3, Eye, EyeOff,
  GraduationCap, MapPin, RefreshCw, ShieldCheck, Sparkles,
} from 'lucide-react';
import { fmt, totals, type Course } from '../lib/calculator';
import {
  DAY_NAMES, groupTimetableSessions, LTPS_LABELS, sessionReferenceTime,
  sessionSlotLabel, type TimetableSlot,
} from '../lib/timetable_display';

type Terms={years:string[];semesters:string[]};
type Snapshot={
  academicYear:string;semester:string;courses:Course[];
  savedAt:string;cached:boolean;
};
export type TimetablePayload={
  source:'erp';academicYear:string;semester:string;
  periods:number[];days:string[];classes:TimetableSlot[];periodsInferred:boolean;
};
export type OverviewTimetableCache={key:string;value:TimetablePayload;loadedAt:number};
type TimetableOptions={years:{value:string;label:string}[];semesters:{value:string;label:string}[]};
type View='attendance'|'cgpa'|'seating'|'timetable'|'settings';
type Props={
  studentId:string;
  nickname:string;
  showCgpa:boolean;
  onCgpaVisibilityChange:(value:boolean)=>void;
  terms:Terms|null;
  year:string;
  semester:string;
  autoLoadCurrentSession:boolean;
  cachedTimetable:OverviewTimetableCache|null;
  onTimetableLoaded:(next:OverviewTimetableCache)=>void;
  attendance:Snapshot|null;
  attendanceBusy:boolean;
  attendanceError:string;
  onRefreshAttendance:()=>Promise<void>;
  onNavigate:(view:View)=>void;
};

async function getJson(path:string,signal?:AbortSignal):Promise<unknown>{
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',signal});
  const value:unknown=await response.json().catch(()=>null);
  if(!response.ok){
    const error=value&&typeof value==='object'&&'error' in value&&
      typeof value.error==='string'?value.error:'ERP request failed.';
    throw new Error(response.status===401?'ERP session expired. Sign in again.':error);
  }
  return value;
}
function isOptions(v:unknown):v is TimetableOptions{
  if(!v||typeof v!=='object')return false;
  const o=v as Partial<TimetableOptions>;
  return [o.years,o.semesters].every(list=>Array.isArray(list)&&list.length>0&&list.length<=60&&
    list.every(item=>item&&typeof item.value==='string'&&/^\d{1,3}$/.test(item.value)&&
      typeof item.label==='string'&&item.label.length<=60));
}
function isTimetable(v:unknown,year:string,semester:string):v is TimetablePayload{
  if(!v||typeof v!=='object')return false;
  const t=v as Partial<TimetablePayload>;
  return t.source==='erp'&&t.academicYear===year&&t.semester===semester&&
    Array.isArray(t.days)&&t.days.length<=7&&
    t.days.every(d=>typeof d==='string'&&Object.hasOwn(DAY_NAMES,d))&&
    Array.isArray(t.periods)&&t.periods.length>=3&&t.periods.length<=32&&
    t.periods.every(p=>Number.isSafeInteger(p)&&p>=1&&p<=32)&&
    typeof t.periodsInferred==='boolean'&&
    Array.isArray(t.classes)&&t.classes.length<=220&&
    t.classes.every(slot=>slot&&typeof slot.day==='string'&&t.days!.includes(slot.day)&&
      Number.isSafeInteger(slot.period)&&t.periods!.includes(slot.period)&&
      typeof slot.raw==='string'&&slot.raw.length<=280);
}
function greeting(hour:number):string{
  return hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';
}
const todayKey=(value:Date)=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][value.getDay()];

export default function OverviewStep({
  studentId,terms,year,semester,
  nickname,showCgpa,onCgpaVisibilityChange,
  autoLoadCurrentSession,cachedTimetable,onTimetableLoaded,
  attendance,attendanceBusy,attendanceError,onRefreshAttendance,onNavigate,
}:Props){
  const [now,setNow]=useState<Date|null>(null);
  const [timetable,setTimetable]=useState<{key:string;value:TimetablePayload}|null>(null);
  const [loadingTimetable,setLoadingTimetable]=useState(false);
  const [timetableError,setTimetableError]=useState('');
  const [autoCompleteKey,setAutoCompleteKey]=useState('');
  const autoStarted=useRef(new Set<string>());
  const refreshInFlight=useRef(false);
  const cgpaVisible=showCgpa;
  const [cgpa,setCgpa]=useState<number|null>(null);
  const [cgpaLoading,setCgpaLoading]=useState(false);
  const [cgpaError,setCgpaError]=useState('');

  // Preferences are owned by the authenticated workspace and shared with Settings.
  useEffect(()=>{
    setNow(new Date());
    const clock=window.setInterval(()=>setNow(new Date()),60_000);
    return ()=>window.clearInterval(clock);
  },[studentId]);
  const currentKey=year+'|'+semester;
  const shownAttendance=attendance&&attendance.academicYear===year&&
    attendance.semester===semester?attendance:null;
  const attendanceTotals=useMemo(()=>{
    if(!shownAttendance)return null;
    const rows=shownAttendance.courses.map(totals);
    const attended=rows.reduce((sum,row)=>sum+row.a,0);
    const conducted=rows.reduce((sum,row)=>sum+row.t,0);
    return {
      percent:conducted?attended/conducted*100:null,
      subjects:shownAttendance.courses.length,
      attended,conducted,
    };
  },[shownAttendance]);
  const courseNames=useMemo(()=>new Map<string,string>(
    (shownAttendance?.courses||[]).map(course=>[course.code,course.name] as const)
  ),[shownAttendance]);

  const localDay=now?todayKey(now):null;
  const liveTimetable=timetable?.key===currentKey?timetable.value:
    cachedTimetable?.key===currentKey?cachedTimetable.value:null;
  const todaySessions=useMemo(()=>
    localDay&&liveTimetable?groupTimetableSessions(liveTimetable.classes,localDay):[],
    [localDay,liveTimetable]
  );
  const canSync=Boolean(year&&semester&&terms?.years.includes(year)&&
    terms?.semesters.includes(semester));
  const overviewBusy=attendanceBusy||loadingTimetable||cgpaLoading;
  const readyForCGPA=!autoLoadCurrentSession||!canSync||autoCompleteKey===currentKey;

  const refreshOverview=useCallback(async()=>{
    if(!canSync||refreshInFlight.current||attendanceBusy)return;
    refreshInFlight.current=true;
    const requestedKey=currentKey;
    setTimetableError('');
    setLoadingTimetable(true);
    try{
      // Sequential requests avoid concurrent upstream ERP session/cookie rotations.
      // A failed attendance request does not prevent the timetable being loaded.
      await onRefreshAttendance();
      const rawOptions=await getJson('/api/erp/timetable/terms');
      if(!isOptions(rawOptions))throw new Error('ERP returned invalid timetable session options.');
      const y=rawOptions.years.find(x=>x.label===year);
      const s=rawOptions.semesters.find(x=>x.label===semester);
      if(!y||!s)throw new Error('This academic session is not available in ERP timetable.');
      const params=new URLSearchParams({year:y.value,semester:s.value});
      const result=await getJson('/api/erp/timetable?'+params.toString());
      if(!isTimetable(result,year,semester))
        throw new Error('ERP returned an invalid timetable for the selected semester.');
      const nextCache={key:requestedKey,value:result,loadedAt:Date.now()};
      setTimetable(nextCache);
      onTimetableLoaded(nextCache);
    }catch(error){
      setTimetableError(error instanceof Error?error.message:'Unable to retrieve timetable.');
    }finally{
      refreshInFlight.current=false;
      setAutoCompleteKey(requestedKey);
      setLoadingTimetable(false);
    }
  },[canSync,attendanceBusy,currentKey,year,semester,onRefreshAttendance,onTimetableLoaded]);

  // When Settings has a valid current semester, preload the authenticated
  // attendance and today's timetable once per selected term on entry.
  // The in-flight guard also prevents React StrictMode from duplicating requests.
  useEffect(()=>{
    if(!autoLoadCurrentSession||!canSync||attendanceBusy||
      refreshInFlight.current||autoStarted.current.has(currentKey))return;
    autoStarted.current.add(currentKey);
    // Reuse an authenticated in-memory snapshot only while it is fresh.
    const freshTimetable=cachedTimetable?.key===currentKey&&
      Date.now()-cachedTimetable.loadedAt<5*60*1000;
    const freshAttendance=shownAttendance&&!shownAttendance.cached&&
      Date.now()-new Date(shownAttendance.savedAt).getTime()<5*60*1000;
    if(freshTimetable&&freshAttendance){
      setAutoCompleteKey(currentKey);
      return;
    }
    void refreshOverview();
  },[autoLoadCurrentSession,canSync,attendanceBusy,currentKey,
    cachedTimetable,shownAttendance,refreshOverview]);

  // The sensitive CGPA is requested only if the student enabled Show.
  // Hide immediately removes it from the overview state and aborts pending fetch.
  useEffect(()=>{
    if(!cgpaVisible||!readyForCGPA)return;
    const controller=new AbortController();
    async function fetchCGPA(){
      setCgpa(null);setCgpaError('');setCgpaLoading(true);
      try{
        const raw=await getJson('/api/erp/cgpa',controller.signal);
        const v=raw&&typeof raw==='object'&&'source' in raw&&'cgpa' in raw?
          raw as {source:unknown;cgpa:unknown}:null;
        if(v?.source!=='erp'||typeof v.cgpa!=='number'||
          !Number.isFinite(v.cgpa)||v.cgpa<0||v.cgpa>10)
          throw new Error('ERP returned an invalid CGPA.');
        if(!controller.signal.aborted)setCgpa(v.cgpa);
      }catch(error){
        if(!controller.signal.aborted)
          setCgpaError(error instanceof Error?error.message:'Unable to load CGPA.');
      }finally{if(!controller.signal.aborted)setCgpaLoading(false);}
    }
    void fetchCGPA();
    return ()=>controller.abort();
  },[cgpaVisible,readyForCGPA,studentId]);
  function toggleCGPA(){
    if(cgpaVisible){setCgpa(null);setCgpaError('');setCgpaLoading(false);}
    onCgpaVisibilityChange(!cgpaVisible);
  }

  return <div className="at-home-overview">
    <section className="at-home-hero">
      <div className="at-home-eyebrow"><Sparkles size={15}/> YOUR STUDENT OVERVIEW</div>
      <h1>{now?greeting(now.getHours()):'Welcome back'}, {nickname||'Student'}.</h1>
      <p>Today&apos;s classes, semester progress and academic results in one place.</p>
      <div className="at-home-hero-foot">
        <span><CalendarDays size={15}/>
          {now?new Intl.DateTimeFormat('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(now):'Today'}
        </span>
      </div>
    </section>

    <section className="at-home-session at-panel" aria-label="Current academic session">
      <div className="at-home-session-heading"><div>
        <div className="at-section-label">CURRENT SEMESTER</div>
        <h2>Your current academic session</h2>
        <p>Your saved semester from Settings. Attendance and today's timetable load automatically.</p>
      </div><div className="at-home-session-actions">
        <span className="at-home-authenticated"><ShieldCheck size={15}/> Secure ERP session</span>
        <button type="button" className="at-home-edit-settings"
          onClick={()=>onNavigate('settings')}>Edit Settings <ArrowRight size={14}/></button>
      </div></div>
      <div className="at-home-session-fields at-home-session-readonly">
        <div className="at-home-session-value">
          <span>Academic year</span>
          <strong>{year||'Not configured'}</strong>
        </div>
        <div className="at-home-session-value">
          <span>Current semester</span>
          <strong>{semester||'Not configured'}</strong>
        </div>
        <button type="button" className="at-btn at-btn-primary" disabled={!canSync||overviewBusy}
          onClick={()=>void refreshOverview()}><RefreshCw size={17}/>
          {overviewBusy?'Loading…':'Refresh overview'}</button>
      </div>
      {!canSync&&<p className="at-home-help">Choose your current year and semester in Settings to load your academic data.</p>}
      {autoLoadCurrentSession&&loadingTimetable&&
        <p className="at-home-help" role="status">Loading your current-semester data from ERP automatically…</p>}
    </section>

    <div className="at-home-stat-grid">
      <section className="at-home-stat at-home-stat--classes">
        <div className="at-home-stat-heading"><span><CalendarDays size={19}/></span>Today&apos;s classes</div>
        <strong className="at-home-stat-number">{liveTimetable&&localDay?todaySessions.length:'—'}</strong>
        <p>{localDay?DAY_NAMES[localDay]:'Today'} · {liveTimetable?'From your ERP timetable':
          loadingTimetable?'Loading from ERP…':'Current-semester timetable'}</p>
        <button type="button" onClick={()=>onNavigate('timetable')}>Full timetable <ArrowRight size={15}/></button>
      </section>
      <section className="at-home-stat at-home-stat--attendance">
        <div className="at-home-stat-heading"><span><BookOpen size={19}/></span>Semester attendance</div>
        <strong className="at-home-stat-number">{attendanceTotals?fmt(attendanceTotals.percent):'—'}</strong>
        <p>{shownAttendance?shownAttendance.academicYear+' · '+shownAttendance.semester:
          loadingTimetable?'Loading current-semester attendance…':'Select your current semester'}</p>
        {attendanceTotals&&<div className="at-home-attendance-track">
          <div style={{width:Math.min(100,Math.max(0,attendanceTotals.percent||0))+'%'}}/>
        </div>}
        <small>{shownAttendance?shownAttendance.cached?'Saved snapshot · refresh for latest data':
          'Updated '+new Date(shownAttendance.savedAt).toLocaleString('en-IN'):
          'Attendance uses your LTPS weights'}</small>
        <button type="button" onClick={()=>onNavigate('attendance')}>Attendance details <ArrowRight size={15}/></button>
      </section>
      <section className="at-home-stat at-home-stat--cgpa">
        <div className="at-home-stat-heading"><span><GraduationCap size={19}/></span>Current CGPA</div>
        <strong className="at-home-stat-number" aria-live="polite">
          {!cgpaVisible?'••••':cgpaLoading?'Loading…':cgpa!==null?cgpa.toFixed(2):'—'}
        </strong>
        <p>{!cgpaVisible?'Hidden for privacy':cgpaLoading||!readyForCGPA?
          'Loading CGPA from ERP…':cgpa!==null?'Out of 10.00 · University ERP':
          cgpaError?'Could not load CGPA':'No CGPA available yet'}</p>
        <button type="button" className="at-home-visibility" aria-label={cgpaVisible?'Hide CGPA':'Show CGPA'}
          disabled={!cgpaVisible&&overviewBusy} aria-pressed={cgpaVisible} onClick={toggleCGPA}>
          {cgpaVisible?<><EyeOff size={16}/> Hide CGPA</>:<><Eye size={16}/> Show CGPA</>}
        </button>
        {cgpaVisible&&cgpaError&&<small role="alert" className="at-home-inline-error">{cgpaError}</small>}
        {cgpaVisible&&<button type="button" onClick={()=>onNavigate('cgpa')}>
          My CGPA details <ArrowRight size={15}/></button>}
      </section>
    </div>

    <section className="at-home-today at-panel">
      <div className="at-home-today-heading">
        <div><div className="at-section-label">TODAY&apos;S TIMETABLE</div>
          <h2>{localDay?DAY_NAMES[localDay]:'Today'}&apos;s classes</h2>
          <p>{liveTimetable?year+' · '+semester+' · '+todaySessions.length+' class sessions':
            'Real classes and rooms from your authenticated ERP timetable.'}</p></div>
        <button type="button" onClick={()=>onNavigate('timetable')}>
          View full week <ArrowRight size={15}/>
        </button>
      </div>
      {timetableError&&<div className="at-message at-message-error" role="alert">
        Timetable: {timetableError}</div>}
      {attendanceError&&<div className="at-message at-message-error" role="alert">
        Attendance: {attendanceError}</div>}
      {loadingTimetable&&<p className="at-home-loading"><span className="at-spinner"/> Loading timetable from ERP…</p>}
      {liveTimetable&&!loadingTimetable&&todaySessions.length>0&&
        <div className="at-home-today-list">
          {todaySessions.map(item=>{
            const reference=sessionReferenceTime(item,liveTimetable.periodsInferred);
            const kind=item.component||'unknown';
            return <article className={'at-home-class at-home-class--'+kind}
              key={item.day+'-'+item.startPeriod+'-'+item.endPeriod+'-'+item.raw}>
              <div className="at-home-class-slot">
                <strong>{sessionSlotLabel(item)}</strong>
                <small>{reference||'Time unverified'}</small>
              </div>
              <div className="at-home-class-details">
                <strong>{item.courseCode?(courseNames.get(item.courseCode)||item.courseCode):item.raw}</strong>
                {item.courseCode&&courseNames.has(item.courseCode)&&<small>{item.courseCode}</small>}
                <span>{item.component?LTPS_LABELS[item.component].name:'ERP class'}
                  {item.section?' · '+item.section:''}</span>
              </div>
              <div className="at-home-class-room"><MapPin size={15}/>{item.room||'Room not listed'}</div>
            </article>;
          })}
        </div>}
      {liveTimetable&&!loadingTimetable&&!todaySessions.length&&
        <div className="at-home-today-empty">
          <CalendarDays size={27}/> No classes are listed for today in this timetable.
        </div>}
      {!liveTimetable&&!loadingTimetable&&
        <div className="at-home-today-empty">
          <Clock3 size={27}/> {canSync?
            (timetableError?'Could not load today’s classes. Use Refresh overview to retry.':
              'Your current-semester timetable will load automatically.'):
            'Set your current semester in Settings to see today’s classes.'}
        </div>}
      {liveTimetable?.periodsInferred&&<p className="at-home-timing-note">
        ERP did not provide readable period headers. Slot positions are inferred and time ranges are not verified.
      </p>}
    </section>
  </div>;
}
