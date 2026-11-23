'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, BookOpen, CalendarDays, ChartNoAxesCombined, ChevronRight,
  CircleHelp, Clock3, GraduationCap, LogOut, RefreshCw, ShieldCheck,
  Target,
} from 'lucide-react';
import { fmt, totals, PARTS, type Course } from '../lib/calculator';
import { readERP, writeERP } from '../lib/erp_cache';

type Terms = {years: string[]; semesters: string[]};
type AttendanceResult = {
  source: 'erp';
  student: {id: string};
  academicYear: string;
  semester: string;
  courses: Course[];
};
type DisplayData = {
  academicYear: string;
  semester: string;
  courses: Course[];
  savedAt: string;
  cached: boolean;
};
type Loading = 'idle' | 'terms' | 'attendance';

async function api<T>(path:string, init?:RequestInit):Promise<T> {
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...init});
  const value:unknown=await response.json().catch(()=>({}));
  if(!response.ok) {
    if(response.status===401) throw new Error('Your ERP session has expired. Please sign in again.');
    const detail=value && typeof value==='object' && 'error' in value &&
      typeof value.error==='string' ? value.error : '';
    throw new Error(detail || 'Could not connect to ERP (HTTP '+response.status+').');
  }
  return value as T;
}
function isCount(x:unknown):x is {attended:number;conducted:number} {
  if(!x||typeof x!=='object')return false;
  const c=x as {attended?:unknown;conducted?:unknown};
  return typeof c.attended==='number' && typeof c.conducted==='number' &&
    Number.isSafeInteger(c.attended) && Number.isSafeInteger(c.conducted) &&
    c.attended>=0 && c.conducted>=c.attended;
}
function validateAttendance(raw:AttendanceResult,id:string,year:string,sem:string):Course[] {
  if(!raw||raw.source!=='erp'||raw.student?.id!==id||
     raw.academicYear!==year||raw.semester!==sem||
     !Array.isArray(raw.courses)||raw.courses.length>100) {
    throw new Error('ERP returned unexpected attendance data.');
  }
  const codes=new Set<string>();
  for(const course of raw.courses) {
    if(!course||typeof course.code!=='string'||!course.code||
      typeof course.name!=='string'||!course.name||
      codes.has(course.code)||!course.components||
      typeof course.components!=='object'||
      !PARTS.some(part=>isCount(course.components[part]))) {
      throw new Error('ERP returned an invalid course record.');
    }
    for(const p of PARTS) if(course.components[p]&&!isCount(course.components[p]))
      throw new Error('ERP returned invalid LTPS counts.');
    codes.add(course.code);
  }
  return raw.courses;
}
function grade(p:number|null,target:number) {
  if(p===null)return 'neutral';
  if(p>=target)return 'success';
  if(p>=target-10)return 'warning';
  return 'danger';
}
function Logo() {
  return <div className="at-logo">
    <span className="at-logo-mark"><GraduationCap size={21} strokeWidth={2.2}/></span>
    <span className="at-logo-word">attendly<span>.</span></span>
  </div>;
}
function Progress({percent,tone='primary'}:{percent:number|null;tone?:string}) {
  return <span className="at-progress" role="progressbar" aria-label="Attendance percentage"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent||0)}>
    <span className={'at-progress-fill at-fill-'+tone}
      style={{width:Math.min(100,Math.max(0,percent||0))+'%'}}/>
  </span>;
}

