import { NextResponse } from 'next/server';
import { load } from 'cheerio';
import { resolveERPRedirect, type RedirectError } from '../../../../lib/server/erp_redirect';
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
  | 'ERP_LOGIN_UNAVAILABLE';

type SafeDiagnostic = {
  loginHttpStatus?: number;
  loginResponseType?: 'redirect' | 'login-form' | 'json' | 'html' | 'other';
  dashboardHttpStatus?: number;
  dashboardResponseType?: 'login-form' | 'html' | 'other';
  stage: 'login-post' | 'redirect' | 'dashboard' | 'session-write';
  redirectReason?: RedirectError | 'too_many_redirects';
  redirectKind?: 'index' | 'root';
  redirectsFollowed?: number;
  upgradedHttps?: boolean;
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
    ERP_LOGIN_UNAVAILABLE: 'The ERP login service did not provide an expected response. Please try later.',
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

function isVerifiedDashboard(html:string,studentId:string):boolean {
  // A full backend GET after login is required; redirect status alone is not proof.
  const $=load(html);
  $('script,style,noscript').remove();
  const text=$('body').text().replace(/\s+/g,' ');
  return new RegExp('\\bWelcome\\s+'+studentId+'\\b','i').test(text);
}

export async function POST(request:Request) {
  if(!testingEnabled) return fail('Private ERP testing is unavailable',503);
  if(!(await validOrigin())) return fail('Origin rejected',403);
  const state=await getERPState();
  if(!state || state.phase!=='challenge') return fail('CAPTCHA session expired; refresh the challenge',401);
  if(!validateCSRF(state.csrf,request.headers.get('x-attendly-csrf'))) return fail('Verification request invalid',403);
  // Consume the challenge on any login attempt; no automatic retry of a failed CAPTCHA.
  await clearERPState();
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
    const form=new URLSearchParams({
      '_csrf':state.formToken,
      'LoginForm[username]':username,
      'LoginForm[password]':password,
      'LoginForm[captcha]':captcha,
      'LoginForm[qr_code]':'',
      'login-button':'',
    });
    const result=await upstream(state.loginAction,state,'POST',form);
    const diagnostic: SafeDiagnostic={stage:'login-post',loginHttpStatus:result.status};
    let dashboardUrl=ERP_ROOT+'/index.php?r=site%2Findexindi';
    if([301,302,303].includes(result.status)) {
      diagnostic.loginResponseType='redirect';
      diagnostic.stage='redirect';
      const target=resolveERPRedirect(result.headers.get('location'),state.loginAction);
      if(target.ok) {
        dashboardUrl=target.url;
        diagnostic.redirectKind=target.kind;
        if(target.upgradedHttps) diagnostic.upgradedHttps=true;
      } else if(target.reason==='missing_location') {
        // Some 302 responses omit Location. Only probe the fixed known
        // dashboard; never infer authentication from the 302 itself.
        diagnostic.redirectReason='missing_location';
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
    // Follow at most 3 same-host HTTPS redirects, updating the session cookie
    // jar on each response. A redirect is never sufficient proof of login.
    let verified=false;
    for(let hop=0;hop<4;hop++) {
      diagnostic.stage='dashboard';
      const dashboard=await upstream(dashboardUrl,state);
      diagnostic.dashboardHttpStatus=dashboard.status;
      if([301,302,303].includes(dashboard.status)) {
        diagnostic.stage='redirect';
        if(hop===3) {
          diagnostic.redirectReason='too_many_redirects';
          return failure('ERP_LOGIN_NOT_CONFIRMED',401,diagnostic);
        }
        const next=resolveERPRedirect(dashboard.headers.get('location'),dashboardUrl);
        if(!next.ok) {
          diagnostic.redirectReason=next.reason;
          return failure('ERP_LOGIN_NOT_CONFIRMED',401,diagnostic);
        }
        if(next.url===dashboardUrl) {
          diagnostic.redirectReason='too_many_redirects';
          return failure('ERP_LOGIN_NOT_CONFIRMED',401,diagnostic);
        }
        dashboardUrl=next.url;
        diagnostic.redirectKind=next.kind;
        diagnostic.redirectsFollowed=(diagnostic.redirectsFollowed||0)+1;
        if(next.upgradedHttps) diagnostic.upgradedHttps=true;
        continue;
      }
      if(dashboard.status!==200) return failure('ERP_LOGIN_NOT_CONFIRMED',401,diagnostic);
      const html=await dashboard.text();
      diagnostic.dashboardResponseType=safeResponseType(html)==='login-form'
        ? 'login-form'
        : (/<html|<body|<div/i.test(html.slice(0,5000)) ? 'html' : 'other');
      if(html.length>1_000_000 || !isVerifiedDashboard(html,username))
        return failure('ERP_LOGIN_NOT_CONFIRMED',401,diagnostic);
      verified=true;
      break;
    }
    if(!verified) return failure('ERP_LOGIN_NOT_CONFIRMED',401,diagnostic);
    state.phase='authenticated';
    state.studentId=username;
    state.formToken=undefined;
    state.loginAction=undefined;
    state.csrf=crypto.randomUUID();
    state.expires=Date.now()+20*60*1000;
    await setERPState(state);
    return NextResponse.json({ok:true,studentId:username,csrfToken:state.csrf},{
      headers:{'Cache-Control':'no-store'}
    });
  } catch {
    return failure('ERP_LOGIN_UNAVAILABLE',502);
  }
}
