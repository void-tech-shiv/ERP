import { NextResponse } from 'next/server';
import { load } from 'cheerio';
import { resolveERPRedirect, type RedirectError } from '../../../../lib/server/erp_redirect';
import { inspectERPPage } from '../../../../lib/server/erp_auth_verify';
import { cookieTransition } from '../../../../lib/server/erp_diagnostics';
import { buildERPLoginForm } from '../../../../lib/server/erp_login_form';
import { classifyERPTransportError } from '../../../../lib/server/erp_transport';
import { dashboardRouteKind, htmlSizeBand, needsDashboardProbe } from '../../../../lib/server/erp_dashboard_probe';
import {
  clearERPState, fail, getERPState, setERPState, testingEnabled,
  upstream, validOrigin, validateCSRF
} from '../../../../lib/server/erp';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const ERP_ROOT='https://newerp.kluniversity.in';

type LoginIssue =
  | 'CAPTCHA_REJECTED' | 'CREDENTIALS_REJECTED'
  | 'CSRF_OR_SESSION_REJECTED' | 'ERP_LOGIN_NOT_CONFIRMED'
  | 'ERP_LOGIN_UNAVAILABLE' | 'ERP_LOGIN_TIMEOUT';

type SafeDiagnostic = {
  loginHttpStatus?: number;
  loginResponseType?: 'redirect' | 'login-form' | 'json' | 'html' | 'other';
  dashboardHttpStatus?: number;
  dashboardResponseType?: 'login-form' | 'html' | 'other';
  stage: 'login-post' | 'redirect' | 'dashboard' | 'session-write';
  redirectReason?: RedirectError | 'too_many_redirects';
  redirectKind?: 'index' | 'root';
  redirectSource?: 'location' | 'pjax-url' | 'fixed-fallback';
  redirectsFollowed?: number;
  upgradedHttps?: boolean;
  fallback?: 'index-probe' | 'dashboard-probe';
  loginFormDetected?: boolean;
  studentIdentityVisible?: boolean;
  dashboardMarkersDetected?: boolean;
  cookieCountBefore?: number;
  cookieCountAfterLogin?: number;
  cookieChangedOnLogin?: boolean;
  cookieCountAfterDashboard?: number;
  dashboardRoute?: 'student-home' | 'index' | 'other';
  dashboardSize?: 'small' | 'medium' | 'large' | 'oversize';
  upstreamError?: 'timeout' | 'upstream-error';
};

function safeResponseType(html: string): SafeDiagnostic['loginResponseType'] {
  const snippet=html.slice(0,150_000).trim();
  if(snippet.startsWith('{') || snippet.startsWith('[')) return 'json';
  const $=load(snippet);
  if($('input[name="LoginForm[username]"]').length &&
    $('input[name="LoginForm[captcha]"]').length) return 'login-form';
  if(/<html|<form|<body|<div/i.test(snippet)) return 'html';
  return 'other';
}

function failure(issue: LoginIssue, status = 401, diagnostic?: SafeDiagnostic): Response {
  const messages: Record<LoginIssue, string> = {
    CAPTCHA_REJECTED: 'The ERP explicitly rejected the CAPTCHA. Request a fresh image and enter its new characters.',
    CREDENTIALS_REJECTED: 'The ERP returned a username or password validation error. Confirm your credentials on the official ERP.',
    CSRF_OR_SESSION_REJECTED: 'The ERP session or form verification expired. Start a new CAPTCHA session.',
    ERP_LOGIN_NOT_CONFIRMED: 'The ERP did not confirm login. The CAPTCHA may be correct; check ERP session initialization or browser-only login steps.',
    ERP_LOGIN_UNAVAILABLE: 'The ERP login service could not be reached or returned an unexpected response. Please request a fresh CAPTCHA and retry.',
    ERP_LOGIN_TIMEOUT: 'The ERP login request timed out. Request a fresh CAPTCHA and try again; the university server may be slow.',
  };
  return Response.json({
    error: messages[issue], code: issue,
    ...(diagnostic ? {diagnostic} : {})
  }, {
    status, headers: {'Cache-Control':'no-store'}
  });
}

