import { NextResponse } from 'next/server';
import { fail, findLogin, freshCSRF, setERPState, testingEnabled, upstream, validOrigin } from '../../../../lib/server/erp';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request: Request) {
  if(!testingEnabled) return fail('Private ERP testing is unavailable',503);
  if(!(await validOrigin())) return fail('Origin rejected',403);
  if(Number(request.headers.get('content-length')||'0')>0) return fail('No request body allowed',400);
  try {
    const state={phase:'challenge' as const, csrf:freshCSRF(), expires:Date.now()+5*60*1000,
      upstream:{} as Record<string,string>, formToken:'', loginAction:''};
    const first=await upstream('/index.php',state);
    if(first.status!==200) return fail('ERP login page unavailable',502);
    const login=findLogin(await first.text());
    const image=await upstream(login.captcha,state);
    const mime=(image.headers.get('content-type')||'').split(';')[0].toLowerCase().trim();
    if(image.status!==200 || !['image/png','image/jpeg','image/gif'].includes(mime)) return fail('ERP CAPTCHA unavailable',502);
    const bytes=Buffer.from(await image.arrayBuffer());
    if(bytes.length<8 || bytes.length>100_000) return fail('Invalid CAPTCHA image',502);
    state.formToken=login.csrf;state.loginAction=login.action;
    await setERPState(state);
    return NextResponse.json({csrfToken:state.csrf,image:'data:'+mime+';base64,'+bytes.toString('base64')},
      {headers:{'Cache-Control':'no-store'}});
  } catch {
    return fail('Could not start ERP session',502);
  }
}
