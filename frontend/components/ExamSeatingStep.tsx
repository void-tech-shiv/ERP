'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, CalendarDays, Clock3, MapPin, RefreshCw, ShieldCheck } from 'lucide-react';

type ExamSeat={
  refId:string; examDate:string; examType:string; examSlot:string;
  courseCode:string; roomNo:string;
};
type SeatingResponse={source:'erp';records:ExamSeat[];count:number};
type Filter='all'|'upcoming'|'past';

function isSeating(value:unknown):value is SeatingResponse {
  if(!value||typeof value!=='object')return false;
  const result=value as Partial<SeatingResponse>;
  return result.source==='erp'&&Array.isArray(result.records)&&
    result.records.length<=300&&result.count===result.records.length&&
    result.records.every((record:unknown)=>{
      if(!record||typeof record!=='object')return false;
      const s=record as Record<string,unknown>;
      return ['refId','examDate','examType','examSlot','courseCode','roomNo']
        .every(k=>typeof s[k]==='string'&&!!s[k]&&(s[k] as string).length<=100)&&
        /^\d{4}-\d{2}-\d{2}$/.test(s.examDate as string);
    });
}
function prettyDate(date:string){
  const value=new Date(date+'T12:00:00');
  return Number.isNaN(value.getTime())?date:
    value.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
}
function localToday(){
  const now=new Date();
  return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),
    String(now.getDate()).padStart(2,'0')].join('-');
}

export default function ExamSeatingStep(){
  const [records,setRecords]=useState<ExamSeat[]|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [refresh,setRefresh]=useState(0);
  const [filter,setFilter]=useState<Filter>('all');

  useEffect(()=>{
    const controller=new AbortController();
    async function load(){
      setLoading(true);setError('');
      try{
        const response=await fetch('/api/erp/seating',{
          credentials:'same-origin',cache:'no-store',signal:controller.signal
        });
        if(!response.ok){
          throw new Error(response.status===401
            ? 'Your ERP session has expired. Please sign in again.'
            : 'Could not fetch exam seating from ERP. Please retry.');
        }
        const json:unknown=await response.json();
        if(!isSeating(json))throw new Error('ERP returned an unexpected seating plan format.');
        if(!controller.signal.aborted)setRecords(json.records);
      }catch(e){
        if(!controller.signal.aborted)
          setError(e instanceof Error?e.message:'Failed to fetch exam seating.');
      }finally{
        if(!controller.signal.aborted)setLoading(false);
      }
    }
    void load();
    return ()=>controller.abort();
  },[refresh]);

  const today=localToday();
  const upcoming=useMemo(()=>records?.filter(r=>r.examDate>=today)||[],[records,today]);
  const past=useMemo(()=>records?.filter(r=>r.examDate<today)||[],[records,today]);
  const shown=useMemo(()=>{
    const list=filter==='upcoming'?upcoming:filter==='past'?past:(records||[]);
    return [...list].sort((a,b)=>filter==='upcoming'
      ?a.examDate.localeCompare(b.examDate):b.examDate.localeCompare(a.examDate));
  },[filter,upcoming,past,records]);

  return <div className="at-seating">
    <div className="at-seating-heading">
      <div><span className="at-section-label"><span className="at-label-dot"/> EXAM DETAILS</span>
        <h1>Exam seating plan</h1>
        <p>Dates, exam slots and allotted rooms from your KL ERP account.</p>
      </div>
      <button className="at-btn at-btn-primary" type="button" disabled={loading}
        onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={16}/>
        {loading?'Loading…':'Refresh seating'}
      </button>
    </div>

    {error&&<div className="at-message at-message-error" role="alert">{error}</div>}
    {loading&&!records&&<div className="at-panel at-seating-loading">
      <span className="at-spinner"/> Reading all pages of your ERP seating plan…
    </div>}

    {records&&<>
      <div className="at-seating-stats">
        <div><span>Exam entries</span><strong>{records.length}</strong><small>All pages from ERP</small></div>
        <div><span>Upcoming</span><strong>{upcoming.length}</strong><small>Today and later</small></div>
        <div><span>Completed dates</span><strong>{past.length}</strong><small>Before today</small></div>
      </div>
      <section className="at-panel at-seating-panel">
        <div className="at-panel-head at-seating-panel-head">
          <div><h2>Room allotments</h2><p>Select a filter to review your exam schedule.</p></div>
          <div className="at-seating-filters" role="group" aria-label="Exam date filter">
            {([['all','All'],['upcoming','Upcoming'],['past','Past']] as const).map(([key,label])=>
              <button key={key} type="button" onClick={()=>setFilter(key)}
                className={filter===key?'active':''} aria-pressed={filter===key}>{label}</button>)}
          </div>
        </div>

        {!shown.length&&<div className="at-seating-empty">
          <CalendarDays size={28}/>
          <strong>{filter==='upcoming'?'No upcoming exams listed':
            filter==='past'?'No past exams listed':'No exam allotments found'}</strong>
          <p>Only entries returned by the ERP are displayed. Check the official portal for updates.</p>
        </div>}

        {shown.length>0&&<div className="at-seating-table-wrap">
          <table className="at-seating-table">
            <thead><tr><th>Exam date</th><th>Course code</th><th>Exam type</th><th>Slot</th><th>Allotted room</th></tr></thead>
            <tbody>{shown.map(seat=><tr key={seat.refId}>
              <td><div className="at-seating-date"><CalendarDays size={16}/>
                <strong>{prettyDate(seat.examDate)}</strong></div>
                <small>{seat.examDate>=today?'Upcoming / today':'Past date'}</small>
              </td>
              <td><span className="at-seating-course"><BookOpen size={15}/>{seat.courseCode}</span></td>
              <td>{seat.examType}</td>
              <td><span className="at-seating-slot"><Clock3 size={14}/>{seat.examSlot.toUpperCase()}</span></td>
              <td><span className="at-seating-room"><MapPin size={16}/>{seat.roomNo}</span></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
      <div className="at-seating-notice">
        <ShieldCheck size={19}/>
        <p>Exam dates, slots and rooms are displayed exactly as provided by the university ERP.
          A slot code is not a confirmed start time. Always verify your official hall ticket
          and latest ERP notice before an exam. Seating information is not stored locally.</p>
      </div>
    </>}
  </div>;
}