/** Safe classification only: never send raw ERP HTML, user input or cookies. */
function classifyERPLogin(status: number, text: string): LoginIssue {
  if (status === 403 || status === 419) return 'CSRF_OR_SESSION_REJECTED';
  if (status >= 500 || status === 429) return 'ERP_LOGIN_UNAVAILABLE';
  if (text.length > 200_000) return 'ERP_LOGIN_NOT_CONFIRMED';
  let errorText = '';
  const trimmed = text.trim();
  // Yii ActiveForm can respond with JSON errors instead of a redirect.
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const payload=JSON.parse(trimmed);
      errorText=JSON.stringify(payload).toLowerCase().slice(0,10000);
    } catch { /* Not JSON; read any HTML validation elements below. */ }
  }
  if (!errorText) {
    const $=load(text);
    errorText=$(
      '.invalid-feedback, .help-block, .error-summary, .has-error .help-block, ' +
      '.field-loginform-captcha .help-block, .field-loginform-password .help-block, ' +
      'input[aria-invalid="true"] + div'
    ).text().toLowerCase().slice(0,10000);
  }
  if (/(captcha|verification code|verification text)/i.test(errorText) &&
      /(incorrect|invalid|wrong|does not match|required|empty)/i.test(errorText))
    return 'CAPTCHA_REJECTED';
  if (/(username|password|credentials|account)/i.test(errorText) &&
      /(incorrect|invalid|wrong|not found|not recognized|failed)/i.test(errorText))
    return 'CREDENTIALS_REJECTED';
  if (/(csrf|session expired|session verification)/i.test(errorText))
    return 'CSRF_OR_SESSION_REJECTED';
  return 'ERP_LOGIN_NOT_CONFIRMED';
}

