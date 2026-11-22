import type { Course, Part } from './calculator';

export type DemoSessionInfo =
  | { active: false; mode: 'demo' }
  | { active: true; mode: 'demo'; student: { id: string; name: string }; csrfToken: string };

type ComponentCounts = { type: Part; attended: number; conducted: number };
export type DemoAttendance = {
  source: 'demo';
  student: { id: string; name: string };
  courses: Array<{ code: string; name: string; components: ComponentCounts[] }>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Demo session expired. Start a new demo.');
    if (response.status === 429) throw new Error('Too many demo sessions. Try again later.');
    throw new Error('Demo request failed (HTTP ' + response.status + '). Check that the backend is running.');
  }
  return response.json() as Promise<T>;
}

export const readDemoSession = () =>
  request<DemoSessionInfo>('/api/demo/session');

export const startDemoSession = () =>
  request<DemoSessionInfo>('/api/demo/session', {
    method: 'POST',
    headers: { 'X-Attendly-Demo': 'start' },
  });

export const fetchDemoAttendance = () =>
  request<DemoAttendance>('/api/demo/session/attendance');

export const endDemoSession = (csrfToken: string) =>
  request<DemoSessionInfo>('/api/demo/logout', {
    method: 'POST',
    headers: { 'X-Attendly-CSRF': csrfToken },
  });

export function toDashboardCourses(data: DemoAttendance): Course[] {
  if (data.source !== 'demo' || !Array.isArray(data.courses)) {
    throw new Error('Unexpected demo attendance response');
  }
  return data.courses.map(({ code, name, components }) => {
    const byPart: Course['components'] = {};
    for (const component of components) {
      if (!['L', 'T', 'P', 'S'].includes(component.type)) {
        throw new Error('Unexpected LTPS component in demo response');
      }
      byPart[component.type] = {
        attended: component.attended,
        conducted: component.conducted,
      };
    }
    return { code, name, components: byPart };
  });
}
