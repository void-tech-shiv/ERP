import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveERPRedirect } from '../lib/server/erp_redirect.ts';

const base='https://newerp.kluniversity.in/index.php?r=site%2Flogin';

test('accepts same-ERP relative index path, preserving query internally',()=>{
  const r=resolveERPRedirect('/index.php?r=site%2Findexindi',base);
  assert.equal(r.ok,true);
  if(r.ok) {
    assert.equal(r.kind,'index');
    assert.equal(r.url,'https://newerp.kluniversity.in/index.php?r=site%2Findexindi');
  }
});
test('accepts bare index.php and query-only redirects',()=>{
  const bare=resolveERPRedirect('index.php',base);
  const query=resolveERPRedirect('?r=site%2Findexindi',base);
  assert.equal(bare.ok,true);
  assert.equal(query.ok,true);
});
test('accepts root of official ERP, not an arbitrary host',()=>{
  const r=resolveERPRedirect('/',base);
  assert.deepEqual(r,{ok:true,url:'https://newerp.kluniversity.in/',kind:'root',upgradedHttps:false});
});
test('upgrades same host HTTP redirect to HTTPS without leaking a cookie to plain HTTP',()=>{
  const r=resolveERPRedirect('http://newerp.kluniversity.in/index.php?r=site%2Findexindi',base);
  assert.equal(r.ok,true);
  if(r.ok){assert.equal(r.upgradedHttps,true);assert.match(r.url,/^https:/);}
});
test('allows no Location but signals a safe fixed-dashboard fallback',()=>{
  assert.deepEqual(resolveERPRedirect(null,base),{ok:false,reason:'missing_location'});
});
test('rejects cross-origin targets and protocol-relative hosts',()=>{
  for(const location of ['https://example.com/','//example.com/index.php','javascript:alert(1)','https://newerp.kluniversity.in.evil.example/index.php']){
    assert.deepEqual(resolveERPRedirect(location,base),{ok:false,reason:'external_location'});
  }
});
test('rejects username and password embedded in URL',()=>{
  assert.deepEqual(resolveERPRedirect('https://x:pw@newerp.kluniversity.in/index.php',base),
    {ok:false,reason:'external_location'});
});
test('rejects unexpected paths even on official ERP domain',()=>{
  assert.deepEqual(resolveERPRedirect('/administration/report',base),{ok:false,reason:'unexpected_path'});
});
test('strips fragments and never returns it in a redirect target',()=>{
  const result=resolveERPRedirect('/index.php?r=site%2Findexindi#private',base);
  assert.equal(result.ok,true);
  if(result.ok)assert.equal(result.url.includes('#'),false);
});
test('rejects long or control-character locations',()=>{
  assert.deepEqual(resolveERPRedirect('/index.php?'+'x'.repeat(3000),base),
    {ok:false,reason:'invalid_location'});
  assert.deepEqual(resolveERPRedirect('/index.php\nfoo',base),
    {ok:false,reason:'invalid_location'});
});