export async function POST(request:Request) {
  if(!testingEnabled) return fail('Private ERP testing is unavailable',503);
  if(!(await validOrigin())) return fail('Origin rejected',403);
  const state=await getERPState();
  if(!state || state.phase!=='challenge') return fail('CAPTCHA session expired; refresh the challenge',401);
  if(!validateCSRF(state.csrf,request.headers.get('x-attendly-csrf'))) return fail('Verification request invalid',403);
  // Consume the challenge on any login attempt; no automatic retry of a failed CAPTCHA.
  await clearERPState();
  let failureStage: SafeDiagnostic['stage']='login-post';
  try {
    if(Number(request.headers.get('content-length')||'0')>4096) return fail('Login request too large',400);
    const fields=await request.json();
    const username=String(fields?.studentId||'').trim(),password=String(fields?.password||''),
          captcha=String(fields?.captcha||'').trim();
    if(!/^[0-9]{5,24}$/.test(username)||!password||password.length>256||captcha.length<1||captcha.length>32)
      return fail('Invalid login input',400);
    if(fields?.consent!==true) return fail('Confirm personal-account testing consent',403);
    if(!state.formToken || !state.loginAction || !Object.keys(state.upstream).length)
      return failure('CSRF_OR_SESSION_REJECTED');
    // Chrome's official NewERP login uses multipart/form-data. fetch
    // generates the multipart boundary; no manual Content-Type header.
    const form=buildERPLoginForm(state.formToken,username,password,captcha);
    const cookiesBeforeLogin={...state.upstream};
    const result=await upstream(state.loginAction,state,'POST',form);
    const cookieSignal=cookieTransition(cookiesBeforeLogin,state.upstream);
    const diagnostic: SafeDiagnostic={
      stage:'login-post',loginHttpStatus:result.status,
      cookieCountBefore:cookieSignal.before,
      cookieCountAfterLogin:cookieSignal.after,
      cookieChangedOnLogin:cookieSignal.changed,
    };
    let dashboardUrl=ERP_ROOT+'/index.php?r=site%2Findexindi';
    if([301,302,303].includes(result.status)) {
      diagnostic.loginResponseType='redirect';
      diagnostic.stage='redirect';
      failureStage='redirect';
      // The real ERP sends X-Pjax-Url rather than Location on its 302.
      // Treat it as navigation metadata, never as proof of login.
      const location=result.headers.get('location');
      const pjaxUrl=result.headers.get('x-pjax-url');
      const target=resolveERPRedirect(location || pjaxUrl,state.loginAction);
      if(target.ok) {
        dashboardUrl=target.url;
        diagnostic.redirectKind=target.kind;
        diagnostic.redirectSource=location?'location':'pjax-url';
        if(target.upgradedHttps) diagnostic.upgradedHttps=true;
      } else if(target.reason==='missing_location') {
        diagnostic.redirectSource='fixed-fallback';
        // Some 302 responses omit Location. Only probe the fixed known
        // dashboard; never infer authentication from the 302 itself.
        diagnostic.redirectReason='missing_location';
        // Browser DevTools showed GET /index.php between the login 302
        // and /index.php?r=site%2Findexindi. Preserve that step and cookies.
        dashboardUrl=ERP_ROOT+'/index.php';
        diagnostic.fallback='index-probe';
      } else {
        diagnostic.redirectReason=target.reason;
        return failure('ERP_LOGIN_NOT_CONFIRMED',401,diagnostic);
      }
    } else if(result.status===200) {
      const body=await result.text();
      diagnostic.loginResponseType=safeResponseType(body);
      const issue=classifyERPLogin(result.status,body);
      if(issue!=='ERP_LOGIN_NOT_CONFIRMED') return failure(issue,401,diagnostic);
    } else {
      return failure(classifyERPLogin(result.status,''),result.status>=500?502:401,diagnostic);
    }
    // Read only same-origin HTTPS ERP pages and follow at most 4 hops.
    // A 302/200 status alone is never treated as proof of authentication.
    let verified=false;
    let attemptedFixedDashboard=false;
    const fixedDashboard=ERP_ROOT+'/index.php?r=site%2Findexindi';
    for(let hop=0;hop<5;hop++) {
      diagnostic.stage='dashboard';
      failureStage='dashboard';
      diagnostic.dashboardRoute=dashboardRouteKind(dashboardUrl);
      const page=await upstream(dashboardUrl,state);
      diagnostic.dashboardHttpStatus=page.status;
      diagnostic.cookieCountAfterDashboard=Object.keys(state.upstream).length;
      if([301,302,303].includes(page.status)) {
        diagnostic.stage='redirect';
        failureStage='redirect';
        if(hop>=4) {
          diagnostic.redirectReason='too_many_redirects';
          return failure('ERP_LOGIN_NOT_CONFIRMED',401,diagnostic);
        }
        const next=resolveERPRedirect(page.headers.get('location'),dashboardUrl);
        if(next.ok && next.url!==dashboardUrl) {
          dashboardUrl=next.url;
          diagnostic.redirectKind=next.kind;
          diagnostic.redirectsFollowed=(diagnostic.redirectsFollowed||0)+1;
          if(next.upgradedHttps) diagnostic.upgradedHttps=true;
          continue;
        }
        if(!attemptedFixedDashboard &&
            (!next.ok && next.reason==='missing_location')) {
          // Some reverse-proxy 302 responses omit Location. The fixed
          // dashboard URL comes from the user's observed successful flow.
          attemptedFixedDashboard=true;
          diagnostic.redirectReason='missing_location';
          diagnostic.fallback='dashboard-probe';
          dashboardUrl=fixedDashboard;
          continue;
        }
        diagnostic.redirectReason=next.ok?'too_many_redirects':next.reason;
        return failure('ERP_LOGIN_NOT_CONFIRMED',401,diagnostic);
      }
      if(page.status!==200) return failure('ERP_LOGIN_NOT_CONFIRMED',401,diagnostic);
      const html=await page.text();
      diagnostic.dashboardSize=htmlSizeBand(html.length);
      const evidence=inspectERPPage(html,username);
      diagnostic.loginFormDetected=evidence.loginForm;
      diagnostic.studentIdentityVisible=evidence.identityVisible;
      diagnostic.dashboardMarkersDetected=evidence.dashboardMarkers;
      diagnostic.dashboardResponseType=evidence.loginForm
        ? 'login-form'
        : (/<html|<body|<div/i.test(html.slice(0,5000)) ? 'html' : 'other');
      if(evidence.verified) {
        verified=true;
        break;
      }
      // An intermediate /index.php can render HTTP 200 rather than redirect.
      // A final probe of the *known* dashboard is safe, but only actual
      // identity evidence can make the session authenticated.
      if(needsDashboardProbe(dashboardUrl,attemptedFixedDashboard)) {
        attemptedFixedDashboard=true;
        diagnostic.fallback='dashboard-probe';
        dashboardUrl=fixedDashboard;
        continue;
      }
      return failure('ERP_LOGIN_NOT_CONFIRMED',401,diagnostic);
    }
    if(!verified) return failure('ERP_LOGIN_NOT_CONFIRMED',401,diagnostic);
    state.phase='authenticated';
    state.studentId=username;
    state.formToken=undefined;
    state.loginAction=undefined;
    state.csrf=crypto.randomUUID();
    state.expires=Date.now()+20*60*1000;
    failureStage='session-write';
    await setERPState(state);
    return NextResponse.json({ok:true,verified:true,stage:'login-only',studentId:username,csrfToken:state.csrf},{
      headers:{'Cache-Control':'no-store'}
    });
  } catch (error) {
    // Only a fixed, non-sensitive failure classification is returned.
    // Never expose the request, username, CAPTCHA, cookies, exception or stack.
    const upstreamError=classifyERPTransportError(error);
    return failure(upstreamError==='timeout'?'ERP_LOGIN_TIMEOUT':'ERP_LOGIN_UNAVAILABLE',
      upstreamError==='timeout'?504:502,{stage:failureStage,upstreamError});
  }
}
