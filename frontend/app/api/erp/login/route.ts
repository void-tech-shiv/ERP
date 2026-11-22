import { NextResponse } from 'next/server';
import { clearERPState, fail, getERPState, setERPState, testingEnabled, upstream, validOrigin, validateCSRF } from '../../../../lib/server/erp';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  if(!testingEnabled) return fail('Private ERP testing is unavailable',503);
  if(!(await validOrigin())) return fail('Origin rejected',403);
  const state=await getERPState();
  if(!state || state.phase!=='challenge') return fail('CAPTCHA session expired; refresh the challenge',401);
  if(!validateCSRF(state.csrf,request.headers.get('x-attendly-csrf'))) return fail('Verification request invalid',403);
  // Consume the challenge even if upstream authentication fails.
  await clearERPState();
  try {
    if(Number(request.headers.get('content-length')||'0')>4096) return fail('Login request too large',400);
    const fields=await request.json();
    const username=String(fields?.studentId||'').trim(),password=String(fields?.password||''),
          captcha=String(fields?.captcha||'').trim();
    if(!/^[0-9]{5,24}$/.test(username)||!password||password.length>256||captcha.length<1||captcha.length>32)
      return fail('Invalid login input',400);
    if(fields?.consent!==true) return fail('Confirm personal-account testing consent',403);
    const form=new URLSearchParams({
      '_csrf':state.formToken||'',
      'LoginForm[username]':username,
      'LoginForm[password]':password,
      'LoginForm[captcha]':captcha,
      'LoginForm[qr_code]':'',
      'login-button':'',
    });
    const result=await upstream(state.loginAction||'/index.php?r=site%2Flogin',state,'POST',form);
    if(![301,302,303].includes(result.status)) return fail('ERP rejected login or CAPTCHA',401);
    const location=result.headers.get('location');
    if(!location) return fail('ERP login confirmation unavailable',502);
    const redirectUrl=new URL(location,state.loginAction);
    if(redirectUrl.origin!=='https://newerp.kluniversity.in' || redirectUrl.pathname!=='/index.php') return fail('Unexpected ERP redirect',502);
    const dashboard=await upstream(redirectUrl.toString(),state);
    if(dashboard.status!==200) return fail('ERP dashboard not available',502);
    const html=await dashboard.text();
    const visible=html.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ');
    const welcome=new RegExp('Welcome\\s+'+username+'\\b','i');
    if(!welcome.test(visible)) return fail('Student identity could not be verified',401);
    state.phase='authenticated';state.studentId=username;state.formToken=undefined;state.loginAction=undefined;
    state.csrf=crypto.randomUUID();state.expires=Date.now()+20*60*1000;
    await setERPState(state);
    return NextResponse.json({ok:true,studentId:username,csrfToken:state.csrf},{headers:{'Cache-Control':'no-store'}});
  } catch {
    return fail('ERP login could not be completed',502);
  }
}
