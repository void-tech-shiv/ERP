/**
 * Only the official student login POST is PJAX-enabled. The attendance
 * POST and CAPTCHA/image GET requests retain their observed headers.
 */
export function usesPjaxLogin(method: string, targetUrl: string): boolean {
  try {
    const target=new URL(targetUrl);
    return method.toUpperCase()==='POST' &&
      target.protocol==='https:' &&
      target.hostname==='newerp.kluniversity.in' &&
      target.pathname==='/index.php' &&
      target.searchParams.get('r')==='site/login';
  } catch {
    return false;
  }
}


/** The university timetable form is a GET form with data-pjax="1".
 * Mirror this first-party browser request mode only for this fixed route.
 * Never enable PJAX for arbitrary URLs or attendance/CAPTCHA requests.
 */
export function usesPjaxTimetable(method:string,targetUrl:string):boolean {
  try {
    const target=new URL(targetUrl);
    return method.toUpperCase()==='GET'&&
      target.protocol==='https:'&&
      target.hostname==='newerp.kluniversity.in'&&
      target.pathname==='/index.php'&&
      target.searchParams.get('r')===
        'timetables/universitymasteracademictimetableview/individualstudenttimetableget';
  }catch{return false;}
}
