'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';


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
    const redirectReason=['missing_location','invalid_location','external_location','unexpected_path','too_many_redirects']
      .includes(details?.redirectReason) ? details.redirectReason : '';
    const redirectKind=['index','root'].includes(details?.redirectKind) ? details.redirectKind : '';
    const followCount=Number.isInteger(details?.redirectsFollowed) && details.redirectsFollowed<=3
      ? details.redirectsFollowed : null;
    const safeTrace=[code, stage ? 'step='+stage : '',
      postStatus!==null ? 'POST='+postStatus : '',
      type ? 'type='+type : '',
      redirectKind ? 'redirectType='+redirectKind : '',
      redirectReason ? 'redirectIssue='+redirectReason : '',
      details?.upgradedHttps===true ? 'httpsUpgrade=true' : '',
      followCount!==null ? 'redirectHops='+followCount : '',
      ['index-probe','dashboard-probe'].includes(details?.fallback) ? 'fallback='+details.fallback : '',
      dashStatus!==null ? 'dashboard='+dashStatus : '',
      dashboardType ? 'dashboardType='+dashboardType : '',
      typeof details?.loginFormDetected==='boolean' ? 'loginForm='+details.loginFormDetected : '',
      typeof details?.studentIdentityVisible==='boolean' ? 'identityVisible='+details.studentIdentityVisible : '',
      typeof details?.dashboardMarkersDetected==='boolean' ? 'dashboardMarkers='+details.dashboardMarkersDetected : '',
      Number.isInteger(details?.cookieCountBefore) ? 'cookiesBefore='+details.cookieCountBefore : '',
      Number.isInteger(details?.cookieCountAfterLogin) ? 'cookiesAfterLogin='+details.cookieCountAfterLogin : '',
      typeof details?.cookieChangedOnLogin==='boolean' ? 'cookiesUpdated='+details.cookieChangedOnLogin : '',
      Number.isInteger(details?.cookieCountAfterDashboard) ? 'cookiesAfterDashboard='+details.cookieCountAfterDashboard : ''

    ].filter(Boolean).join(' · ');
    throw new Error((payload.error||'ERP request failed ('+response.status+')') +
      (safeTrace ? ' [Diagnostic: '+safeTrace+']' : ''));
  }
  return payload;
}

