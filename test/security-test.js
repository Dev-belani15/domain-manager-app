import { spawn } from 'node:child_process';
import { dbService } from '../server/db.js';
import { authService } from '../server/auth.js';

const BASE_URL = 'http://localhost:3001';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runTests() {
  console.log('====================================================');
  console.log('       DomainPortal - Comprehensive Security Tests   ');
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

  // Start backend server
  const server = spawn('node', ['server/index.js'], { stdio: 'inherit' });
  await sleep(1500);

  try {
    // ----------------------------------------------------
    // TEST 1: Password Encryption & Zero Plaintext in DB
    // ----------------------------------------------------
    const adminUser = await dbService.getUserByEmail('admin@domainportal.internal');
    assert(adminUser !== undefined, 'Admin account exists in SQLite');
    assert(
      adminUser.password_hash.startsWith('$2b$10$') || adminUser.password_hash.startsWith('$2a$'),
      'Admin password is cryptographically hashed with bcrypt'
    );
    assert(!adminUser.password_hash.includes('AdminPass123!'), 'Plaintext password is NOT in database');

    // ----------------------------------------------------
    // TEST 2: Unauthenticated Access to Admin API Rejected
    // ----------------------------------------------------
    const unauthAdminRes = await fetch(`${BASE_URL}/api/admin/domains`);
    assert(unauthAdminRes.status === 401, 'Unauthenticated request to /api/admin/domains rejected with 401');

    // ----------------------------------------------------
    // TEST 3: Login Authentication
    // ----------------------------------------------------
    const failLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@domainportal.internal', password: 'WrongPassword' })
    });
    assert(failLoginRes.status === 401, 'Invalid password rejected with 401');

    const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@domainportal.internal', password: 'AdminPass123!' })
    });
    assert(adminLoginRes.status === 200, 'Admin login succeeded with 200');
    const adminCookie = adminLoginRes.headers.get('set-cookie');
    assert(adminCookie && adminCookie.includes('HttpOnly'), 'Authentication token issued in secure HttpOnly cookie');

    // ----------------------------------------------------
    // TEST 4: Admin Access with Server Verified Cookie
    // ----------------------------------------------------
    const adminDomainsRes = await fetch(`${BASE_URL}/api/admin/domains`, {
      headers: { Cookie: adminCookie }
    });
    assert(adminDomainsRes.status === 200, 'Verified Admin can access /api/admin/domains');

    // ----------------------------------------------------
    // TEST 5: Create Client Accounts & Test Multi-Tenancy
    // ----------------------------------------------------
    const existingAlpha = await dbService.getUserByEmail('alpha@company.com');
    if (existingAlpha) await dbService.deleteUser(existingAlpha.id);
    const existingBeta = await dbService.getUserByEmail('beta@corporation.com');
    if (existingBeta) await dbService.deleteUser(existingBeta.id);

    // Create Client Alpha
    const createAlphaRes = await fetch(`${BASE_URL}/api/admin/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ name: 'Client Alpha', email: 'alpha@company.com', password: 'AlphaSecret99!' })
    });
    assert(createAlphaRes.status === 201, 'Admin created Client Alpha');

    // Create Client Beta
    const createBetaRes = await fetch(`${BASE_URL}/api/admin/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ name: 'Client Beta', email: 'beta@corporation.com', password: 'BetaSecret99!' })
    });
    assert(createBetaRes.status === 201, 'Admin created Client Beta');

    // Login as Client Alpha
    const loginAlphaRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alpha@company.com', password: 'AlphaSecret99!' })
    });
    const alphaCookie = loginAlphaRes.headers.get('set-cookie');

    // Login as Client Beta
    const loginBetaRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'beta@corporation.com', password: 'BetaSecret99!' })
    });
    const betaCookie = loginBetaRes.headers.get('set-cookie');

    // Client Alpha attempts to access Admin API -> MUST BE FORBIDDEN (403)
    const alphaAdminAttempt = await fetch(`${BASE_URL}/api/admin/domains`, {
      headers: { Cookie: alphaCookie }
    });
    assert(alphaAdminAttempt.status === 403, 'Client Alpha forbidden (403) from accessing Admin API');

    // Client Alpha submits domains
    await fetch(`${BASE_URL}/api/domains`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: alphaCookie },
      body: JSON.stringify({ name: 'alphasolutions.io', category: 'Tech', price: 1200, note: 'Confidential Note A' })
    });

    // Client Beta submits domains
    await fetch(`${BASE_URL}/api/domains`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: betaCookie },
      body: JSON.stringify({ name: 'betacloud.net', category: 'DevOps', price: 3400, note: 'Confidential Note B' })
    });

    // Client Alpha fetches my domains -> MUST ONLY SEE alphasolutions.io
    const alphaDomainsRes = await fetch(`${BASE_URL}/api/domains`, {
      headers: { Cookie: alphaCookie }
    });
    const alphaDomains = await alphaDomainsRes.json();
    assert(alphaDomains.length === 1, 'Client Alpha receives exactly 1 domain');
    assert(alphaDomains[0].name === 'alphasolutions.io', 'Client Alpha receives their own domain');
    assert(!JSON.stringify(alphaDomains).includes('betacloud.net'), 'Client Alpha CANNOT see Client Beta domain');
    assert(!JSON.stringify(alphaDomains).includes('Confidential Note B'), 'Client Alpha CANNOT see Client Beta note');

    // Client Beta fetches my domains -> MUST ONLY SEE betacloud.net
    const betaDomainsRes = await fetch(`${BASE_URL}/api/domains`, {
      headers: { Cookie: betaCookie }
    });
    const betaDomains = await betaDomainsRes.json();
    assert(betaDomains.length === 1, 'Client Beta receives exactly 1 domain');
    assert(betaDomains[0].name === 'betacloud.net', 'Client Beta receives their own domain');
    assert(!JSON.stringify(betaDomains).includes('alphasolutions.io'), 'Client Beta CANNOT see Client Alpha domain');
    assert(!JSON.stringify(betaDomains).includes('Confidential Note A'), 'Client Beta CANNOT see Client Alpha note');

    // Admin fetches all domains -> Sees both
    const allAdminDomainsRes = await fetch(`${BASE_URL}/api/admin/domains`, {
      headers: { Cookie: adminCookie }
    });
    const allAdminDomains = await allAdminDomainsRes.json();
    assert(allAdminDomains.length >= 2, 'Admin can view all domains across all clients');

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
