import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { usesPjaxLogin } from '../lib/server/erp_pjax.ts';
import {
  erpRequestTimeoutMs, classifyERPTransportError,
} from '../lib/server/erp_transport.ts';

const login='https://newerp.kluniversity.in/index.php?r=site%2Flogin';
const attendance='https://newerp.kluniversity.in/index.php?r=studentattendance%2Fstudentdailyattendance%2Fcourselist';

test('only the official ERP login POST receives 30-second timeout',()=>{
  assert.equal(erpRequestTimeoutMs(usesPjaxLogin('POST',login)),30000);
  assert.equal(erpRequestTimeoutMs(usesPjaxLogin('GET',login)),12000);
  assert.equal(erpRequestTimeoutMs(usesPjaxLogin('POST',attendance)),12000);
  assert.equal(erpRequestTimeoutMs(usesPjaxLogin('POST','https://evil.example/index.php?r=site%2Flogin')),12000);
  assert.equal(erpRequestTimeoutMs(false),12000);
});

test('classifies timed-out requests without exposing upstream error data',()=>{
  const timeout=new Error('sensitive information should never appear in diagnostic');
  timeout.name='TimeoutError';
  const abort=new Error('secret credentials');
  abort.name='AbortError';
  assert.equal(classifyERPTransportError(timeout),'timeout');
  assert.equal(classifyERPTransportError(abort),'timeout');
  assert.equal(classifyERPTransportError(new Error('ERP host unreachable')),'upstream-error');
  assert.equal(classifyERPTransportError('no response'),'upstream-error');
});

test('upstream fetch reuses login-only condition and does not retry credentials',()=>{
  const upstream=readFileSync(new URL('../lib/server/erp.ts',import.meta.url),'utf8');
  assert.match(upstream,/const officialLoginPost=usesPjaxLogin\(method,target\)/);
  assert.match(upstream,/signal: AbortSignal\.timeout\(erpRequestTimeoutMs\(officialLoginPost\)\)/);
  assert.match(upstream,/officialLoginPost \? \{'X-PJAX':'true'\}/);
  assert.doesNotMatch(upstream,/retryLogin|retryCaptcha|autoSolveCaptcha/);
});

test('login route distinguishes HTTP 504 timeout from 502 errors without exposing secrets',()=>{
  const route=readFileSync(new URL('../app/api/erp/login/route.ts',import.meta.url),'utf8');
  assert.match(route,/ERP_LOGIN_TIMEOUT/);
  assert.match(route,/const upstreamError=classifyERPTransportError\(error\)/);
  assert.match(route,/upstreamError==='timeout'\?504:502/);
  assert.match(route,/\{stage:failureStage,upstreamError\}/);
  assert.match(route,/if\(evidence\.verified\)/);
  assert.match(route,/if\(!verified\) return failure/);
  assert.match(route,/await clearERPState\(\)/);
  assert.doesNotMatch(route,/JSON\.stringify\(error\)|console\.log\(error\)|error\.stack/);
});
