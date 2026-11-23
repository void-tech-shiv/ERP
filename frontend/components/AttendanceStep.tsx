'use client';

import { useEffect, useMemo, useState } from 'react';
import { fmt, totals, PARTS, WEIGHTS, type Course } from '../lib/calculator';
import { readERP, writeERP } from '../lib/erp_cache';

type Terms = { years: string[]; semesters: string[] };
type AttendanceResult = {
  source: 'erp';
  student: { id: string };
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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    cache: 'no-store', credentials: 'same-origin', ...init,
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data &&
      typeof data.error === 'string' ? data.error : '';
    if (response.status === 401) throw new Error('ERP session expired. Sign in again.');
    throw new Error(message || 'ERP attendance request failed (HTTP ' + response.status + ')');
  }
  return data as T;
}

function isCount(x: unknown): x is { attended: number; conducted: number } {
  if (!x || typeof x !== 'object') return false;
  const value = x as { attended?: unknown; conducted?: unknown };
  return Number.isSafeInteger(value.attended) &&
    Number.isSafeInteger(value.conducted) &&
    (value.attended as number) >= 0 &&
    (value.conducted as number) >= (value.attended as number);
}

function validateAttendance(raw: AttendanceResult, studentId: string, year: string, semester: string): Course[] {
  if (!raw || raw.source !== 'erp' || raw.student?.id !== studentId ||
      raw.academicYear !== year || raw.semester !== semester ||
      !Array.isArray(raw.courses) || raw.courses.length > 100) {
    throw new Error('Unexpected attendance data returned by ERP adapter');
  }
  const seen = new Set<string>();
  for (const course of raw.courses) {
    if (!course || typeof course.code !== 'string' || !course.code ||
        typeof course.name !== 'string' || !course.name || seen.has(course.code) ||
        !course.components || typeof course.components !== 'object' ||
        !PARTS.some(part => isCount(course.components[part]))) {
      throw new Error('Invalid course record in ERP attendance');
    }
    for (const part of PARTS) {
      if (course.components[part] && !isCount(course.components[part])) {
        throw new Error('Invalid LTPS counts in ERP attendance');
      }
    }
    seen.add(course.code);
  }
  return raw.courses;
}

