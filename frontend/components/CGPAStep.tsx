'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, GraduationCap, RefreshCw, ShieldCheck } from 'lucide-react';

type Course = {
  code:string; name:string; grade:string; gradePoint:number; credits:number;
  promotion:string; academicYear:string; semester:string;
};
type Report = {
  source:'erp'; cgpa:number; registeredCredits:number; declaredCredits:number;
  obtainedCredits:number; awaitingCredits:number; cumulative:number;
  courses:Course[];
};
function validReport(value:unknown):value is Report {
  if(!value||typeof value!=='object')return false;
  const report=value as Partial<Report>;
  return report.source==='erp'&&typeof report.cgpa==='number'&&
    report.cgpa>=0&&report.cgpa<=10&&
    ['registeredCredits','declaredCredits','obtainedCredits','awaitingCredits','cumulative']
      .every(key=>typeof (report as unknown as Record<string,unknown>)[key]==='number')&&
    Array.isArray(report.courses)&&report.courses.length<=400;
}
function num(value:number):string {
  return Number.isInteger(value)?String(value):value.toFixed(2);
}
export default function CGPAStep(){
  const [report,setReport]=useState<Report|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [refetch,setRefetch]=useState(0);

  // Only fetch when the student selects the CGPA sidebar tab.
  // Grades are intentionally never persisted in localStorage or IndexedDB.
  useEffect(()=>{
    const controller=new AbortController();
    async function sync(){
      setLoading(true);setError('');
      try{
        const response=await fetch('/api/erp/cgpa',{
          credentials:'same-origin',cache:'no-store',signal:controller.signal
        });
        if(!response.ok){
          throw new Error(response.status===401
            ? 'Your ERP session expired. Sign in again.'
            : 'CGPA could not be retrieved from ERP. Please retry.');
        }
        const payload:unknown=await response.json();
        if(!validReport(payload))throw new Error('ERP returned an unexpected CGPA format.');
        if(!controller.signal.aborted)setReport(payload);
      }catch(e){
        if(!controller.signal.aborted)
          setError(e instanceof Error?e.message:'Unable to fetch CGPA.');
      }finally{
        if(!controller.signal.aborted)setLoading(false);
      }
    }
    void sync();
    return ()=>controller.abort();
  },[refetch]);

  const groups=useMemo(()=>{
    const map=new Map<string,{year:string;semester:string;courses:Course[]}>();
    for(const c of report?.courses||[]){
      const key=c.academicYear+'|'+c.semester;
      const group=map.get(key)||{year:c.academicYear,semester:c.semester,courses:[]};
      group.courses.push(c);
      map.set(key,group);
    }
    return [...map.values()];
  },[report]);

  return <div className="at-cgpa">
    <div className="at-cgpa-toolbar">
      <div><div className="at-section-label">OFFICIAL ERP RESULTS</div>
        <h2>My CGPA</h2><p>Your cumulative result and course-wise grades, straight from ERP.</p></div>
      <button className="at-btn at-btn-primary" type="button" disabled={loading}
        onClick={()=>setRefetch(v=>v+1)}>
        <RefreshCw size={16}/> {loading?'Loading results…':'Refresh CGPA'}
      </button>
    </div>

    {error&&<div role="alert" className="at-message at-message-error">{error}</div>}
    {loading&&!report&&<section className="at-panel at-cgpa-loading">
      <span className="at-spinner"/> Retrieving CGPA from your authenticated ERP session…
    </section>}

    {report&&<>
      <div className="at-cgpa-summary">
        <section className="at-cgpa-hero">
          <div className="at-cgpa-eyebrow"><GraduationCap size={17}/> CUMULATIVE GRADE POINT AVERAGE</div>
          <strong>{report.cgpa.toFixed(2)}</strong><span>Out of 10.00 · As reported by ERP</span>
        </section>
        <section className="at-cgpa-credits">
          <h3>Credits & results</h3>
          <div className="at-cgpa-credit-grid">
            <div><span>Registered credits</span><strong>{num(report.registeredCredits)}</strong></div>
            <div><span>Declared credits</span><strong>{num(report.declaredCredits)}</strong></div>
            <div><span>Obtained credits</span><strong>{num(report.obtainedCredits)}</strong></div>
            <div><span>Awaiting credits</span><strong>{num(report.awaitingCredits)}</strong></div>
          </div>
          <p>ERP cumulative value: <strong>{num(report.cumulative)}</strong></p>
        </section>
      </div>

      <div className="at-cgpa-head"><h2>Course results <span>{report.courses.length}</span></h2>
        <p>Grouped by registration year and semester. These are course grades, not calculated SGPA values.</p>
      </div>
      {groups.map(group=><section className="at-panel at-cgpa-group"
        key={group.year+'-'+group.semester}>
        <div className="at-cgpa-group-head"><BookOpen size={18}/>
          <strong>{group.year} · {group.semester}</strong>
          <span>{group.courses.length} courses</span></div>
        <div className="at-cgpa-table-wrap">
          <table className="at-cgpa-table">
            <thead><tr><th>Course</th><th>Grade</th><th>Grade point</th><th>Credits</th><th>Promotion</th></tr></thead>
            <tbody>{group.courses.map((course,index)=><tr key={course.code+'-'+index}>
              <td><strong>{course.name}</strong><small>{course.code}</small></td>
              <td><span className="at-grade-badge">{course.grade}</span></td>
              <td>{num(course.gradePoint)}</td>
              <td>{num(course.credits)}</td>
              <td>{course.promotion||'—'}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>)}
      <div className="at-cgpa-foot"><ShieldCheck size={17}/>
        <p>Grades and CGPA are displayed as provided by the university ERP.
          Credit totals and eligibility should be verified on the official portal.
          This page does not store grade data on your device.</p></div>
    </>}
  </div>;
}
