import 'server-only';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { load } from 'cheerio';
import { usesPjaxLogin } from './erp_pjax';

const ROOT = 'https://newerp.kluniversity.in';
const NAME = 'attendly_private_erp';
export const testingEnabled =
  process.env.ERP_PRIVATE_TEST_ENABLED === '1' && process.env.VERCEL_ENV !== 'production';

export type ERPState = {
  phase: 'challenge' | 'authenticated';
  expires: number;
  csrf: string;
  upstream: Record<string,string>;
  formToken?: string;
  loginAction?: string;
  studentId?: string;
};

function secret(): Buffer {
  const v = process.env.ERP_SESSION_SECRET || '';
  if (!/^[a-f0-9]{64}$/i.test(v)) throw new Error('ERP session encryption is not configured');
  return Buffer.from(v, 'hex');
}

export function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function validOrigin(): Promise<boolean> {
  const h = await headers();
  if (h.get('sec-fetch-site') === 'cross-site') return false;
  const origin = h.get('origin'), host = h.get('host');
  if (!origin || !host) return false;
  try {
    const u = new URL(origin);
    return u.host === host &&
      (u.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && u.protocol === 'http:'));
  } catch { return false; }
}

function url(path: string) {
  const u = new URL(path, ROOT);
  if (u.origin !== ROOT || u.username || u.password) throw new Error('Unexpected ERP origin');
  return u.toString();
}

function upstreamCookie(upstream: Record<string,string>): string {
  return Object.entries(upstream).map(([key,value]) => key + '=' + value).join('; ');
}

function mergeCookies(out: Record<string,string>, res: Response) {
  // Keep only short cookie NAME=value pairs, not attributes, nor response HTML.
  const set: string[] = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')!] : []);
  for (const line of set) {
    const pair = line.split(';', 1)[0];
    const index = pair.indexOf('=');
    if (index < 1) continue;
    const name = pair.slice(0,index).trim(), value = pair.slice(index+1).trim();
    if (/^[\w-]{1,100}$/.test(name) && value.length <= 2000 && Object.keys(out).length <= 15)
      out[name] = value;
  }
}
export async function upstream(path: string, state: ERPState | {upstream: Record<string,string>}, method = 'GET', body?: URLSearchParams | FormData) {
  const response = await fetch(url(path), {
    method, redirect: 'manual', cache: 'no-store',
    headers: {
      ...(Object.keys(state.upstream).length ? {'Cookie': upstreamCookie(state.upstream)} : {}),
      // Match the ordinary same-site request context of the official ERP form.
      // Yii and front-end validation may require Origin/Referer checks.
      ...(method === 'POST' ? {
        // Browser submits the observed Yii login form as multipart/form-data.
        // Let fetch generate the boundary automatically for FormData.
        ...(body instanceof FormData ? {} : {
          'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8',
        }),
        'X-Requested-With':'XMLHttpRequest',
        // Official NewERP login is handled by Yii/PJAX. Use PJAX only
        // for the login submission; attendance requests remain unchanged.
        ...(usesPjaxLogin(method,url(path)) ? {'X-PJAX':'true'} : {}),
        'Origin':ROOT,
        'Referer':ROOT+'/',
        'Accept':'text/html, */*; q=0.01',
      } : {
        'Referer':ROOT+'/',
      }),
    }, body,
    signal: AbortSignal.timeout(12000),
  });
  mergeCookies(state.upstream, response);
  if (response.status >= 300 && response.status < 400) return response;
  const length = Number(response.headers.get('content-length') || '0');
  if (length > 2_000_000) throw new Error('Unexpected ERP response size');
  return response;
}

function seal(data: ERPState): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secret(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(data),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64url');
}

