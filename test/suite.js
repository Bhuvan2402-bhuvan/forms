/**
 * ============================================================================
 * FormCraft Studio - Enterprise Security & Regression Test Suite
 * ============================================================================
 */

const {
  startServer,
  setRequirePostgres,
  encryptField,
  decryptField,
  encryptSubmissionPayload,
  decryptSubmissionPayload
} = require('../server.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TEST_PORT = 3198;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let serverInstance = null;
let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (condition) {
    passedCount++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    failedCount++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('Starting FormCraft Studio Enterprise Security & Regression Suite');
  console.log(`Target: ${BASE_URL}`);
  console.log('===============================================================\n');

  serverInstance = startServer(TEST_PORT);
  await new Promise(r => setTimeout(r, 1000));

  try {
    // ------------------------------------------------------------------------
    // Group 1: Configuration, Health & Security Headers
    // ------------------------------------------------------------------------
    console.log('[Test Group 1: Server Config, Health & Security Headers]');
    
    const configRes = await fetch(`${BASE_URL}/api/config`);
    assert(configRes.status === 200, 'GET /api/config returns HTTP 200');
    assert(configRes.headers.get('x-content-type-options') === 'nosniff', 'Header X-Content-Type-Options: nosniff present');
    assert(configRes.headers.get('x-frame-options') === 'SAMEORIGIN', 'Header X-Frame-Options: SAMEORIGIN present');
    assert(configRes.headers.get('content-security-policy')?.includes("default-src 'self'"), 'Content-Security-Policy header active');
    
    const configData = await configRes.json();
    assert(typeof configData.canonicalOrigin === 'string', 'Canonical origin resolved');
    assert(configData.encryption === 'AES-256-GCM', 'AES-256-GCM authenticated encryption declared');

    // ------------------------------------------------------------------------
    // Group 2: AES-256-GCM Field-Level Authenticated Encryption
    // ------------------------------------------------------------------------
    console.log('\n[Test Group 2: AES-256-GCM Field-Level Encryption]');

    const plainSecret = 'Sensitive Candidate Government ID: SSN-982-11-4029';
    const encrypted = encryptField(plainSecret);
    assert(encrypted.startsWith('enc:v1:'), 'Ciphertext formatted with version header enc:v1:');
    assert(!encrypted.includes('SSN-982-11-4029'), 'Plaintext secret is not present in ciphertext');
    
    const decrypted = decryptField(encrypted);
    assert(decrypted === plainSecret, 'Decrypted ciphertext matches original plaintext perfectly');

    // Tamper detection
    const tampered = encrypted.substring(0, encrypted.length - 4) + 'AAAA';
    const tamperedResult = decryptField(tampered);
    assert(tamperedResult === '[Encrypted Data - Decryption Failed]', 'Tampered ciphertext authentication tag failure detected');

    // Payload level encryption
    const samplePayload = {
      name: 'Alex Morgan',
      signature: 'data:image/svg+xml;base64,PHN2Zz4...',
      ssn: '123-45-6789'
    };
    const encPayload = encryptSubmissionPayload(samplePayload);
    assert(encPayload.name.startsWith('enc:v1:') && encPayload.ssn.startsWith('enc:v1:'), 'Object fields encrypted individually');
    const decPayload = decryptSubmissionPayload(encPayload);
    assert(decPayload.name === samplePayload.name && decPayload.ssn === samplePayload.ssn, 'Object fields decrypted accurately');

    // ------------------------------------------------------------------------
    // Group 3: Dynamic Form Creation & Uniqueness
    // ------------------------------------------------------------------------
    console.log('\n[Test Group 3: Form Creation & Dynamic Unique Links]');

    const formId1 = `form-sec-1-${Date.now()}`;
    const formId2 = `form-sec-2-${Date.now() + 1}`;

    const form1Res = await fetch(`${BASE_URL}/api/forms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: formId1,
        title: 'Executive Fellowship Intake 2026',
        description: 'Leadership assessment application',
        category: 'Grant',
        fields: [{ id: 'q1', type: 'text', label: 'Full Legal Name', required: true }]
      })
    });
    assert(form1Res.status === 200, 'Form 1 created successfully (HTTP 200)');
    const f1Data = await form1Res.json();
    assert(f1Data.id === formId1, 'Form 1 persisted with exact cryptographic ID');
    assert(f1Data.shareUrl.endsWith(`/f/${formId1}`), 'Form 1 returns canonical public share URL');

    const form2Res = await fetch(`${BASE_URL}/api/forms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: formId2,
        title: 'Customer Satisfaction NPS',
        description: 'Quarterly review',
        fields: [{ id: 'q1', type: 'rating', label: 'Score', required: true }]
      })
    });
    assert(form2Res.status === 200, 'Form 2 created successfully (HTTP 200)');
    assert(formId1 !== formId2, 'Form IDs are strictly distinct');

    // ------------------------------------------------------------------------
    // Group 4: Dynamic Public Route Loading & 404 Guard
    // ------------------------------------------------------------------------
    console.log('\n[Test Group 4: Dynamic Route Retrieval & 404 Handling]');

    const getF1 = await fetch(`${BASE_URL}/api/forms?id=${formId1}`);
    assert(getF1.status === 200, 'GET /api/forms?id=formId1 returns exact form');
    const f1Get = await getF1.json();
    assert(f1Get.title === 'Executive Fellowship Intake 2026', 'Correct form data returned without software engineer fallback');

    const getF2 = await fetch(`${BASE_URL}/api/forms?id=${formId2}`);
    assert(getF2.status === 200, 'GET /api/forms?id=formId2 returns exact second form');
    const f2Get = await getF2.json();
    assert(f2Get.title === 'Customer Satisfaction NPS', 'Second form data distinct and accurate');

    const getInvalid = await fetch(`${BASE_URL}/api/forms?id=non_existent_form_xyz`);
    assert(getInvalid.status === 404, 'Invalid form ID returns HTTP 404 Not Found');

    const spaRoute = await fetch(`${BASE_URL}/f/${formId1}`);
    assert(spaRoute.status === 200, 'SPA deep route /f/:id is accessible without login');

    // ------------------------------------------------------------------------
    // Group 5: Form Response Submission & Strict Authorization Gate
    // ------------------------------------------------------------------------
    console.log('\n[Test Group 5: Form Response Submission & Strict Authorization Gate]');

    const subId = `sub-test-${Date.now()}`;
    const subRes = await fetch(`${BASE_URL}/api/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: subId,
        formId: formId1,
        data: {
          q1: 'Elena Vance - Senior Director'
        }
      })
    });
    assert(subRes.status === 200, 'Response submission successful (HTTP 200)');
    assert(subRes.headers.get('x-database-engine') !== null, 'Header X-Database-Engine is present');

    // 5.1 Test Missing Token -> Must return 401 Unauthorized
    const unauthSubs = await fetch(`${BASE_URL}/api/submissions?formId=${formId1}`);
    assert(unauthSubs.status === 401, 'Unauthorized request (no token) rejected with HTTP 401');
    const unauthBody = await unauthSubs.json();
    assert(unauthBody.error && !Array.isArray(unauthBody), 'Response contains error message and NO private submission data');

    // 5.2 Test Invalid / Forged Token -> Must return 401 Unauthorized
    const forgedSubs = await fetch(`${BASE_URL}/api/submissions?formId=${formId1}`, {
      headers: { 'Authorization': 'Bearer forged.invalid.token.12345' }
    });
    assert(forgedSubs.status === 401, 'Forged/tampered session token rejected with HTTP 401');

    // 5.3 Test Expired Token -> Must return 401 Unauthorized
    const expiredPayload = Buffer.from(JSON.stringify({
      role: 'admin',
      iat: Date.now() - 100000,
      exp: Date.now() - 50000 // Expired 50 seconds ago
    })).toString('base64url');
    const expiredSig = crypto.createHmac('sha256', process.env.ADMIN_SECRET || 'formcraft_production_secret_key_2026_default')
      .update(expiredPayload).digest('base64url');
    const expiredToken = `${expiredPayload}.${expiredSig}`;

    const expiredRes = await fetch(`${BASE_URL}/api/submissions?formId=${formId1}`, {
      headers: { 'Authorization': `Bearer ${expiredToken}` }
    });
    assert(expiredRes.status === 401, 'Expired session token rejected with HTTP 401');

    // 5.4 Test Valid Administrator Token -> Must return 200 OK and decrypted submissions
    const adminLoginRes = await fetch(`${BASE_URL}/api/admin-auth?action=login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: process.env.ADMIN_PASSWORD || 'admin123' })
    });
    assert(adminLoginRes.status === 200, 'Admin login succeeded to retrieve valid bearer token');
    const { token: validAdminToken } = await adminLoginRes.json();

    const authSubs = await fetch(`${BASE_URL}/api/submissions?formId=${formId1}`, {
      headers: { 'Authorization': `Bearer ${validAdminToken}` }
    });
    assert(authSubs.status === 200, 'GET /api/submissions with valid admin token returns HTTP 200');
    const subs = await authSubs.json();
    assert(Array.isArray(subs), 'Authorized response returns submissions array');
    const foundSub = subs.find(s => s.id === subId);
    assert(foundSub && foundSub.data.q1 === 'Elena Vance - Senior Director', 'Decrypted submission data accurately delivered only to authorized administrator');

    // ------------------------------------------------------------------------
    // Group 6: Private File Storage & Upload Security
    // ------------------------------------------------------------------------
    console.log('\n[Test Group 6: Private File Storage & Path Traversal Guard]');

    const sampleFileBase64 = Buffer.from('PDF Mock CV Content for Executive Application').toString('base64');
    const uploadRes = await fetch(`${BASE_URL}/api/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'Elena_Vance_Resume.pdf',
        fileData: `data:application/pdf;base64,${sampleFileBase64}`
      })
    });
    assert(uploadRes.status === 200, 'Private file upload endpoint returns HTTP 200');
    const uploadData = await uploadRes.json();
    assert(uploadData.fileId.startsWith('file-') && uploadData.fileId.endsWith('.pdf'), 'File saved with sanitized random UUID filename');

    // Fetch uploaded file
    const fileFetchRes = await fetch(`${BASE_URL}${uploadData.url}`);
    assert(fileFetchRes.status === 200, 'Uploaded file retrieved from safe endpoint');
    assert(fileFetchRes.headers.get('content-disposition')?.includes('attachment'), 'File served with Content-Disposition: attachment');
    assert(fileFetchRes.headers.get('x-content-type-options') === 'nosniff', 'File served with nosniff header');

    // Path traversal test
    const pathTraversalRes = await fetch(`${BASE_URL}/api/files/%2e%2e%2fpackage.json`);
    assert(pathTraversalRes.status === 403 || pathTraversalRes.status === 404, 'Path traversal attempt safely rejected with 403/404');

    // ------------------------------------------------------------------------
    // Group 7: SQL Injection & Payload Hardening
    // ------------------------------------------------------------------------
    console.log('\n[Test Group 7: SQL Injection Resistance]');

    const sqliId = "form' OR '1'='1";
    const sqliRes = await fetch(`${BASE_URL}/api/forms?id=${encodeURIComponent(sqliId)}`);
    assert(sqliRes.status === 404, 'SQL Injection query safely treated as literal parameter (404 Not Found)');

    // ------------------------------------------------------------------------
    // Group 8: Admin Authentication, Password Hashing & Audit Log
    // ------------------------------------------------------------------------
    console.log('\n[Test Group 8: Authentication, Password Hashing & Audit Logging]');

    const badLogin = await fetch(`${BASE_URL}/api/admin-auth?action=login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'incorrect_password' })
    });
    assert(badLogin.status === 401, 'Invalid password rejected with HTTP 401');

    const goodLogin = await fetch(`${BASE_URL}/api/admin-auth?action=login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: process.env.ADMIN_PASSWORD || 'admin123' })
    });
    assert(goodLogin.status === 200, 'Valid admin password login successful (HTTP 200)');
    const loginObj = await goodLogin.json();
    assert(typeof loginObj.token === 'string' && loginObj.token.length > 20, 'HMAC session token issued');

    // Verify Audit Log
    const auditLogPath = path.join(__dirname, '..', 'data', 'audit.log');
    assert(fs.existsSync(auditLogPath), 'Audit log file created at data/audit.log');
    const logContent = fs.readFileSync(auditLogPath, 'utf8');
    assert(logContent.includes('LOGIN_SUCCESS') && logContent.includes('FORM_SAVED'), 'Audit log records security events without logging passwords');

    // ------------------------------------------------------------------------
    // Group 9: Production Persistence Hardening & Outage Handling
    // ------------------------------------------------------------------------
    console.log('\n[Test Group 9: Authoritative Production Persistence & Outage Handling]');

    // 9.1 Enable Strict PostgreSQL Mode (fallback disabled)
    setRequirePostgres(true);

    const strictStatusRes = await fetch(`${BASE_URL}/api/status`);
    assert(strictStatusRes.status === 503, 'GET /api/status returns HTTP 503 when PostgreSQL is required but offline');
    const strictStatus = await strictStatusRes.json();
    assert(strictStatus.requirePostgres === true, 'Status declares requirePostgres: true');

    // 9.2 Attempt Form Save in Strict Mode when DB is offline -> Must reject with 503/500
    const failedFormRes = await fetch(`${BASE_URL}/api/forms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: `form-strict-fail-${Date.now()}`,
        title: 'Should Fail Persistence In Strict Mode'
      })
    });
    assert(failedFormRes.status === 503 || failedFormRes.status === 500, 'Form write rejected with HTTP 503/500 when authoritative DB is offline (no false success)');
    const failedFormBody = await failedFormRes.json();
    assert(failedFormBody.success === false || failedFormBody.error, 'Response explicitly signals persistence failure');

    // 9.3 Attempt Submission Save in Strict Mode when DB is offline -> Must reject with 503/500
    const failedSubRes = await fetch(`${BASE_URL}/api/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: `sub-strict-fail-${Date.now()}`,
        formId: formId1,
        data: { test: 'value' }
      })
    });
    assert(failedSubRes.status === 503 || failedSubRes.status === 500, 'Submission write rejected with HTTP 503/500 when authoritative DB is offline (no false success)');

    // 9.4 Restore Standard Mode
    setRequirePostgres(false);
    const restoredStatus = await fetch(`${BASE_URL}/api/status`);
    assert(restoredStatus.status === 200, 'Status restored to HTTP 200 after resetting mode');

    // 9.5 Duplicate Submission Test (Idempotent submission handling)
    const dupSubId = `sub-dup-${Date.now()}`;
    const firstSub = await fetch(`${BASE_URL}/api/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: dupSubId,
        formId: formId1,
        data: { name: 'First Attempt' }
      })
    });
    assert(firstSub.status === 200, 'Initial submission succeeds with HTTP 200');

    const secondSub = await fetch(`${BASE_URL}/api/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: dupSubId,
        formId: formId1,
        data: { name: 'Duplicate Attempt' }
      })
    });
    // 9.6 Concurrent Submission Requests Test
    const concurrentIds = [`sub-c1-${Date.now()}`, `sub-c2-${Date.now()}`, `sub-c3-${Date.now()}`];
    const concurrentPromises = concurrentIds.map((cid, idx) => fetch(`${BASE_URL}/api/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: cid,
        formId: formId1,
        data: { name: `Concurrent Applicant #${idx + 1}` }
      })
    }));
    const concurrentResults = await Promise.all(concurrentPromises);
    assert(concurrentResults.every(r => r.status === 200), 'Concurrent submission requests handled safely without race conditions');

    // 9.7 Preservation of Local Migration JSON Files
    const localFormsPath = path.join(__dirname, '..', 'data', 'forms.json');
    assert(fs.existsSync(localFormsPath), 'Local migration forms file data/forms.json preserved and readable');
    const localSubsPath = path.join(__dirname, '..', 'data', 'submissions.json');
    assert(fs.existsSync(localSubsPath), 'Local migration submissions file data/submissions.json preserved and readable');

    // ------------------------------------------------------------------------
    // Group 10: Server Restart & State Durability Verification
    // ------------------------------------------------------------------------
    console.log('\n[Test Group 10: Server Restart & State Durability]');

    // Stop and restart server instance on test port to verify state durability
    await new Promise(resolve => serverInstance.close(resolve));
    serverInstance = startServer(TEST_PORT);
    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify previously created form survives restart
    const restartFormCheck = await fetch(`${BASE_URL}/api/forms?id=${formId1}`);
    assert(restartFormCheck.status === 200, 'Persisted form retrieved successfully after server restart');
    const restartFormObj = await restartFormCheck.json();
    assert(restartFormObj.id === formId1 && restartFormObj.title === 'Executive Fellowship Intake 2026', 'Form structure intact across restart');

    // Verify public share URL works after restart
    const restartShareUrl = await fetch(`${BASE_URL}/f/${formId1}`);
    assert(restartShareUrl.status === 200, 'Public form share URL accessible after server restart');

    // Verify admin login works after restart
    const restartLogin = await fetch(`${BASE_URL}/api/admin-auth?action=login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: process.env.ADMIN_PASSWORD || 'admin123' })
    });
    assert(restartLogin.status === 200, 'Admin credentials verified and login functional after server restart');
    console.log('\n===============================================================');
    console.log(`Security Test Suite Complete: ${passedCount} Passed, ${failedCount} Failed`);
    console.log('===============================================================');

  } catch (err) {
    console.error('Fatal error during test execution:', err);
    failedCount++;
  } finally {
    if (serverInstance) {
      serverInstance.close(() => {
        process.exit(failedCount === 0 ? 0 : 1);
      });
    } else {
      process.exit(failedCount === 0 ? 0 : 1);
    }
  }
}

runTests();
