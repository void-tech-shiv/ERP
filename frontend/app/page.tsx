'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight, ArrowUpRight, Check, Eye, EyeOff, GraduationCap,
  LockKeyhole, RefreshCw, ShieldCheck, Sparkles,
} from 'lucide-react';
import AttendanceStep from '../components/AttendanceStep';

type Stage = 'checking' | 'unavailable' | 'initial' | 'challenge' | 'authenticated';

type ApiErrorDetails = {
  code?: string;
  diagnostic?: Record<string, unknown>;
};
class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = body as ApiErrorDetails & {error?: string};
    const message = typeof error?.error === 'string' ? error.error : 'Something went wrong. Please try again.';
    const code = typeof error?.code === 'string' && /^[A-Z_]{3,60}$/.test(error.code) ? error.code : undefined;
    throw new ApiError(message, response.status, code);
  }
  return body as T;
}

type SessionResult = { active: boolean; studentId?: string; csrfToken?: string };
type Challenge = { image: string; csrfToken: string };
type LoginResult = {
  ok: boolean;
  verified: boolean;
  stage: string;
  studentId: string;
  csrfToken: string;
};

function Logo({ light = false }: {light?: boolean}) {
  return <span className={'at-logo ' + (light ? 'at-logo-light' : '')}>
    <span className="at-logo-mark"><GraduationCap size={21} strokeWidth={2.2}/></span>
    <span className="at-logo-word">attendly<span>.</span></span>
  </span>;
}

const weights = [
  {part:'L',label:'Lecture',weight:'100%'},
  {part:'T',label:'Tutorial',weight:'50%'},
  {part:'P',label:'Practical',weight:'50%'},
  {part:'S',label:'Skill',weight:'25%'},
];

