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


/**
 * The student timetable results live at a browser-addressable GET URL.
 * Use a normal document-style GET rather than forcing PJAX/XHR; the
 * university may return a different fragment when X-PJAX is present.
 * Restrict this special request context to the exact first-party route.
 */
export function usesTimetableDocumentGet(method:string,targetUrl:string):boolean {
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
