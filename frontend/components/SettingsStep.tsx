'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  CalendarDays, Check, Eye, EyeOff, GraduationCap, LockKeyhole,
  Save, Settings2, ShieldCheck, UserRound,
} from 'lucide-react';
import {
  sanitizeStudentPreferences, type StudentPreferences,
} from '../lib/student_preferences';

type Terms={years:string[];semesters:string[]};
type Props={
  preferences:StudentPreferences;
  terms:Terms|null;
  busy:boolean;
  onSave:(prefs:StudentPreferences)=>void;
};

export default function SettingsStep({preferences,terms,busy,onSave}:Props){
  const [draft,setDraft]=useState<StudentPreferences>(preferences);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  useEffect(()=>{
    setDraft(preferences);
  },[preferences]);

  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setError('');
    setMessage('');
    const value=sanitizeStudentPreferences(draft);
    const hasYear=Boolean(value.currentYear);
    const hasSemester=Boolean(value.currentSemester);
    if(hasYear!==hasSemester){
      setError('Choose both academic year and semester, or leave both blank.');
      return;
    }
    if(hasYear&&(!terms?.years.includes(value.currentYear)||
      !terms?.semesters.includes(value.currentSemester))){
      setError('The selected session is not available in your authenticated ERP account.');
      return;
    }
    onSave(value);
    setMessage('Settings saved on this device for your student account.');
  }

  return <div className="at-settings">
    <div className="at-settings-intro">
      <div><div className="at-section-label">PREFERENCES</div>
        <h1>Settings</h1>
        <p>Personalize your student workspace. Your choices are saved on this device.</p></div>
      <span className="at-session-badge"><ShieldCheck size={16}/> Private preferences</span>
    </div>

    <form className="at-settings-form" onSubmit={submit}>
      <section className="at-panel at-settings-panel">
        <div className="at-settings-panel-head">
          <div className="at-settings-icon"><UserRound size={21}/></div>
          <div><h2>Profile & greeting</h2>
            <p>Choose the name shown in your Overview greeting.</p></div>
        </div>
        <label className="at-settings-label" htmlFor="at-settings-nickname">Your nickname</label>
        <input id="at-settings-nickname" type="text" maxLength={32}
          autoComplete="off" value={draft.nickname} placeholder="e.g. Shiv"
          onChange={e=>setDraft(previous=>({...previous,nickname:e.target.value}))}/>
        <small>Optional · maximum 32 characters. This does not change your university ERP profile.</small>
      </section>

      <section className="at-panel at-settings-panel">
        <div className="at-settings-panel-head">
          <div className="at-settings-icon"><CalendarDays size={21}/></div>
          <div><h2>Current academic session</h2>
            <p>Your saved semester automatically loads attendance and today’s classes on Overview.</p></div>
        </div>
        <div className="at-settings-term-fields">
          <label className="at-settings-label" htmlFor="at-settings-year">Academic year
            <select id="at-settings-year" value={draft.currentYear}
              disabled={busy||!terms}
              onChange={e=>setDraft(previous=>({...previous,currentYear:e.target.value}))}>
              <option value="">{!terms?'Loading academic years…':'Choose year'}</option>
              {terms?.years.map(item=><option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="at-settings-label" htmlFor="at-settings-semester">Semester
            <select id="at-settings-semester" value={draft.currentSemester}
              disabled={busy||!terms}
              onChange={e=>setDraft(previous=>({...previous,currentSemester:e.target.value}))}>
              <option value="">{!terms?'Loading semesters…':'Choose semester'}</option>
              {terms?.semesters.map(item=><option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <small>Only available ERP terms can be selected. After saving, Overview will automatically load this semester’s attendance and today’s timetable. You can still refresh manually.</small>
      </section>

      <section className="at-panel at-settings-panel">
        <div className="at-settings-panel-head">
          <div className="at-settings-icon"><GraduationCap size={21}/></div>
          <div><h2>CGPA privacy</h2>
            <p>Choose whether your CGPA is revealed on the Overview dashboard.</p></div>
        </div>
        <div className="at-settings-privacy-row">
          <div className="at-settings-privacy-description">
            {draft.showCgpa?<Eye size={20}/>:<EyeOff size={20}/>}
            <div><strong>{draft.showCgpa?'Show CGPA on Overview':'Hide CGPA on Overview'}</strong>
              <small>{draft.showCgpa?
                'Your Overview will retrieve and display your CGPA after login.':
                'Your CGPA stays masked on Overview until you choose to reveal it.'}</small></div>
          </div>
          <button type="button" role="switch" aria-label="Show CGPA on Overview"
            aria-checked={draft.showCgpa}
            className={'at-settings-toggle '+(draft.showCgpa?'enabled':'')}
            onClick={()=>setDraft(previous=>({...previous,showCgpa:!previous.showCgpa}))}>
            <span/>
          </button>
        </div>
        <p className="at-settings-privacy-tip"><LockKeyhole size={16}/>
          CGPA is hidden by default. Only your display preference is stored;
          grades and CGPA values are never saved in these settings.</p>
      </section>

      {error&&<div role="alert" className="at-message at-message-error">{error}</div>}
      {message&&<p role="status" className="at-settings-success"><Check size={17}/>{message}</p>}
      <div className="at-settings-actions">
        <p>Settings apply to this browser and your signed-in student account.</p>
        <button type="submit" className="at-btn at-btn-primary" disabled={busy}>
          <Save size={17}/> Save settings
        </button>
      </div>
    </form>
    <div className="at-settings-foot"><Settings2 size={16}/>
      University login, authentication and academic records are not changed by these settings.</div>
  </div>;
}
