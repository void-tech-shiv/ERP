'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fmt, totals, type Course, type Part } from '../../lib/calculator';
import { clearERP, readERP, writeERP } from '../../lib/erp_cache';

type Terms={years:string[];semesters:string[]};
type Session={active:boolean;studentId?:string;csrfToken?:string};
const COMPONENTS:Part[]=['L','T','P','S'];

async function call(path:string, options:RequestInit={}):Promise<any>{
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok) {
    const details=payload?.diagnostic;
    // Only non-sensitive categoricals and HTTP status codes from our own
    // server are displayed, never upstream HTML, cookies or login values.
    const stage=['login-post','redirect','dashboard','session-write'].includes(details?.stage)
      ? details.stage : '';
    const type=['redirect','login-form','json','html','other'].includes(details?.loginResponseType)
      ? details.loginResponseType : '';
    const dashboardType=['login-form','html','other'].includes(details?.dashboardResponseType)
      ? details.dashboardResponseType : '';
    const postStatus=Number.isInteger(details?.loginHttpStatus) ? details.loginHttpStatus : null;
    const dashStatus=Number.isInteger(details?.dashboardHttpStatus) ? details.dashboardHttpStatus : null;
    const code=typeof payload.code==='string' && /^[A-Z_]{3,50}$/.test(payload.code)
      ? payload.code : '';
    const safeTrace=[code, stage ? 'step='+stage : '',
      postStatus!==null ? 'POST='+postStatus : '',
      type ? 'type='+type : '',
      dashStatus!==null ? 'dashboard='+dashStatus : '',
      dashboardType ? 'dashboardType='+dashboardType : ''
    ].filter(Boolean).join(' · ');
    throw new Error((payload.error||'ERP request failed ('+response.status+')') +
      (safeTrace ? ' [Diagnostic: '+safeTrace+']' : ''));
  }
  return payload;
}

