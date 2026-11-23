import test from 'node:test';
import assert from 'node:assert/strict';
import { buildERPLoginForm } from '../lib/server/erp_login_form.ts';
import { readFileSync } from 'node:fs';

test('ERP login form uses native FormData with expected Yii field names',()=>{
  const data=buildERPLoginForm('SYNTHETIC_CSRF','0000012345','FAKE_PASSWORD','FAKE_CAPTCHA');
  assert.ok(data instanceof FormData);
  assert.deepEqual([...data.keys()],[
    '_csrf','LoginForm[username]','LoginForm[password]',
    'LoginForm[captcha]','LoginForm[qr_code]','login-button'
  ]);
  assert.equal(data.get('LoginForm[username]'),'0000012345');
  assert.equal(data.get('LoginForm[captcha]'),'FAKE_CAPTCHA');
  assert.equal(data.get('LoginForm[qr_code]'),'');
});

test('Node fetch serializes native FormData with its own multipart boundary', async()=>{
  const form=buildERPLoginForm('FAKE_CSRF','0000012345','FAKE_PASSWORD','FAKE_CAPTCHA');
  const req=new Request('https://example.test/fixture',{method:'POST',body:form});
  const type=req.headers.get('content-type');
  assert.match(type||'',/^multipart\/form-data; boundary=/);
  const payload=await req.text();
  assert.match(payload,/name="LoginForm\[captcha\]"/);
  assert.match(payload,/FAKE_CAPTCHA/);
});

test('live private login handler does not perform attendance queries',()=>{
  const source=readFileSync(new URL('../app/api/erp/login/route.ts',import.meta.url),'utf8');
  assert.match(source,/buildERPLoginForm\(state\.formToken,username,password,captcha\)/);
  assert.match(source,/headers\.get\('x-pjax-url'\)/);
  assert.doesNotMatch(source,/studentattendance\/|\/api\/erp\/terms/);
  assert.match(source,/if\(evidence\.verified\)/);
});
