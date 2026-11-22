'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowUpRight, BookOpen, Calculator, ChevronRight, CircleHelp,
  Clock3, GraduationCap, LayoutDashboard, LockKeyhole, RefreshCcw,
  ShieldCheck, Target, WifiOff
} from 'lucide-react';
import { DEMO, PARTS, WEIGHTS, totals, projection, fmt, type Course, type Part } from '../lib/calculator';
import { loadDemo, saveDemo, clearDemo } from '../lib/cache';
import {
  readDemoSession, startDemoSession, endDemoSession, fetchDemoAttendance,
  toDashboardCourses, type DemoSessionInfo
} from '../lib/demo_session';

type Tab = 'dashboard' | 'subjects' | 'planner' | 'integration';
const NAV: {key:Tab; title:string; icon: typeof Activity}[] = [
  {key:'dashboard', title:'Overview', icon:LayoutDashboard},
  {key:'subjects', title:'Subjects', icon:BookOpen},
  {key:'planner', title:'Attendance planner', icon:Calculator},
  {key:'integration', title:'ERP connection', icon:ShieldCheck},
];

const partNames: Record<Part,string> = {L:'Lecture',T:'Tutorial',P:'Practical',S:'Skill'};
function quality(p:number|null,t:number){
  return p===null?'muted':p>=t?'positive':p>=t-10?'caution':'negative';
}