export default function PrivateERPTest() {
  const [studentId,setStudentId]=useState('');
  const [password,setPassword]=useState('');
  const [captcha,setCaptcha]=useState('');
  const [captchaImage,setCaptchaImage]=useState('');
  const [csrf,setCsrf]=useState('');
  const [stage,setStage]=useState<'checking'|'initial'|'challenge'|'authenticated'>('checking');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [consent,setConsent]=useState(false);

  // Phase 1 intentionally ONLY checks the ERP session. No academic year,
  // semester or attendance requests run on mount or after successful login.
  useEffect(()=>{
    let active=true;
    void call('/api/erp/session').then(session=>{
      if(!active)return;
      if(session.active===true && session.studentId && session.csrfToken){
        setStudentId(String(session.studentId));
        setCsrf(String(session.csrfToken));
        setStage('authenticated');
      } else setStage('initial');
    }).catch(e=>{
      if(active){
        setStage('initial');
        setError(e instanceof Error?e.message:'Could not restore ERP session');
      }
    });
    return ()=>{active=false};
  },[]);

  async function startChallenge(){
    setBusy(true);
    setError('');
    setPassword('');
    setCaptcha('');
    setCaptchaImage('');
    try{
      const result=await call('/api/erp/challenge',{method:'POST'});
      if(!result?.csrfToken || typeof result?.image!=='string')
        throw new Error('ERP CAPTCHA response was incomplete');
      setCsrf(result.csrfToken);
      setCaptchaImage(result.image);
      setStage('challenge');
    }catch(e){
      setError(e instanceof Error?e.message:'Could not request CAPTCHA');
    }finally{setBusy(false)}
  }

  async function login(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    setBusy(true);
    setError('');
    try{
      const result=await call('/api/erp/login',{
        method:'POST',
        headers:{'Content-Type':'application/json','X-Attendly-CSRF':csrf},
        body:JSON.stringify({studentId,password,captcha,consent}),
      });
      if(result?.ok!==true || result?.verified!==true || result?.stage!=='login-only')
        throw new Error('ERP login could not be verified');
      setPassword('');
      setCaptcha('');
      setCaptchaImage('');
      setCsrf(String(result.csrfToken));
      setStudentId(String(result.studentId));
      setStage('authenticated');
    }catch(e){
      setPassword('');
      setCaptcha('');
      setCaptchaImage('');
      setStage('initial');
      setError((e instanceof Error?e.message:'ERP verification failed')+
        ' Request a fresh CAPTCHA to retry.');
    }finally{setBusy(false)}
  }

  async function logout(){
    setBusy(true);
    setError('');
    try{
      await call('/api/erp/logout',{
        method:'POST',
        headers:{'X-Attendly-CSRF':csrf}
      });
      setPassword('');
      setCaptcha('');
      setCaptchaImage('');
      setStudentId('');
      setCsrf('');
      setStage('initial');
    }catch(e){
      setError(e instanceof Error?e.message:'Logout could not be confirmed');
    }finally{setBusy(false)}
  }

  const displayId=studentId ? '••••'+studentId.slice(-4) : '';

  return <main className="private-screen"><div className="private-shell">
    <div className="private-nav">
      <div className="private-logo">attendly<span>.</span></div>
      <Link href="/">Back to demo</Link>
    </div>
    <div className="private-heading">
      <span className="eyebrow">PRIVATE PREVIEW · LOGIN VERIFICATION ONLY</span>
      <h1>KL ERP login verification</h1>
      <p>First verify that your authenticated ERP session works.
        Academic year, semester and attendance retrieval are separate steps
        and are intentionally not requested on this screen.</p>
    </div>
    <div className="private-alert">
      <strong>Experimental private login test.</strong>
      The CAPTCHA must be solved manually. Your password is submitted only
      for ERP authentication, not saved to browser storage or our database.
      A short-lived encrypted session cookie stays HttpOnly. This is not an official
      KL University application.
    </div>
    {error&&<div role="alert" className="private-error">{error}</div>}

    {stage==='checking'&&<div className="private-card">Checking ERP login session…</div>}

    {stage==='initial'&&<div className="private-card">
      <h2>Step 1 — Verify ERP login</h2>
      <p>Request the official CAPTCHA and authenticate your own account.
        No attendance or semester requests are made during this test.</p>
      <button type="button" disabled={busy}
        onClick={()=>void startChallenge()}>{busy?'Connecting…':'Get ERP CAPTCHA'}</button>
    </div>}

    {stage==='challenge'&&<form className="private-card private-form"
      onSubmit={e=>void login(e)}>
      <h2>ERP student login</h2>
      <label>Student ID
        <input inputMode="numeric" autoComplete="username" required
          value={studentId} onChange={e=>setStudentId(e.target.value)}
          placeholder="ERP student ID"/>
      </label>
      <label>Password
        <input type="password" autoComplete="off" required
          value={password} onChange={e=>setPassword(e.target.value)}
          placeholder="ERP password"/>
      </label>
      <div className="captcha-card">
        {captchaImage&&<img src={captchaImage} alt="Official ERP CAPTCHA"/>}
        <button type="button" disabled={busy} onClick={()=>void startChallenge()}>
          New CAPTCHA
        </button>
      </div>
      <label>Enter CAPTCHA
        <input value={captcha} required autoComplete="off"
          onChange={e=>setCaptcha(e.target.value)} placeholder="Characters shown above"/>
      </label>
      <label className="consent">
        <input type="checkbox" checked={consent}
          onChange={e=>setConsent(e.target.checked)}/>
        I am testing only my own authorized ERP account.
      </label>
      <button type="submit" disabled={busy||!consent}>
        {busy?'Verifying login…':'Verify ERP login'}
      </button>
    </form>}

    {stage==='authenticated'&&<section className="private-card">
      <div className="private-session-line">
        <div>
          <small>VERIFIED AUTHENTICATED ERP SESSION</small>
          <h2>ERP Login Verified</h2>
          <p>Student ID: {displayId}</p>
        </div>
        <button type="button" className="secondary" disabled={busy}
          onClick={()=>void logout()}>{busy?'Signing out…':'Logout'}</button>
      </div>
      <div className="private-alert">
        <strong>Step 1 completed.</strong>
        The backend verified your ERP identity on the authenticated dashboard.
        Academic year and semester selection belong to Step 2 and are not
        loaded by this login-only test.
      </div>
    </section>}

    <p className="private-foot">
      HTTP 302 and 200 responses alone do not prove login success.
      Only the verified authenticated dashboard enables the success screen.
      If it fails, share the redacted Diagnostic text only—never passwords,
      CAPTCHA answers or ERP session tokens.
    </p>
  </div></main>;
}
