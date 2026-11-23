/**
 * Builder-controlled trusted Attendly URL, not a student-entered login URL.
 * Keep all session cookies and CSRF checks on the existing first-party website.
 */
export type Connection =
  | { ok: true; url: string; origin: string }
  | { ok: false; reason: string };

function privateDevHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true;
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false;
  const nums=hostname.split('.').map(Number);
  if (nums.some(v => v<0 || v>255)) return false;
  return nums[0]===10 || nums[0]===127 ||
    (nums[0]===172 && nums[1]>=16 && nums[1]<=31) ||
    (nums[0]===192 && nums[1]===168);
}

export function resolveAttendlyUrl(raw: string | undefined, dev: boolean): Connection {
  if (!raw?.trim()) return {
    ok:false, reason:'Set EXPO_PUBLIC_ATTENDLY_URL to your own Attendly web server.',
  };
  try {
    const url=new URL(raw.trim());
    if (url.username || url.password || url.search || url.hash || url.pathname!=='/')
      return {ok:false,reason:'Use only a trusted site origin without credentials or query parameters.'};
    if (url.protocol!=='https:' && !(dev && url.protocol==='http:' && privateDevHost(url.hostname)))
      return {ok:false,reason:'HTTPS is required outside private-network development.'};
    return {ok:true,origin:url.origin,url:url.origin+'/'};
  } catch {
    return {ok:false,reason:'The Attendly URL is invalid.'};
  }
}

export function isAllowedNavigation(value:string, origin:string):boolean {
  if (value==='about:blank') return true;
  try {
    const url=new URL(value);
    return (url.protocol==='https:' || url.protocol==='http:') && url.origin===origin;
  } catch {
    return false;
  }
}