function open(value?: string): ERPState | null {
  if (!value || value.length > 8000) return null;
  try {
    const bytes = Buffer.from(value,'base64url');
    if (bytes.length < 30) return null;
    const decipher = createDecipheriv('aes-256-gcm',secret(),bytes.subarray(0,12));
    decipher.setAuthTag(bytes.subarray(12,28));
    const plain = Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]);
    const state = JSON.parse(plain.toString('utf8')) as ERPState;
    if (!state || typeof state.expires !== 'number' || state.expires < Date.now()) return null;
    if (!['challenge','authenticated'].includes(state.phase) || !state.csrf || !state.upstream) return null;
    return state;
  } catch { return null; }
}
export async function getERPState() {
  return open((await cookies()).get(NAME)?.value);
}
export async function setERPState(state: ERPState) {
  const cookieStore = await cookies();
  const sealed = seal(state);
  if (sealed.length > 3800) throw new Error('ERP session exceeds cookie limit');
  cookieStore.set(NAME, sealed, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite:'strict', path:'/api/erp', maxAge: Math.max(1,Math.floor((state.expires-Date.now())/1000)),
  });
}
export async function clearERPState() {
  (await cookies()).delete(NAME);
}
export function freshCSRF() { return randomBytes(24).toString('base64url'); }
export function validateCSRF(actual:string, expected:string | null) {
  if (!expected || !actual || expected.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function findLogin(html:string) {
  const $ = load(html);
  const form = $('form').filter((_,el) =>
    $(el).find('input[name="LoginForm[username]"]').length > 0 &&
    $(el).find('input[name="LoginForm[password]"]').length > 0 &&
    $(el).find('input[name="LoginForm[captcha]"]').length > 0
  ).first();
  if (!form.length) throw new Error('ERP login form changed');
  const csrf = form.find('input[name="_csrf"]').attr('value') ||
    $('input[name="_csrf"]').first().attr('value');
  const captcha = $('img[src*="captcha"]').first().attr('src');
  const action = form.attr('action') || '/index.php?r=site%2Flogin';
  if (!csrf || !captcha) throw new Error('ERP CAPTCHA or token not found');
  return { csrf, captcha: url(captcha), action: url(action) };
}

export function termOptions(html:string) {
  const $=load(html);
  function options(name:string) {
    const select = $('select').filter((_,e)=> $(e).attr('name')===name).first();
    if(!select.length) throw new Error('ERP term selection changed');
    return select.find('option').toArray().map(el=>({
      label: $(el).text().trim(), value: String($(el).attr('value')||'')
    })).filter(x=> x.label && /^\d+$/.test(x.value));
  }
  const csrf=$('input[name="_csrf"]').first().attr('value') || $('meta[name="csrf-token"]').attr('content');
  if (!csrf) throw new Error('ERP attendance token missing');
  return { csrf, years:options('DynamicModel[academicyear]'),
                semesters:options('DynamicModel[semesterid]') };
}

export type Counts = { attended:number, conducted:number };
export type Course = { code:string, name:string, components:Partial<Record<'L'|'T'|'P'|'S',Counts>> };
export function parseAttendance(html:string): Course[] {
  const $=load(html), required=['coursecode','coursedesc','ltps','total conducted','total attended'];
  let result: Course[] | null=null;
  $('table').each((_,table)=>{
    const head=$(table).find('thead th').toArray().map(th=>$(th).text().trim().toLowerCase().replace(/\s+/g,' '));
    if(!required.every(x=>head.includes(x))) return;
    const idx=(name:string)=>head.indexOf(name);
    const groups=new Map<string,Course>();const seen=new Set<string>();
    $(table).find('tbody tr').each((_,tr)=>{
      const cells=$(tr).children('td').toArray().map(td=>$(td).text().trim());
      if(cells.length<Math.max(...required.map(idx))+1) return;
      const code=cells[idx('coursecode')], name=cells[idx('coursedesc')];
      const part=cells[idx('ltps')] as 'L'|'T'|'P'|'S';
      const section=idx('section')>=0?cells[idx('section')]:'';
      const attended=Number(cells[idx('total attended')]);
      const conducted=Number(cells[idx('total conducted')]);
      const key=code+'|'+part+'|'+section;
      if(!code || !name || !['L','T','P','S'].includes(part) ||
        !/^\d+$/.test(cells[idx('total attended')]) ||
        !/^\d+$/.test(cells[idx('total conducted')]) ||
        attended>conducted || seen.has(key)) throw new Error('Invalid ERP attendance row');
      seen.add(key);
      const group=groups.get(code)||{code,name,components:{}};
      if(group.name!==name) throw new Error('Conflicting course name');
      const counts=group.components[part]||{attended:0,conducted:0};
      group.components[part]={attended:counts.attended+attended, conducted:counts.conducted+conducted};
      groups.set(code,group);
    });
    result=[...groups.values()];
    return false;
  });
  if(result===null) throw new Error('ERP attendance table not found');
  return result;
}