export default function Home() {
  const [stage, setStage] = useState<Stage>('checking');
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [captcha, setCaptcha] = useState('');
  const [captchaImage, setCaptchaImage] = useState('');
  const [csrf, setCsrf] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');

  useEffect(() => {
    let active = true;
    void api<SessionResult>('/api/erp/session').then(session => {
      if (!active) return;
      if (session.active && session.studentId && session.csrfToken) {
        setStudentId(session.studentId);
        setCsrf(session.csrfToken);
        setStage('authenticated');
      } else {
        setStage('initial');
      }
    }).catch(err => {
      if (!active) return;
      setStage(err instanceof ApiError && err.status === 503 ? 'unavailable' : 'initial');
      setError(err instanceof Error ? err.message : 'Could not check your session.');
    });
    return () => { active = false; };
  }, []);

  async function startChallenge() {
    setBusy(true);
    setError('');
    setErrorCode('');
    setPassword('');
    setCaptcha('');
    setCaptchaImage('');
    try {
      const result = await api<Challenge>('/api/erp/challenge', {method: 'POST'});
      if (!result.csrfToken || !result.image.startsWith('data:image/')) {
        throw new Error('The verification image was unavailable.');
      }
      setCsrf(result.csrfToken);
      setCaptchaImage(result.image);
      setStage('challenge');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the verification image.');
      if (err instanceof ApiError && err.status === 503) setStage('unavailable');
    } finally {
      setBusy(false);
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setErrorCode('');
    try {
      const result = await api<LoginResult>('/api/erp/login', {
        method: 'POST',
        headers: {'Content-Type':'application/json', 'X-Attendly-CSRF':csrf},
        body: JSON.stringify({studentId, password, captcha, consent}),
      });
      if (result.ok !== true || result.verified !== true || result.stage !== 'login-only'
          || !result.studentId || !result.csrfToken) {
        throw new Error('Your ERP session could not be verified.');
      }
      setPassword('');
      setCaptcha('');
      setCaptchaImage('');
      setCsrf(result.csrfToken);
      setStudentId(result.studentId);
      setStage('authenticated');
    } catch (err) {
      // Every failed attempt consumes the upstream CAPTCHA session.
      setPassword('');
      setCaptcha('');
      setCaptchaImage('');
      setStage('initial');
      setError(err instanceof Error ? err.message : 'Could not verify your ERP login.');
      if (err instanceof ApiError && err.code) setErrorCode(err.code);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setError('');
    try {
      await api('/api/erp/logout', {
        method: 'POST',
        headers: {'X-Attendly-CSRF': csrf},
      });
      // Import only after successful logout to avoid storing any ERP tokens in the browser.
      const {clearERP} = await import('../lib/erp_cache');
      await clearERP().catch(() => {});
      setStudentId('');
      setPassword('');
      setCaptcha('');
      setCaptchaImage('');
      setCsrf('');
      setStage('initial');
      setConsent(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign out. Please retry.');
    } finally {
      setBusy(false);
    }
  }

  if (stage === 'authenticated' && csrf && studentId) {
    return <AttendanceStep studentId={studentId} csrfToken={csrf}
      onLogout={() => void logout()} loggingOut={busy} logoutError={error}/>;
  }

  return <div className="at-auth-page">
    <header className="at-auth-header">
      <Logo/>
      <span className="at-header-label"><span className="at-header-label-dot"/> Independent student workspace</span>
    </header>

    <main className="at-auth-main">
      <div className="at-auth-grid">
        <section className="at-auth-copy">
          <div className="at-kicker"><Sparkles size={14}/> YOUR ATTENDANCE, SIMPLIFIED</div>
          <h1>Every class<br/><span>counts.</span></h1>
          <p className="at-auth-subtitle">Your attendance, all in one place. Connect your ERP account to see a clear picture of every subject, every component and your overall progress.</p>

          <div className="at-login-card">
            <div className="at-login-heading">
              <div className="at-login-icon"><LockKeyhole size={20}/></div>
              <div>
                <h2>{stage === 'challenge' ? 'Sign in to your ERP' : 'Welcome to Attendly'}</h2>
                <p>{stage === 'challenge' ? 'Complete the verification to continue.' : 'Your student workspace starts here.'}</p>
              </div>
            </div>

            {error && <div className="at-message at-message-error" role="alert">
              <span>{error}</span>
              {errorCode && <small>Reference: {errorCode}</small>}
            </div>}

            {stage === 'checking' && <div className="at-connection-wait" role="status">
              <span className="at-spinner"/> Checking your secure session…
            </div>}

            {stage === 'unavailable' && <div className="at-connection-wait">
              <ShieldCheck size={19}/>
              <div><strong>Private access only</strong><p>This ERP connection is available only on an authorized private preview.</p></div>
            </div>}

            {stage === 'initial' && <>
              <div className="at-login-points">
                <div><span><Check size={15}/></span> Live LTPS attendance</div>
                <div><span><Check size={15}/></span> Subject-wise insights</div>
                <div><span><Check size={15}/></span> Weighted attendance planner</div>
              </div>
              <button className="at-btn at-btn-primary at-btn-wide" type="button"
                disabled={busy} onClick={() => void startChallenge()}>
                {busy ? <><span className="at-spinner at-spinner-white"/> Connecting…</>
                  : <>Connect to KL ERP <ArrowRight size={18}/></>}
              </button>
            </>}

            {stage === 'challenge' && <form className="at-login-form" onSubmit={e => void login(e)}>
              <label htmlFor="at-student-id">Student ID</label>
              <input id="at-student-id" inputMode="numeric" autoComplete="username"
                placeholder="Enter your ERP student ID" required value={studentId}
                onChange={e => setStudentId(e.target.value)} disabled={busy}/>

              <label htmlFor="at-password">ERP password</label>
              <div className="at-input-wrap">
                <input id="at-password" type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your ERP password" autoComplete="off" required
                  value={password} onChange={e => setPassword(e.target.value)} disabled={busy}/>
                <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword(!showPassword)} disabled={busy}>
                  {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
                </button>
              </div>

              <div className="at-captcha-row">
                <label htmlFor="at-captcha">Security verification</label>
                <button type="button" className="at-text-button" disabled={busy}
                  onClick={() => void startChallenge()}><RefreshCw size={14}/> New code</button>
              </div>
              <div className="at-captcha-image"><img src={captchaImage} alt="Official KL ERP verification image"/></div>
              <input id="at-captcha" placeholder="Type the code shown above" autoComplete="off"
                value={captcha} onChange={e => setCaptcha(e.target.value)} disabled={busy} required/>

              <label className="at-consent">
                <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/>
                <span>I'm signing in to my own authorized ERP account.</span>
              </label>

              <button className="at-btn at-btn-primary at-btn-wide" type="submit"
                disabled={busy || !consent || !captcha.trim()}>
                {busy ? <><span className="at-spinner at-spinner-white"/> Verifying…</>
                  : <>Sign in securely <ArrowRight size={18}/></>}
              </button>
              <button className="at-login-back" type="button" disabled={busy}
                onClick={() => {setStage('initial');setError('');setPassword('');setCaptcha('');}}>
                Back to start
              </button>
            </form>}

            <div className="at-login-security"><ShieldCheck size={17}/><span>Session protected. Passwords aren't saved on this device.</span></div>
          </div>
        </section>

        <aside className="at-auth-art" aria-label="LTPS attendance weighting">
          <div className="at-art-topline"><span>ANALYZE SMARTER</span><ArrowUpRight size={18}/></div>
          <div className="at-art-orbit" aria-hidden="true">
            <div className="at-art-ring-one"><div className="at-art-ring-two">
              <div className="at-art-center"><GraduationCap size={31}/><strong>LTPS</strong><span>in focus</span></div>
            </div></div>
            <span className="at-art-orbit-dot at-dot-one"/><span className="at-art-orbit-dot at-dot-two"/>
            <span className="at-art-orbit-dot at-dot-three"/>
          </div>
          <div className="at-art-bottom">
            <span className="at-art-caption">ONE CLEAR VIEW</span>
            <h2>See the bigger<br/>picture.</h2>
            <p>Lecture, tutorial, practical and skill attendance—beautifully organized and accurately weighted.</p>
            <div className="at-art-weight-grid">
              {weights.map(item => <div key={item.part}>
                <span>{item.part}</span><div><strong>{item.weight}</strong><small>{item.label}</small></div>
              </div>)}
            </div>
          </div>
        </aside>
      </div>
    </main>

    <footer className="at-auth-footer">
      <span>© {new Date().getFullYear()} Attendly</span>
      <span>Independent student project · Not affiliated with KL University</span>
    </footer>
  </div>;
}
