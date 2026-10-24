import { spawn } from 'node:child_process';
import { dbService } from '../server/db.js';

const BASE_URL = 'http://localhost:3001';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runTests() {
  console.log('====================================================');
  console.log('  DomainPortal - Client Sign Up & Multi-Tenancy Test');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      process.exitCode = 1;
    }
  }

  // Clean up any test users from prior runs
  const cleanEmail1 = 'client1@testtenant.com';
  const cleanEmail2 = 'firebase_client@cloud.org';
  const u1 = await dbService.getUserByEmail(cleanEmail1);
  if (u1) await dbService.deleteUser(u1.id);
  const u2 = await dbService.getUserByEmail(cleanEmail2);
  if (u2) await dbService.deleteUser(u2.id);

  // Start backend server
  const server = spawn('node', ['server/index.js'], { stdio: 'inherit' });
  await sleep(1500);

  try {
    // -------------------------------------------------------------------------
    // TEST 1: System Status & Diagnostic API
    // -------------------------------------------------------------------------
    const statusRes = await fetch(`${BASE_URL}/api/status`);
    assert(statusRes.status === 200, 'GET /api/status returns 200 OK');
    const statusData = await statusRes.json();
    assert(typeof statusData.databaseEngine === 'string', `Database engine reported: ${statusData.databaseEngine}`);

    // -------------------------------------------------------------------------
    // TEST 2: Client Self-Registration (Sign Up)
    // -------------------------------------------------------------------------
    const regRes = await fetch(`${BASE_URL}/api/auth/register-client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Tenant One',
        clientRef: 'Tenant #101',
        email: cleanEmail1,
        password: 'ClientPassword123!'
      })
    });
    assert(regRes.status === 201, 'Client self-registration succeeded with 201 Created');
    const regData = await regRes.json();
    assert(regData.user.clientRef === 'Tenant #101', 'Assigned correct Client Reference');
    assert(regData.user.role === 'user', 'Client assigned non-admin user role');
    const cookieTenant1 = regRes.headers.get('set-cookie');
    assert(Boolean(cookieTenant1), 'Authentication cookie issued upon registration');

    // -------------------------------------------------------------------------
    // TEST 3: Firebase Auth User Synchronization
    // -------------------------------------------------------------------------
    const fbRes = await fetch(`${BASE_URL}/api/auth/firebase-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: 'fb_tenant_998877',
        email: cleanEmail2,
        name: 'Firebase Tenant Two',
        clientRef: 'Cloud Tenant #202'
      })
    });
    assert(fbRes.status === 200, 'Firebase user synchronization succeeded with 200 OK');
    const fbData = await fbRes.json();
    assert(fbData.user.email === cleanEmail2, 'Firebase user email synchronized');
    assert(fbData.user.clientRef === 'Cloud Tenant #202', 'Firebase client ref synchronized');
    const cookieTenant2 = fbRes.headers.get('set-cookie');

    // -------------------------------------------------------------------------
    // TEST 4: Tenant 1 Submits Domain
    // -------------------------------------------------------------------------
    const dom1Res = await fetch(`${BASE_URL}/api/domains`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieTenant1 },
      body: JSON.stringify({
        name: 'tenant-one-special.com',
        category: 'Tech',
        price: 2500,
        note: 'Secret strategy domain for Tenant 1'
      })
    });
    assert(dom1Res.status === 201, 'Tenant 1 submitted domain');

    // -------------------------------------------------------------------------
    // TEST 5: Tenant 2 Submits Domain
    // -------------------------------------------------------------------------
    const dom2Res = await fetch(`${BASE_URL}/api/domains`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieTenant2 },
      body: JSON.stringify({
        name: 'tenant-two-cloud.io',
        category: 'Cloud',
        price: 4900,
        note: 'Private portfolio for Tenant 2'
      })
    });
    assert(dom2Res.status === 201, 'Tenant 2 submitted domain');

    // -------------------------------------------------------------------------
    // TEST 6: Strict Isolation Verification
    // -------------------------------------------------------------------------
    const list1Res = await fetch(`${BASE_URL}/api/domains`, {
      headers: { Cookie: cookieTenant1 }
    });
    const list1 = await list1Res.json();
    assert(list1.length === 1, 'Tenant 1 sees exactly 1 domain');
    assert(list1[0].name === 'tenant-one-special.com', 'Tenant 1 sees only their domain');
    assert(!JSON.stringify(list1).includes('tenant-two-cloud.io'), 'Tenant 1 CANNOT see Tenant 2 domain');
    assert(!JSON.stringify(list1).includes('Private portfolio for Tenant 2'), 'Tenant 1 CANNOT see Tenant 2 private note');

    const list2Res = await fetch(`${BASE_URL}/api/domains`, {
      headers: { Cookie: cookieTenant2 }
    });
    const list2 = await list2Res.json();
    assert(list2.length === 1, 'Tenant 2 sees exactly 1 domain');
    assert(list2[0].name === 'tenant-two-cloud.io', 'Tenant 2 sees only their domain');
    assert(!JSON.stringify(list2).includes('tenant-one-special.com'), 'Tenant 2 CANNOT see Tenant 1 domain');
    assert(!JSON.stringify(list2).includes('Secret strategy domain for Tenant 1'), 'Tenant 2 CANNOT see Tenant 1 private note');

    // -------------------------------------------------------------------------
    // TEST 7: Tenant Forbidden from Admin API
    // -------------------------------------------------------------------------
    const forbiddenRes = await fetch(`${BASE_URL}/api/admin/domains`, {
      headers: { Cookie: cookieTenant1 }
    });
    assert(forbiddenRes.status === 403, 'Tenant 1 forbidden (403) from accessing Admin API');

    console.log(`\n====================================================`);
    console.log(`Summary: ${passed} / ${total} tests PASSED.`);
    console.log(`====================================================\n`);
  } finally {
    server.kill();
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