export default function AttendanceStep({
  studentId, csrfToken, onLogout, loggingOut, logoutError,
}:{
  studentId:string;
  csrfToken:string;
  onLogout:()=>void;
  loggingOut:boolean;
  logoutError?:string;
}) {
  const [terms,setTerms]=useState<Terms|null>(null);
  const [year,setYear]=useState('');
  const [semester,setSemester]=useState('');
  const [loading,setLoading]=useState<Loading>('idle');
  const [error,setError]=useState('');
  const [display,setDisplay]=useState<DisplayData|null>(null);
  const [target,setTarget]=useState(75);

  useEffect(()=>{
    let active=true;
    void readERP(studentId).then(cached=>{
      if(active&&cached&&Array.isArray(cached.courses)){
        setDisplay({...cached,cached:true});
      }
    }).catch(()=>{});
    return ()=>{active=false};
  },[studentId]);

  const busy=loading!=='idle';
  const summary=useMemo(()=>{
    const rows=(display?.courses||[]).map(totals);
    const attended=rows.reduce((sum,row)=>sum+row.a,0);
    const conducted=rows.reduce((sum,row)=>sum+row.t,0);
    return {percent:conducted?100*attended/conducted:null};
  },[display]);

  async function loadTerms(){
    setLoading('terms');setError('');
    try {
      const result=await api<Terms>('/api/erp/terms');
      const years=Array.isArray(result.years)?result.years.filter(v=>typeof v==='string'&&v.length<=40):[];
      const semesters=Array.isArray(result.semesters)?result.semesters.filter(v=>typeof v==='string'&&v.length<=40):[];
      if(!years.length||!semesters.length)
        throw new Error('No academic sessions were returned. Please try again.');
      setTerms({years,semesters});
      // A saved choice is a convenience only; the user still starts each sync.
      setYear(years.includes(display?.academicYear||'')?display!.academicYear:'');
      setSemester(semesters.includes(display?.semester||'')?display!.semester:'');
    } catch(e){
      setError(e instanceof Error?e.message:'Could not load academic sessions.');
    } finally{setLoading('idle');}
  }

  async function syncAttendance(){
    if(!terms||!terms.years.includes(year)||!terms.semesters.includes(semester)){
      setError('Choose an academic year and semester.');
      return;
    }
    setLoading('attendance');setError('');
    try {
      const raw=await api<AttendanceResult>('/api/erp/attendance',{
        method:'POST',
        headers:{'Content-Type':'application/json','X-Attendly-CSRF':csrfToken},
        body:JSON.stringify({academicYear:year,semester}),
      });
      const courses=validateAttendance(raw,studentId,year,semester);
      const savedAt=new Date().toISOString();
      setDisplay({academicYear:year,semester,courses,savedAt,cached:false});
      try {await writeERP({studentId,academicYear:year,semester,courses,savedAt});}
      catch {/* IndexedDB can be unavailable in a private window. */}
    } catch(e) {
      setError(e instanceof Error?e.message:'Attendance could not be loaded.');
    } finally{setLoading('idle');}
  }

  function SubjectList() {
    const courses=display?.courses||[];
    return <div className="at-course-list">
      {courses.map(course=>{
        const t=totals(course);
        const tone=grade(t.percentage,target);
        return <article className="at-course-item" key={course.code}>
          <div className="at-course-avatar">{course.name.charAt(0)}</div>
          <div className="at-course-primary">
            <strong>{course.name}</strong>
            <span>{course.code}</span>
            <Progress percent={t.percentage} tone={tone}/>
          </div>
          <div className="at-course-trailing">
            <strong className={'at-text-'+tone}>{fmt(t.percentage)}</strong>
            <span>{PARTS.filter(p=>course.components[p]).join(' · ')}</span>
          </div>
        </article>;
      })}
      {!courses.length && <p className="at-small-empty">No subjects match your search.</p>}
    </div>;
  }

  const dateLabel=display ? new Date(display.savedAt).toLocaleString() : 'Not synced yet';

  return <div className="at-app">
    <aside className="at-sidebar">
      <div className="at-sidebar-brand"><Logo/><small>STUDENT WORKSPACE</small></div>
      <nav className="at-side-nav" aria-label="Main navigation">
        <div className="at-nav-item active" aria-current="page">
          <BookOpen size={19}/><span>Attendance</span>
          <span className="at-nav-active-dot"/>
        </div>
      </nav>
    </aside>

    <div className="at-app-main">
      <header className="at-app-topbar">
        <div className="at-breadcrumb"><span>Workspace</span><ChevronRight size={14}/>
          <strong>Attendance</strong></div>
        <div className="at-top-actions">
          <span className="at-top-connected"><span className="at-online-dot"/> Connected to ERP</span>
          <div className="at-profile"><span className="at-profile-avatar"><GraduationCap size={17}/></span>
            <span>Student <strong>••••{studentId.slice(-4)}</strong></span></div>
          <button type="button" className="at-icon-button" onClick={onLogout}
            disabled={loggingOut} aria-label="Sign out" title="Sign out"><LogOut size={19}/></button>
        </div>
      </header>

      <main className="at-workspace">
        {logoutError&&<div className="at-message at-message-error" role="alert">{logoutError}</div>}
        <div className="at-page-intro">
          <div>
            <div className="at-section-label"><span className="at-label-dot"/> PERSONAL ATTENDANCE HUB</div>
            <h1>Your attendance, at a glance.</h1>
            <p>Your academic progress, organized in one clear view.</p>
          </div>
          <span className="at-session-badge"><ShieldCheck size={16}/> Secure ERP session</span>
        </div>

        <section className="at-term-card">
          <div className="at-term-card-heading"><div className="at-term-icon"><CalendarDays size={20}/></div>
            <div><strong>Academic session</strong><p>Choose the year and semester to view attendance</p></div></div>
          {!terms ? <div className="at-term-first">
            <span><Clock3 size={15}/> {display?'Last synced: '+dateLabel:'Ready to load your academic terms'}</span>
            <button className="at-btn at-btn-primary" type="button" disabled={busy}
              onClick={()=>void loadTerms()}>
              {loading==='terms'?<><span className="at-spinner at-spinner-white"/> Loading…</>:<>Select academic session <ArrowRight size={17}/></>}
            </button>
          </div> : <div className="at-term-controls">
            <label>Academic year
              <select value={year} onChange={e=>setYear(e.target.value)} disabled={busy}>
                <option value="">Select year</option>
                {terms.years.map(v=><option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label>Semester
              <select value={semester} onChange={e=>setSemester(e.target.value)} disabled={busy}>
                <option value="">Select semester</option>
                {terms.semesters.map(v=><option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <button className="at-btn at-btn-primary" type="button" onClick={()=>void syncAttendance()}
              disabled={busy||!year||!semester}>
              {loading==='attendance'?<><span className="at-spinner at-spinner-white"/> Syncing…</>:<><RefreshCw size={17}/> Sync attendance</>}
            </button>
            <button className="at-icon-button at-terms-reload" type="button"
              disabled={busy} onClick={()=>void loadTerms()} title="Reload academic terms"
              aria-label="Reload academic terms"><RefreshCw size={18}/></button>
          </div>}
          {error&&<div className="at-message at-message-error" role="alert">{error}</div>}
        </section>

        {!display && <div className="at-empty-dash">
          <div className="at-empty-art" aria-hidden="true">
            <div className="at-empty-icon"><ChartNoAxesCombined size={36}/></div>
          </div>
          <span className="at-empty-tag">YOUR DATA, YOUR DASHBOARD</span>
          <h2>See your progress come to life.</h2>
          <p>Select your academic year and semester, then sync attendance to unlock your personalized overview.</p>
          {!terms&&<button className="at-btn at-btn-outline" onClick={()=>void loadTerms()} disabled={busy}>
            Load academic sessions <ArrowRight size={16}/></button>}
        </div>}

        {display&&<>
          <div className="at-data-meta">
            <div><span className="at-data-source"><span className="at-online-dot"/>{display.cached?'Saved on this device':'ERP attendance'}</span>
              <span>{display.academicYear} · {display.semester}</span></div>
            <span><Clock3 size={14}/>{dateLabel}</span>
          </div>
          {display.cached&&<div className="at-cache-notice"><CircleHelp size={17}/>
            You're viewing a saved copy. Use Sync attendance to get the latest ERP records.</div>}

          <div className="at-overview-grid">
              <section className="at-panel at-overview-subjects">
                <div className="at-panel-head"><div><h2>Subject attendance</h2>
                  <p>All your courses in one place</p></div></div>
                <SubjectList/>
              </section>
              <div className="at-overview-right">
                <section className="at-panel at-goal-panel">
                  <div className="at-panel-head"><div><h2>Your attendance goal</h2>
                    <p>Make every class count</p></div><Target size={20}/></div>
                  <div className="at-goal-ring" style={{'--progress':Math.min(100,Math.max(0,summary.percent||0))+'%'} as React.CSSProperties}>
                    <div><strong>{fmt(summary.percent)}</strong><span>of {target}% target</span></div>
                  </div>
                  <div className="at-goal-row"><span>Target percentage</span><strong>{target}%</strong></div>
                  <input type="range" min="50" max="95" value={target}
                    aria-label="Attendance target" onChange={e=>setTarget(Number(e.target.value))}/>
                  <div className="at-slider-ends"><span>50%</span><span>95%</span></div>
                </section>
                <section className="at-help-card">
                  <div className="at-help-icon"><ShieldCheck size={19}/></div>
                  <div><strong>Private by design</strong><p>ERP credentials aren't saved. Only attendance counts can be cached on this device.</p></div>
                </section>
              </div>
            </div>

        </>}

        <footer className="at-dashboard-footer">
          <span>© {new Date().getFullYear()} Attendly · Independent student project</span>
          <span>L 100% · T 50% · P 50% · S 25%</span>
        </footer>
      </main>
    </div>
  </div>;
}
