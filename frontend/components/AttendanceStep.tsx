'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen, CalendarDays, ChartNoAxesCombined, ChevronRight,
  CircleHelp, Clock3, GraduationCap, LayoutDashboard, LogOut, RefreshCw, Settings2, ShieldCheck,
  Target,
} from 'lucide-react';
import { fmt, totals, PARTS, type Course } from '../lib/calculator';
import { readERP, writeERP } from '../lib/erp_cache';
import CGPAStep from './CGPAStep';
import ExamSeatingStep from './ExamSeatingStep';
import TimetableStep from './TimetableStep';
import OverviewStep, {type OverviewTimetableCache} from './OverviewStep';
import SettingsStep from './SettingsStep';
import {
  DEFAULT_STUDENT_PREFERENCES, readStudentPreferences, writeStudentPreferences,
  sanitizeStudentPreferences, type StudentPreferences,
} from '../lib/student_preferences';

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
  const [view,setView]=useState<'overview'|'attendance'|'cgpa'|'seating'|'timetable'|'settings'>('overview');
  const [terms,setTerms]=useState<Terms|null>(null);
  const [year,setYear]=useState('');
  const [semester,setSemester]=useState('');
  const [loading,setLoading]=useState<Loading>('terms');
  const [error,setError]=useState('');
  const [display,setDisplay]=useState<DisplayData|null>(null);
  const [overviewTimetable,setOverviewTimetable]=useState<
    (OverviewTimetableCache & {studentId:string})|null
  >(null);
  const [target,setTarget]=useState(75);
  const [preferences,setPreferences]=useState<StudentPreferences>(DEFAULT_STUDENT_PREFERENCES);
  const [preferencesForStudent,setPreferencesForStudent]=useState('');
  const activePreferences=preferencesForStudent===studentId?preferences:DEFAULT_STUDENT_PREFERENCES;

  // Only UI preferences (nickname, year, semester and visibility) are persisted.
  // The storage key is scoped to this authenticated student account.
  useEffect(()=>{
    setView('overview');
    let restored:StudentPreferences=DEFAULT_STUDENT_PREFERENCES;
    try{restored=readStudentPreferences(window.localStorage,studentId);}
    catch{/* Defaults work even when local storage is unavailable. */}
    setPreferences(restored);
    setPreferencesForStudent(studentId);
    setYear(restored.currentYear);
    setSemester(restored.currentSemester);
  },[studentId]);

  function savePreferences(next:StudentPreferences){
    const clean=sanitizeStudentPreferences(next);
    const termChanged=clean.currentYear!==activePreferences.currentYear||
      clean.currentSemester!==activePreferences.currentSemester;
    if(termChanged&&terms&&clean.currentYear&&clean.currentSemester&&
      (!terms.years.includes(clean.currentYear)||
       !terms.semesters.includes(clean.currentSemester)))return;
    setPreferences(clean);
    setPreferencesForStudent(studentId);
    if(termChanged){
      setYear(clean.currentYear);
      setSemester(clean.currentSemester);
    }
    try{writeStudentPreferences(window.localStorage,studentId,clean);}
    catch{/* Preferences are still applied during this session. */}
  }

  useEffect(()=>{
    let active=true;
    setDisplay(null);
    setOverviewTimetable(null);
    void readERP(studentId).then(cached=>{
      if(active&&cached&&Array.isArray(cached.courses)){
        setDisplay(previous=>previous&&!previous.cached?previous:{...cached,cached:true});
      }
    }).catch(()=>{});
    return ()=>{active=false};
  },[studentId]);

  function changeOverviewYear(next:string){
    setYear(next);
    if(next&&semester&&terms?.years.includes(next)&&terms.semesters.includes(semester)){
      savePreferences({...activePreferences,currentYear:next,currentSemester:semester});
    }
  }
  function changeOverviewSemester(next:string){
    setSemester(next);
    if(year&&next&&terms?.years.includes(year)&&terms.semesters.includes(next)){
      savePreferences({...activePreferences,currentYear:year,currentSemester:next});
    }
  }

  const busy=loading!=='idle';
  // Never present an old cached semester as the currently selected semester.
  const selectedDisplay=display&&display.academicYear===year&&display.semester===semester
    ?display:null;
  const summary=useMemo(()=>{
    const rows=(selectedDisplay?.courses||[]).map(totals);
    const attended=rows.reduce((sum,row)=>sum+row.a,0);
    const conducted=rows.reduce((sum,row)=>sum+row.t,0);
    return {percent:conducted?100*attended/conducted:null};
  },[selectedDisplay]);

  // Automatically load available terms once login is verified. The user's
  // selection and the actual attendance sync remain explicit actions.
  const loadTerms=useCallback(async(signal?:AbortSignal)=>{
    if(signal?.aborted)return;
    setLoading('terms');setError('');
    try {
      const result=await api<Terms>('/api/erp/terms',{signal});
      if(signal?.aborted)return;
      const years=Array.isArray(result.years)?result.years.filter(v=>typeof v==='string'&&v.length<=40):[];
      const semesters=Array.isArray(result.semesters)?result.semesters.filter(v=>typeof v==='string'&&v.length<=40):[];
      if(!years.length||!semesters.length)
        throw new Error('No academic sessions were returned. Please try again.');
      setTerms({years,semesters});
      // Keep an existing choice only when it remains valid after a reload.
      setYear(previous=>years.includes(previous)?previous:'');
      setSemester(previous=>semesters.includes(previous)?previous:'');
    } catch(e){
      if(!signal?.aborted)setError(e instanceof Error?e.message:'Could not load academic sessions.');
    } finally{
      if(!signal?.aborted)setLoading('idle');
    }
  },[]);

  useEffect(()=>{
    const controller=new AbortController();
    void loadTerms(controller.signal);
    return ()=>controller.abort();
  },[studentId,loadTerms]);

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
    const courses=selectedDisplay?.courses||[];
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
      {!courses.length && <p className="at-small-empty">No subjects are available for this academic session.</p>}
    </div>;
  }

  const dateLabel=selectedDisplay ? new Date(selectedDisplay.savedAt).toLocaleString() : 'Not synced yet';

  return <div className="at-app">
    <aside className="at-sidebar">
      <div className="at-sidebar-brand"><Logo/><small>STUDENT WORKSPACE</small></div>
      <nav className="at-side-nav" aria-label="Main navigation">
        <button type="button" className={'at-nav-item '+(view==='overview'?'active':'')}
          aria-current={view==='overview'?'page':undefined} onClick={()=>setView('overview')}>
          <LayoutDashboard size={19}/><span>Overview</span>
          {view==='overview'&&<span className="at-nav-active-dot"/>}
        </button>
        <button type="button" className={'at-nav-item '+(view==='attendance'?'active':'')}
          aria-current={view==='attendance'?'page':undefined} onClick={()=>setView('attendance')}>
          <BookOpen size={19}/><span>Attendance</span>
          {view==='attendance'&&<span className="at-nav-active-dot"/>}
        </button>
        <button type="button" className={'at-nav-item '+(view==='cgpa'?'active':'')}
          aria-current={view==='cgpa'?'page':undefined} onClick={()=>setView('cgpa')}>
          <GraduationCap size={19}/><span>CGPA</span>
          {view==='cgpa'&&<span className="at-nav-active-dot"/>}
        </button>
        <button type="button" className={'at-nav-item '+(view==='seating'?'active':'')}
          aria-current={view==='seating'?'page':undefined} onClick={()=>setView('seating')}>
          <CalendarDays size={19}/><span>Exam Seating</span>
          {view==='seating'&&<span className="at-nav-active-dot"/>}
        </button>
        <button type="button" className={'at-nav-item '+(view==='timetable'?'active':'')}
          aria-current={view==='timetable'?'page':undefined} onClick={()=>setView('timetable')}>
          <Clock3 size={19}/><span>Timetable</span>
          {view==='timetable'&&<span className="at-nav-active-dot"/>}
        </button>
        <button type="button" className={'at-nav-item '+(view==='settings'?'active':'')}
          aria-current={view==='settings'?'page':undefined} onClick={()=>setView('settings')}>
          <Settings2 size={19}/><span>Settings</span>
          {view==='settings'&&<span className="at-nav-active-dot"/>}
        </button>
      </nav>
    </aside>

    <div className="at-app-main">
      <header className="at-app-topbar">
        <div className="at-breadcrumb"><span>Workspace</span><ChevronRight size={14}/>
          <strong>{view==='overview'?'Overview':view==='attendance'?'Attendance':view==='cgpa'?'CGPA':view==='seating'?'Exam Seating':view==='settings'?'Settings':'Timetable'}</strong></div>
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
        {view==='settings' ? <SettingsStep
          preferences={activePreferences} terms={terms} busy={busy}
          onSave={savePreferences}
        /> : view==='overview' ? <OverviewStep key={studentId}
          studentId={studentId} terms={terms} year={year} semester={semester}
          onYearChange={changeOverviewYear} onSemesterChange={changeOverviewSemester}
          autoLoadCurrentSession={Boolean(
            activePreferences.currentYear&&activePreferences.currentSemester&&
            activePreferences.currentYear===year&&activePreferences.currentSemester===semester
          )}
          cachedTimetable={overviewTimetable?.studentId===studentId?overviewTimetable:null}
          onTimetableLoaded={next=>setOverviewTimetable({...next,studentId})}
          nickname={activePreferences.nickname}
          onNicknameChange={nickname=>savePreferences({...activePreferences,nickname})}
          showCgpa={activePreferences.showCgpa}
          onCgpaVisibilityChange={showCgpa=>savePreferences({...activePreferences,showCgpa})}
          attendance={display} attendanceBusy={busy} attendanceError={error}
          onRefreshAttendance={syncAttendance} onNavigate={setView}
        /> : view==='cgpa' ? <CGPAStep key={studentId}/> : view==='seating' ? <ExamSeatingStep/> : view==='timetable' ? <TimetableStep
          currentYear={activePreferences.currentYear}
          currentSemester={activePreferences.currentSemester}
        /> : <>
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
          <div className="at-term-controls">
            <label>Academic year
              <select value={year} onChange={e=>setYear(e.target.value)} disabled={busy||!terms}
                aria-label="Academic year">
                <option value="">{loading==='terms'?'Loading years…':'Select year'}</option>
                {terms?.years.map(v=><option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label>Semester
              <select value={semester} onChange={e=>setSemester(e.target.value)} disabled={busy||!terms}
                aria-label="Semester">
                <option value="">{loading==='terms'?'Loading semesters…':'Select semester'}</option>
                {terms?.semesters.map(v=><option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <button className="at-btn at-btn-primary" type="button" onClick={()=>void syncAttendance()}
              disabled={busy||!terms||!year||!semester}>
              {loading==='attendance'?<><span className="at-spinner at-spinner-white"/> Syncing…</>:<><RefreshCw size={17}/> Sync attendance</>}
            </button>
            <button className="at-icon-button at-terms-reload" type="button"
              disabled={busy} onClick={()=>void loadTerms()} title="Reload academic terms"
              aria-label="Reload academic terms"><RefreshCw size={18}/></button>
          </div>
          {error&&<div className="at-message at-message-error" role="alert">{error}</div>}
        </section>

        {!selectedDisplay && <div className="at-empty-dash">
          <div className="at-empty-art" aria-hidden="true">
            <div className="at-empty-icon"><ChartNoAxesCombined size={36}/></div>
          </div>
          <span className="at-empty-tag">YOUR DATA, YOUR DASHBOARD</span>
          <h2>See your progress come to life.</h2>
          <p>Select your academic year and semester, then sync attendance to unlock your personalized overview.</p>

        </div>}

        {selectedDisplay&&<>
          <div className="at-data-meta">
            <div><span className="at-data-source"><span className="at-online-dot"/>{selectedDisplay.cached?'Saved on this device':'ERP attendance'}</span>
              <span>{selectedDisplay.academicYear} · {selectedDisplay.semester}</span></div>
            <span><Clock3 size={14}/>{dateLabel}</span>
          </div>
          {selectedDisplay.cached&&<div className="at-cache-notice"><CircleHelp size={17}/>
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
        </>}

        <footer className="at-dashboard-footer">
          <span>© {new Date().getFullYear()} Attendly · Independent student project</span>
          <span>L 100% · T 50% · P 50% · S 25%</span>
        </footer>
      </main>
    </div>
  </div>;
}
