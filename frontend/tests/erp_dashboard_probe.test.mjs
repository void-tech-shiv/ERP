import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectERPPage } from '../lib/server/erp_auth_verify.ts';
import {
  isStudentDashboardTarget, needsDashboardProbe, dashboardRouteKind, htmlSizeBand
} from '../lib/server/erp_dashboard_probe.ts';

const student='2500000001';
const ROOT='https://newerp.kluniversity.in';

test('large ERP dashboard (over previous 1 MB cutoff) is checked, not silently rejected',()=>{
  const html='<html><body>'+ '<section>Safe placeholder</section>'.repeat(44000) +
    '<h2>Welcome <b>'+student+'</b></h2></body></html>';
  assert.ok(html.length>1_000_000);
  assert.ok(html.length<2_000_000);
  const evidence=inspectERPPage(html,student);
  assert.equal(evidence.verified,true);
  assert.equal(evidence.welcomeVisible,true);
});

test('oversized response is rejected conservatively',()=>{
  const html='<html><body>'+' '.repeat(2_000_001)+'</body></html>';
  assert.equal(inspectERPPage(html,student).verified,false);
});

test('intermediate index and PJAX paths trigger a single canonical dashboard probe',()=>{
  assert.equal(needsDashboardProbe(ROOT+'/index.php',false),true);
  assert.equal(needsDashboardProbe(ROOT+'/index.php?r=site%2Flogin',false),true);
  assert.equal(needsDashboardProbe(ROOT+'/index.php?r=site%2Findexindi',false),false);
  assert.equal(needsDashboardProbe(ROOT+'/index.php',true),false);
});

test('dashboard URL is compared by decoded route, not raw query serialization',()=>{
  assert.equal(isStudentDashboardTarget(ROOT+'/index.php?r=site%2Findexindi'),true);
  assert.equal(isStudentDashboardTarget(ROOT+'/index.php?r=site/indexindi'),true);
  assert.equal(isStudentDashboardTarget(ROOT+'/index.php?r=site%2Flogin'),false);
  assert.equal(isStudentDashboardTarget('https://evil.example/index.php?r=site%2Findexindi'),false);
});

test('diagnostics only return fixed route names and size bands',()=>{
  assert.equal(dashboardRouteKind(ROOT+'/index.php?r=site%2Findexindi'),'student-home');
  assert.equal(dashboardRouteKind(ROOT+'/index.php?r=site%2Flogin&token=DO_NOT_REPORT'),'index');
  assert.equal(dashboardRouteKind('https://evil.example/secret'),'other');
  assert.equal(htmlSizeBand(12000),'small');
  assert.equal(htmlSizeBand(500_000),'medium');
  assert.equal(htmlSizeBand(1_300_000),'large');
  assert.equal(htmlSizeBand(2_000_001),'oversize');
});

test('an unauthenticated large HTML page is still rejected',()=>{
  const html='<html><body>'+ 'Public landing page '.repeat(67000)+'</body></html>';
  assert.ok(html.length>1_000_000);
  assert.equal(inspectERPPage(html,student).verified,false);
});