export default function PrivateERPTest(){
  const [studentId,setStudentId]=useState('');
  const [password,setPassword]=useState('');
  const [captcha,setCaptcha]=useState('');
  const [captchaImage,setCaptchaImage]=useState('');
  const [csrf,setCsrf]=useState('');
  const [stage,setStage]=useState<'checking'|'initial'|'challenge'|'authenticated'>('checking');
  const [terms,setTerms]=useState<Terms>({years:[],semesters:[]});
  const [year,setYear]=useState(''),[semester,setSemester]=useState('');
  const [courses,setCourses]=useState<Course[]>([]);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [consent,setConsent]=useState(false);
  const [refreshed,setRefreshed]=useState('');

  async function refreshTerms(){
    const result=await call('/api/erp/terms');
    setTerms(result);
    setYear(result.years.at(-1)||'');
    setSemester(result.semesters.find((v:string)=>v.toLowerCase().includes('even'))||result.semesters[0]||'');
  }

  useEffect(()=>{
    let live=true;
    void call('/api/erp/session').then(async s=>{
      if(!live)return;
      if(s.active){
        setCsrf(s.csrfToken);setStudentId(s.studentId);setStage('authenticated');
        await refreshTerms();
        const cached=await readERP(s.studentId);
        if(live && cached){
          setCourses(cached.courses);
          setYear(cached.academicYear);
          setSemester(cached.semester);
          setRefreshed(cached.savedAt+' (cached)');
        }
      } else setStage('initial');
    }).catch(e=>{if(live){setStage('initial');setError(e.message)}});
    return ()=>{live=false};
  },[]);

  async function challenge(){
    setBusy(true);setError('');setCaptcha('');setPassword('');
    try {
      const d=await call('/api/erp/challenge',{method:'POST'});
      setCaptchaImage(d.image);setCsrf(d.csrfToken);setStage('challenge');
    }catch(e){setError((e as Error).message)}
    finally{setBusy(false)}
  }

  async function login(e:React.FormEvent){
    e.preventDefault();setError('');setBusy(true);
    try {
      const data=await call('/api/erp/login',{
        method:'POST',headers:{'Content-Type':'application/json','X-Attendly-CSRF':csrf},
        body:JSON.stringify({studentId,password,captcha,consent}),
      });
      setPassword('');setCaptcha('');setCaptchaImage('');
      setCsrf(data.csrfToken);setStage('authenticated');
      await refreshTerms();
    }catch(e){
      setPassword('');setCaptcha('');setCaptchaImage('');setStage('initial');
      setError((e as Error).message+' Start a fresh CAPTCHA to retry.');
    }finally{setBusy(false)}
  }

  async function attendance(){
    setBusy(true);setError('');
    try {
      const data=await call('/api/erp/attendance',{
        method:'POST',headers:{'Content-Type':'application/json','X-Attendly-CSRF':csrf},
        body:JSON.stringify({academicYear:year,semester}),
      });
      if(data.source!=='erp'||!Array.isArray(data.courses))throw new Error('Invalid attendance result');
      const time=new Date().toLocaleString();
      setCourses(data.courses);setRefreshed(time);
      await writeERP({studentId,academicYear:year,semester,courses:data.courses,savedAt:time});
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }

  async function logout(){
    setBusy(true);setError('');
    try{
      await call('/api/erp/logout',{method:'POST',headers:{'X-Attendly-CSRF':csrf}});
      await clearERP();
      setPassword('');setCaptcha('');setCourses([]);setCsrf('');setStudentId('');
      setStage('initial');
    } catch(e){setError((e as Error).message)}
    finally {setBusy(false)}
  }

  const total=useMemo(()=>{
    const all=courses.map(totals);
    const a=all.reduce((v,t)=>v+t.a,0),t=all.reduce((v,t)=>v+t.t,0);
    return t?100*a/t:null;
  },[courses]);

  return <main className="private-screen">
    <div className="private-shell">
      <div className="private-nav"><div className="private-logo">attendly<span>.</span></div>
        <Link href="/">Back to demo</Link></div>
      <div className="private-heading"><span className="eyebrow">PRIVATE PREVIEW · EXPERIMENTAL</span>
        <h1>KL ERP attendance sync test</h1>
        <p>Independent student project. Not affiliated with or endorsed by KL University.
          Only test your own authorized student account. Do not share this page publicly.</p></div>
      <div className="private-alert"><strong>Private test, not a production login.</strong> The CAPTCHA must be solved manually.
        Passwords are used only for the login request, never saved to localStorage or our database.
        An encrypted short-lived ERP session stays in an HttpOnly browser cookie. Browser refresh may require re-login.
        University access rules and live reliability are not yet verified.</div>
      {error&&<div role="alert" className="private-error">{error}</div>}

      {stage==='checking'&&<div className="private-card">Checking private session…</div>}
      {stage==='initial'&&<div className="private-card">
        <h2>Begin a new ERP session</h2>
        <p>Get a new university CAPTCHA to start. This private preview sends the next login request directly from its server to the official ERP.</p>
        <button disabled={busy} onClick={()=>void challenge()}>{busy?'Connecting…':'Get ERP CAPTCHA'}</button>
      </div>}
      {stage==='challenge'&&<form className="private-card private-form" onSubmit={e=>void login(e)}>
        <h2>ERP student login</h2>
        <label>Student ID<input inputMode="numeric" autoComplete="username" required value={studentId} onChange={e=>setStudentId(e.target.value)} placeholder="Your ERP student ID"/></label>
        <label>Password<input type="password" autoComplete="off" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="ERP password"/></label>
        <div className="captcha-card">
          {captchaImage&&<img src={captchaImage} alt="University CAPTCHA verification code"/>}
          <button type="button" onClick={()=>void challenge()} disabled={busy}>New CAPTCHA</button>
        </div>
        <label>Enter the CAPTCHA<input required autoComplete="off" value={captcha} onChange={e=>setCaptcha(e.target.value)} placeholder="Characters shown above"/></label>
        <label className="consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>
          I am accessing only my own student ERP account and consent to this experimental sync.</label>
        <button type="submit" disabled={busy||!consent}>{busy?'Verifying…':'Login and fetch attendance'}</button>
      </form>}
      {stage==='authenticated'&&<div className="private-card">
        <div className="private-session-line"><div><small>AUTHENTICATED TEST SESSION</small><h2>Student {studentId}</h2></div>
          <button className="secondary" disabled={busy} onClick={()=>void logout()}>Logout</button></div>
        <div className="private-fields">
          <label>Academic year<select value={year} onChange={e=>setYear(e.target.value)}>
            {terms.years.map(x=><option key={x}>{x}</option>)}</select></label>
          <label>Semester<select value={semester} onChange={e=>setSemester(e.target.value)}>
            {terms.semesters.map(x=><option key={x}>{x}</option>)}</select></label>
        </div>
        <button disabled={busy||!year||!semester} onClick={()=>void attendance()}>{busy?'Syncing…':'Fetch live LTPS attendance'}</button>
        {courses.length>0&&<>
          <div className="private-overall"><small>WEIGHTED OVERALL ATTENDANCE</small><strong>{fmt(total)}</strong>
            <span>{courses.length} subjects · Synced {refreshed}</span></div>
          <div className="private-table-wrap"><table><thead><tr><th>Subject</th><th>L/T/P/S</th><th>Weighted attendance</th></tr></thead>
            <tbody>{courses.map(course=><tr key={course.code}><td><strong>{course.name}</strong><small>{course.code}</small></td>
              <td>{COMPONENTS.filter(part=>course.components[part]).map(part=><div key={part}>{part}: {course.components[part]!.attended}/{course.components[part]!.conducted}</div>)}</td>
              <td><strong>{fmt(totals(course).percentage)}</strong></td></tr>)}</tbody></table></div>
          <p className="private-foot">Weighted counts: Lecture 100%, Tutorial 50%, Practical 50%, Skill 25%. The university may use a different eligibility policy.</p>
        </>}
      </div>}
      <p className="private-foot">No bypasses, no unattended CAPTCHA solving. If login fails, verify the ERP is reachable and the university allows this access method.</p>
    </div>
  </main>;
}
