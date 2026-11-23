/**
 * The official ERP can return an HTTP 200 for an intermediate index/PJAX page.
 * Only this fixed student dashboard endpoint may be used for a final verification
 * probe; never follow a caller-supplied URL to discover authentication.
 */
const ROOT='https://newerp.kluniversity.in';

export function isStudentDashboardTarget(candidate: string): boolean {
  try {
    const u=new URL(candidate);
    return u.origin===ROOT && u.pathname==='/index.php' &&
      u.searchParams.get('r')==='site/indexindi';
  } catch { return false; }
}

export function needsDashboardProbe(candidate: string, alreadyProbed: boolean): boolean {
  return !alreadyProbed && !isStudentDashboardTarget(candidate);
}

export function dashboardRouteKind(candidate: string): 'student-home' | 'index' | 'other' {
  if (isStudentDashboardTarget(candidate)) return 'student-home';
  try {
    const u=new URL(candidate);
    if (u.origin===ROOT && (u.pathname==='/index.php'||u.pathname==='/')) return 'index';
  } catch {}
  return 'other';
}

export function htmlSizeBand(length: number): 'small' | 'medium' | 'large' | 'oversize' {
  if (length>2_000_000) return 'oversize';
  if (length>1_000_000) return 'large';
  if (length>256_000) return 'medium';
  return 'small';
}