export default function Home() {
  const [tab,setTab]=useState<Tab>('dashboard');
  const [courses,setCourses]=useState<Course[]>(DEMO);
  const [selected,setSelected]=useState(DEMO[0].code);
  const [target,setTarget]=useState(85);
  const [futurePart,setFuturePart]=useState<Part>('L');
  const [cacheAt,setCacheAt]=useState<string | null>(null);
  const [demoSession,setDemoSession]=useState<DemoSessionInfo | null>(null);
  const [sessionStatus,setSessionStatus]=useState<'checking'|'inactive'|'active'|'error'>('checking');
  const [sessionBusy,setSessionBusy]=useState(false);
  const [sessionError,setSessionError]=useState<string | null>(null);

  useEffect(()=>{
    let active=true;
    void (async()=>{
      try {
        const existing=await readDemoSession();
        if(!active)return;
        if(!existing.active){
          setSessionStatus('inactive');
          await clearDemo();
          return;
        }
        setDemoSession(existing);
        setSessionStatus('active');
        const cached=await loadDemo();
        if(active && cached){
          setCourses(cached.courses);
          setCacheAt(cached.savedAt);
        }
        const response=await fetchDemoAttendance();
        if(active){
          const fresh=toDashboardCourses(response);
          setCourses(fresh);
          setCacheAt(new Date().toISOString());
        }
      } catch(error) {
        if(active){
          setSessionStatus('error');
          setSessionError(error instanceof Error ? error.message : 'Demo API is unreachable');
        }
      }
    })();
    return ()=>{active=false};
  },[]);

  useEffect(()=>{
    if(demoSession?.active && cacheAt){
      void saveDemo({courses,savedAt:cacheAt});
    }
  },[courses,cacheAt,demoSession]);

  async function refreshDemo() {
    setSessionBusy(true);
    setSessionError(null);
    try {
      const fresh=toDashboardCourses(await fetchDemoAttendance());
      setCourses(fresh);
      setSelected(fresh[0]?.code||'');
      setCacheAt(new Date().toISOString());
    } catch(error) {
      setSessionError(error instanceof Error?error.message:'Could not refresh demo');
      if(error instanceof Error && error.message.includes('expired')){
        setDemoSession(null);
        setSessionStatus('inactive');
        setCacheAt(null);
        await clearDemo();
      }
    } finally {
      setSessionBusy(false);
    }
  }

  async function startDemo() {
    setSessionBusy(true);
    setSessionError(null);
    try {
      const result=await startDemoSession();
      if(!result.active)throw new Error('Demo session could not be created');
      setDemoSession(result);
      setSessionStatus('active');
      const fresh=toDashboardCourses(await fetchDemoAttendance());
      setCourses(fresh);
      setSelected(fresh[0]?.code||'');
      setCacheAt(new Date().toISOString());
    } catch(error) {
      setSessionError(error instanceof Error?error.message:'Unable to start demo');
    } finally {
      setSessionBusy(false);
    }
  }

  async function logoutDemo() {
    if(!demoSession?.active)return;
    setSessionBusy(true);
    setSessionError(null);
    try {
      await endDemoSession(demoSession.csrfToken);
      setDemoSession(null);
      setSessionStatus('inactive');
      setCourses([...DEMO]);
      setSelected(DEMO[0].code);
      setCacheAt(null);
      await clearDemo();
    } catch(error) {
      setSessionError(error instanceof Error?error.message:'Logout failed; please retry');
    } finally {
      setSessionBusy(false);
    }
  }

  const summary=useMemo(()=>{
    const weighted=courses.map(totals);
    const a=weighted.reduce((s,v)=>s+v.a,0);
    const t=weighted.reduce((s,v)=>s+v.t,0);
    return {a,t,percentage:t?100*a/t:null};
  },[courses]);
  const plan=projection(summary.a,summary.t,target,futurePart);
  const chosen=courses.find(c=>c.code===selected)||courses[0];
  const chosenTotals=chosen?totals(chosen):null;
  const atRisk=courses.filter(c=>(totals(c).percentage||0)<target).length;
  const syncedLabel=cacheAt?new Date(cacheAt).toLocaleString():'Local demo';

  function SubjectRow({course}:{course:Course}){
    const info=totals(course);
    const value=info.percentage||0;
    return <button className="subject-row" onClick={()=>{setSelected(course.code);setTab('subjects')}}>
      <div className="subject-title"><span className="subject-symbol">{course.name.charAt(0)}</span>
        <span><strong>{course.name}</strong><small>{course.code} · {PARTS.filter(p=>course.components[p]).join(' · ')}</small></span>
      </div>
      <div className="subject-percent"><strong className={quality(info.percentage,target)}>{fmt(info.percentage)}</strong>
        <span className="progress"><i className={quality(info.percentage,target)} style={{width:value+'%'}}/></span>
      </div>
      <ChevronRight size={17} className="chevron"/>
    </button>;
  }

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><span className="brand-icon"><GraduationCap size={22}/></span>
        <div><strong>attendly<span>.</span></strong><small>STUDENT WORKSPACE</small></div>
      </div>
      <div className="sidebar-label">WORKSPACE</div>
      <nav>{NAV.map(item=><button key={item.key} className={'nav-item '+(tab===item.key?'active':'')}
        onClick={()=>setTab(item.key)}><item.icon size={19}/><span>{item.title}</span></button>)}</nav>
      <div className="sidebar-bottom">
        <div className="connection-note"><WifiOff size={17}/><span><strong>{demoSession?.active?'Demo session active':'ERP not connected'}</strong><small>{demoSession?.active?'Mock records only':'No real student login'}</small></span></div>
        <div className="sidebar-foot">Independent student project<br/>Not affiliated with KL University</div>
      </div>
    </aside>

    <div className="workspace">
      <header className="topbar"><div className="topbar-path">Workspace <ChevronRight size={15}/> <strong>{NAV.find(n=>n.key===tab)?.title}</strong></div>
        <div className="topbar-right"><span className="demo-pill"><span className="dot"/>{demoSession?.active?'DEMO SESSION':'PREVIEW MODE'}</span>
          <span className="avatar">DS</span></div>
      </header>
      <main className="content">
        <div className="page-title"><div><span className="eyebrow">ATTENDANCE INTELLIGENCE</span>
          <h1>{tab==='dashboard'?'Your attendance, at a glance.':tab==='subjects'?'Subject breakdown':tab==='planner'?'Plan your attendance':'ERP connection'}</h1>
          <p>{tab==='dashboard'?'Track every class and know exactly where you stand.':tab==='subjects'?'Lecture, tutorial, practical and skill attendance in one place.':tab==='planner'?'See how your next classes could affect your attendance.':'How we will securely connect your university attendance.'}</p>
        </div><button className="outline-button" onClick={()=>{setCourses([...DEMO]);setSelected(DEMO[0].code)}}><RefreshCcw size={16}/> Reset demo</button></div>

        <div className="banner"><CircleHelp size={20}/><span><strong>Sample attendance data.</strong> This is a working calculator demo, not live KL NewERP data. ERP login and sync are not available yet.</span></div>
        <div className="demo-actions">
          {demoSession?.active?<>
            <span className="session-indicator"><ShieldCheck size={16}/> Secure demo session active</span>
            <button className="outline-button" type="button" disabled={sessionBusy} onClick={()=>{void refreshDemo()}}><RefreshCcw size={16}/> Refresh sample</button>
            <button className="outline-button" type="button" disabled={sessionBusy} onClick={()=>{void logoutDemo()}}>End demo session</button>
          </>:<>
            <span className="session-indicator">{sessionStatus==='checking'?'Checking demo session…':'Local preview • ERP disconnected'}</span>
            <button className="primary-button" type="button" disabled={sessionBusy||sessionStatus==='checking'} onClick={()=>{void startDemo()}}>Start secure demo</button>
          </>}
        </div>
        {sessionError&&<p className="session-error" role="alert">{sessionError}</p>}

        {tab==='dashboard'&&<>
          <section className="metric-grid">
            <div className="metric"><div className="metric-heading">Overall attendance <Activity size={19}/></div>
              <div className="metric-value">{fmt(summary.percentage)}</div>
              <div className="metric-footer"><span className={'chip '+quality(summary.percentage,target)}>{(summary.percentage||0)>=target?'On track':'Below target'}</span> Weighted LTPS</div>
            </div>
            <div className="metric"><div className="metric-heading">Subjects enrolled <BookOpen size={19}/></div>
              <div className="metric-value">{courses.length}<span className="metric-suffix"> courses</span></div>
              <div className="metric-footer">{atRisk} below your {target}% target</div>
            </div>
            <div className="metric"><div className="metric-heading">Classes to attend <Target size={19}/></div>
              <div className="metric-value">{plan.mustAttend??'—'}</div>
              <div className="metric-footer">To reach {target}% · future {futurePart} classes</div>
            </div>
            <div className="metric"><div className="metric-heading">Possible misses <Clock3 size={19}/></div>
              <div className="metric-value">{plan.canMiss}</div>
              <div className="metric-footer">Assuming future {futurePart} classes only</div>
            </div>
          </section>
          <div className="two-col">
            <section className="panel"><div className="panel-heading"><div><h2>Subject attendance</h2><p>Weighted attendance across each component</p></div><button className="text-action" onClick={()=>setTab('subjects')}>View all <ArrowUpRight size={15}/></button></div>
              <div>{courses.map(c=><SubjectRow key={c.code} course={c}/>)}</div>
            </section>
            <div className="side-stack">
              <section className="panel target-panel"><div className="panel-heading"><div><h2>Attendance goal</h2><p>Plan against your personal target</p></div><Target size={19}/></div>
                <div className="gauge" style={{'--pct':Math.min(100,summary.percentage||0)+'%'} as React.CSSProperties}>
                  <div><strong>{fmt(summary.percentage)}</strong><small>of {target}% target</small></div>
                </div>
                <div className="range-head"><strong>Target percentage</strong><strong>{target}%</strong></div>
                <input type="range" min="60" max="95" step="1" value={target} onChange={e=>setTarget(Number(e.target.value))}/>
                <div className="range-labels"><span>60%</span><span>95%</span></div>
              </section>
              <section className="panel info-panel"><div className="info-icon"><ShieldCheck size={22}/></div><div><h3>Privacy by design</h3><p>Demo data stays in your browser. Real ERP passwords will never be saved in browser storage.</p></div></section>
            </div>
          </div>
        </>}

        {tab==='subjects'&&<div className="two-col subjects-area">
          <section className="panel"><div className="panel-heading"><div><h2>All subjects</h2><p>Select a course to inspect its LTPS breakdown</p></div></div>
            {courses.map(c=><SubjectRow key={c.code} course={c}/>)}</section>
          {chosen&&chosenTotals&&<section className="panel details">
            <div className="details-heading"><span className="subject-symbol big">{chosen.name.charAt(0)}</span>
              <div><small>{chosen.code}</small><h2>{chosen.name}</h2></div></div>
            <div className="detail-score"><strong className={quality(chosenTotals.percentage,target)}>{fmt(chosenTotals.percentage)}</strong><span>Weighted attendance</span></div>
            {PARTS.map(part=>{
              const c=chosen.components[part];if(!c)return null;
              const percent=c.conducted?100*c.attended/c.conducted:null;
              return <div key={part} className="component-row"><span className="part-letter">{part}</span>
                <div><strong>{partNames[part]}</strong><small>{c.attended} attended / {c.conducted} conducted · {WEIGHTS[part]*100}% weight</small>
                  <span className="progress"><i className={quality(percent,target)} style={{width:(percent||0)+'%'}}/></span></div>
                <strong>{fmt(percent)}</strong></div>;
            })}
            <div className="details-note">Weights apply to attended/conducted counts, not to an average of displayed percentages.</div>
          </section>}</div>}

        {tab==='planner'&&<div className="two-col planner-area">
          <section className="panel"><div className="panel-heading"><div><h2>Set your scenario</h2><p>Estimate future attendance using weighted class counts</p></div></div>
            <label className="field-label" htmlFor="target">Attendance target</label>
            <div className="number-input"><input id="target" type="number" min="1" max="99" value={target} onChange={e=>setTarget(Math.min(99,Math.max(1,Number(e.target.value)||1)))}/><span>%</span></div>
            <label className="field-label" htmlFor="futurePart">Future class type</label>
            <select id="futurePart" value={futurePart} onChange={e=>setFuturePart(e.target.value as Part)}>
              {PARTS.map(p=><option key={p} value={p}>{partNames[p]} ({p}) — {WEIGHTS[p]*100}% weight</option>)}</select>
            <div className="details-note"><strong>Assumption:</strong> every future class counted in this estimate has the selected type. Real timetables mix LTPS components.</div>
          </section>
          <section className="panel"><div className="panel-heading"><div><h2>Your forecast</h2><p>Based on {fmt(summary.percentage)} current weighted attendance</p></div></div>
            <div className="planner-tiles"><div><small>ATTEND TO REACH TARGET</small><strong>{plan.mustAttend??'—'}</strong><span>upcoming {futurePart} classes attended</span></div>
              <div><small>CAN MISS BEFORE TARGET</small><strong>{plan.canMiss}</strong><span>upcoming {futurePart} classes missed</span></div></div>
            <h3 className="mini-heading">By subject</h3>
            {courses.map(c=>{
              const t=totals(c), p=projection(t.a,t.t,target,futurePart);
              return <div className="forecast-row" key={c.code}><div><strong>{c.name}</strong><small>{fmt(t.percentage)}</small></div>
                <span>{p.mustAttend} attend · {p.canMiss} miss</span></div>;
            })}
          </section></div>}

        {tab==='integration'&&<div className="integration-card panel">
          <div className="integration-icon"><LockKeyhole size={30}/></div><h2>ERP session engine: internal testing</h2>
          <p>Phase 4 adds a separate browser demo session with HttpOnly cookies, CSRF-protected logout, rate limiting and IndexedDB cleanup. The ERP session engine is tested with simulated responses; live student login stays disabled pending permission and verification.</p>
          <div className="steps">
            <div><span>01</span><strong>Student solves ERP CAPTCHA</strong><small>The image and login belong to the same isolated backend session.</small></div>
            <div><span>02</span><strong>Backend reads LTPS counts</strong><small>Only the authenticated student's Attendance Register is requested.</small></div>
            <div><span>03</span><strong>Dashboard syncs securely</strong><small>Browser cache stores attendance, not passwords or session tokens.</small></div>
          </div>
          <div className="banner inline-banner"><ShieldCheck size={18}/><span>No real ERP account credentials are accepted by this demonstration.</span></div>
        </div>}
        <footer className="footer">Attendly · Independent prototype · {syncedLabel} (demo cache) <span>LTPS weights: L 100% · T 50% · P 50% · S 25%</span></footer>
      </main>
    </div>
  </div>;
}
