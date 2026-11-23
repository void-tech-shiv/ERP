import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveAttendlyUrl, resolveCloudflareAccessOrigin, isAllowedNavigation } from '../src/connection.ts';

test('no unconfigured default URL or fake student login server',()=>{
  assert.equal(resolveAttendlyUrl(undefined,false).ok,false);
  assert.equal(resolveAttendlyUrl('',true).ok,false);
});
test('accepts HTTPS site and normalizes root URL',()=>{
  assert.deepEqual(resolveAttendlyUrl('https://attendly.example.org',false),{
    ok:true,url:'https://attendly.example.org/',origin:'https://attendly.example.org'
  });
});
test('rejects credentials, fragments, queries and deep paths in configured URL',()=>{
  for(const url of [
    'https://student:password@attendly.example.org',
    'https://attendly.example.org/?session=secret',
    'https://attendly.example.org/#login',
    'https://attendly.example.org/copy-login',
  ])assert.equal(resolveAttendlyUrl(url,true).ok,false,url);
});
test('requires HTTPS for release and disallows public HTTP in development',()=>{
  for(const url of ['http://attendly.example.org','http://8.8.8.8:3000',
                    'ftp://attendly.example.org','file:///index.html'])
    assert.equal(resolveAttendlyUrl(url,true).ok,false,url);
  assert.equal(resolveAttendlyUrl('http://10.136.27.1:3000',false).ok,false);
});
test('accepts private HTTP network only while debugging in Expo',()=>{
  for(const host of ['localhost','10.0.2.2','10.136.27.1','192.168.1.9','172.16.4.2'])
    assert.equal(resolveAttendlyUrl('http://'+host+':3000',true).ok,true,host);
  for(const host of ['172.32.1.2','192.169.0.1','256.1.1.1'])
    assert.equal(resolveAttendlyUrl('http://'+host+':3000',true).ok,false,host);
});
test('allows navigation only inside trusted origin with exact protocol and port',()=>{
  const origin='https://attendly.example.org';
  assert.equal(isAllowedNavigation(origin+'/',origin),true);
  assert.equal(isAllowedNavigation(origin+'/attendance?semester=2',origin),true);
  for(const url of [
    'https://evil.example.org/login','http://attendly.example.org',
    'https://attendly.example.org.evil.example','javascript:alert(1)',
    'data:text/html,a','file:///etc/passwd'
  ])assert.equal(isAllowedNavigation(url,origin),false,url);
  assert.equal(isAllowedNavigation('about:blank',origin),true);
});
test('only the configured Cloudflare Access HTTPS origin can be opened for OTP login',()=>{
  const access='https://wild-cell-527b.cloudflareaccess.com';
  const origin='https://attendly-cloudflare-preview.void-tech-shiv.workers.dev';
  assert.equal(resolveCloudflareAccessOrigin(access),access);
  assert.equal(resolveCloudflareAccessOrigin(undefined),null);
  for(const value of [
    'https://evil.example.org',
    'https://wild-cell-527b.cloudflareaccess.com.evil.test',
    'http://wild-cell-527b.cloudflareaccess.com',
    'https://fake:secret@wild-cell-527b.cloudflareaccess.com',
    'https://wild-cell-527b.cloudflareaccess.com/steal',
    'https://wild-cell-527b.cloudflareaccess.com?token=123',
    'https://wild-cell-527b.cloudflareaccess.com#fragment',
  ])assert.equal(resolveCloudflareAccessOrigin(value),null,value);
  assert.equal(isAllowedNavigation(access+'/cdn-cgi/access/login',origin,access),true);
  assert.equal(isAllowedNavigation(origin+'/api/erp/session',origin,access),true);
  assert.equal(isAllowedNavigation('https://evil.example.org',origin,access),false);
  assert.equal(isAllowedNavigation(access+'/cdn-cgi/access/login',origin),false);
});

test('native shell uses private WebView session, not a credential bridge',()=>{
  const source=readFileSync(new URL('../App.tsx',import.meta.url),'utf8');
  assert.match(source,/thirdPartyCookiesEnabled=\{false\}/);
  assert.match(source,/mixedContentMode="never"/);
  assert.match(source,/isAllowedNavigation\(request\.url,endpoint\.origin\)/);
  assert.match(source,/setSupportMultipleWindows=\{false\}/);
  assert.doesNotMatch(source,/AsyncStorage|SecureStore|injectedJavaScript|onMessage=/);
});