function numeric(n: number) {
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

/**
 * Explicit second step. Mounted only once the LOGIN flow independently verified
 * the student's ERP identity. No upstream request fires on mount or after login.
 */
export default function AttendanceStep({
  studentId, csrfToken,
}: {
  studentId: string; csrfToken: string;
}) {
  const [terms, setTerms] = useState<Terms | null>(null);
  const [year, setYear] = useState('');
  const [semester, setSemester] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading-terms' | 'ready' | 'fetching'>('idle');
  const [error, setError] = useState('');
  const [display, setDisplay] = useState<DisplayData | null>(null);

  // Only locally cached academic data is restored; no ERP calls are made here.
  useEffect(() => {
    let active = true;
    void readERP(studentId).then(cached => {
      if (active && cached && Array.isArray(cached.courses)) {
        setDisplay({ ...cached, cached: true });
      }
    }).catch(() => { /* IndexedDB might be unavailable in private browsing */ });
    return () => { active = false; };
  }, [studentId]);

  async function loadTerms() {
    setError('');
    setStatus('loading-terms');
    try {
      const data = await api<Terms>('/api/erp/terms');
      const years = Array.isArray(data.years)
        ? data.years.filter(v => typeof v === 'string' && v.length <= 40) : [];
      const semesters = Array.isArray(data.semesters)
        ? data.semesters.filter(v => typeof v === 'string' && v.length <= 40) : [];
      if (!years.length || !semesters.length) {
        throw new Error('The ERP returned no selectable academic years or semesters');
      }
      setTerms({ years, semesters });
      // Force deliberate choice. ERP's internal numeric IDs are never hardcoded.
      setYear('');
      setSemester('');
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load academic terms');
      setStatus('idle');
    }
  }

  async function loadAttendance() {
    if (!terms || !terms.years.includes(year) || !terms.semesters.includes(semester)) {
      setError('Select an academic year and semester first.');
      return;
    }
    setStatus('fetching');
    setError('');
    try {
      const raw = await api<AttendanceResult>('/api/erp/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Attendly-CSRF': csrfToken },
        body: JSON.stringify({ academicYear: year, semester }),
      });
      const courses = validateAttendance(raw, studentId, year, semester);
      const savedAt = new Date().toISOString();
      const next: DisplayData = { academicYear: year, semester, courses, savedAt, cached: false };
      setDisplay(next);
      // Optional best-effort cache; only academic counts, never credentials,
      // CSRF, CAPTCHA, ERP session cookies or the original response HTML.
      try { await writeERP({ studentId, academicYear: year, semester, courses, savedAt }); }
      catch { /* Display still works when IndexedDB is blocked */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not fetch attendance');
      // Do not replace previously fetched data with a failed response.
    } finally {
      setStatus('ready');
    }
  }

  const summary = useMemo(() => {
    if (!display) return null;
    const all = display.courses.map(totals);
    const attended = all.reduce((value, row) => value + row.a, 0);
    const conducted = all.reduce((value, row) => value + row.t, 0);
    return {
      attended, conducted,
      percent: conducted > 0 ? (100 * attended / conducted) : null,
    };
  }, [display]);

  const busy = status === 'fetching' || status === 'loading-terms';

  return <section className="private-card" aria-label="ERP Attendance">
    <div className="private-attendance-heading">
      <div><small>STEP 2 · ATTENDANCE</small><h2>Fetch real LTPS attendance</h2></div>
      <span className="private-live-pill">Authenticated ERP session</span>
    </div>
    <p>First load the available academic terms from ERP, then choose the year and semester
      you want to calculate. Nothing is fetched automatically at login.</p>

    {!terms && <button type="button" disabled={busy} onClick={() => void loadTerms()}>
      {status === 'loading-terms' ? 'Loading academic terms…' : 'Load academic years & semesters'}
    </button>}

    {terms && <>
      <div className="private-fields">
        <label>Academic year
          <select value={year} disabled={busy} onChange={e => setYear(e.target.value)}>
            <option value="">Select academic year</option>
            {terms.years.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label>Semester
          <select value={semester} disabled={busy} onChange={e => setSemester(e.target.value)}>
            <option value="">Select semester</option>
            {terms.semesters.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
      </div>
      <div className="private-attendance-actions">
        <button type="button" disabled={busy || !year || !semester}
          onClick={() => void loadAttendance()}>
          {status === 'fetching' ? 'Fetching ERP attendance…' : 'Fetch attendance'}
        </button>
        <button type="button" className="secondary" disabled={busy}
          onClick={() => void loadTerms()}>Reload terms</button>
      </div>
    </>}

    {error && <p className="private-attendance-error" role="alert">{error}</p>}

    {display && summary && <div className="private-attendance-results">
      <div className="private-attendance-meta">
        <strong>{display.academicYear} · {display.semester}</strong>
        <span>{display.cached ? 'Saved copy' : 'Fetched from ERP'} · {new Date(display.savedAt).toLocaleString()}</span>
      </div>
      {display.cached && <div className="private-saved-note">
        Showing a saved attendance copy on this device. Select the term above and fetch to update it.
      </div>}
      <div className="private-overall">
        <small>OVERALL WEIGHTED ATTENDANCE</small>
        <strong>{fmt(summary.percent)}</strong>
        <span>{numeric(summary.attended)} weighted attended / {numeric(summary.conducted)} weighted conducted · {display.courses.length} subjects</span>
      </div>
      {!display.courses.length ? <p>No classes recorded for the selected academic term.</p> :
        <div className="private-table-wrap">
          <table>
            <thead><tr><th>Subject</th><th>LTPS breakdown</th><th>Weighted %</th></tr></thead>
            <tbody>{display.courses.map(course =>
              <tr key={course.code}>
                <td><strong>{course.name}</strong><small>{course.code}</small></td>
                <td>{PARTS.filter(part => course.components[part]).map(part => {
                  const item = course.components[part]!;
                  return <div key={part}><b>{part}</b> · {item.attended}/{item.conducted}
                    <span className="private-component-weight"> (×{WEIGHTS[part]})</span>
                  </div>;
                })}</td>
                <td><strong>{fmt(totals(course).percentage)}</strong></td>
              </tr>
            )}</tbody>
          </table>
        </div>
      }
      <p className="private-foot">Weights: L = 100%, T = 50%, P = 50%, S = 25%.
        This is your requested weighted calculation; the university may determine
        official eligibility differently.</p>
    </div>}
  </section>;
}
