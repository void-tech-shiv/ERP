import { load } from 'cheerio';

/**
 * Safe authentication evidence from a server-rendered ERP HTML document.
 * This does NOT treat HTTP 200, 302 or a random student ID as authentication.
 * Never return page text, student ID, cookies or raw HTML from diagnostics.
 */
export type ERPPageEvidence = {
  verified: boolean;
  loginForm: boolean;
  identityVisible: boolean;
  welcomeVisible: boolean;
  dashboardMarkers: boolean;
};

export function inspectERPPage(html: string, studentId: string): ERPPageEvidence {
  if (!/^[0-9]{5,24}$/.test(studentId) || html.length > 2_000_000) {
    return { verified: false, loginForm: false, identityVisible: false,
      welcomeVisible: false, dashboardMarkers: false };
  }
  const $=load(html);
  const loginForm=Boolean(
    $('input[name="LoginForm[password]"]').length ||
    ($('input[name="LoginForm[username]"]').length && $('input[name="LoginForm[captcha]"]').length)
  );
  const hasLogout=Boolean(
    $('a[href*="logout"], form[action*="logout"], button[name*="logout"]').length
  );
  const hasAttendance=Boolean(
    $('a[href*="studentattendance"], a[href*="attendance%2F"]').length
  );
  $('script,style,noscript').remove();
  const visible=$('body').text().replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  const idPattern=new RegExp('(^|\\D)'+studentId+'(?=\\D|$)');
  const identityVisible=idPattern.test(visible);
  const welcomeVisible=new RegExp('\\bWelcome\\s+'+studentId+'\\b','i').test(visible);
  const dashboardMarkers=hasAttendance || hasLogout ||
    /Journals\s*&\s*Conferences|Awards\s*&\s*Recognitions/i.test(visible);
  // Match the observed ERP dashboard, with a conservative alternative
  // for minor copy changes (visible identity + protected navigation).
  const verified=!loginForm && (welcomeVisible || (identityVisible && dashboardMarkers));
  return { verified, loginForm, identityVisible, welcomeVisible, dashboardMarkers };
}
