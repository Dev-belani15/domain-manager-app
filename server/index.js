import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OAuth2Client } from 'google-auth-library';
import { dbService, isSupabaseConfigured } from './db.js';
import { authService, requireAuth, requireAdmin } from './auth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Google OAuth Client Configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '717056458888-ll7u994gjkl0j57t8mn7v774k0sgjls7.apps.googleusercontent.com';
const googleOAuthClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Middlewares
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Helper for clean domain strings
function cleanDomain(str) {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '');
}

// =============================================================================
// SYSTEM & DIAGNOSTIC STATUS
// =============================================================================

// Root endpoint for browser visits & health checks
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    name: 'DomainPortal Backend API Server',
    version: '1.0.0',
    message: 'Backend API server is running and healthy.',
    webApp: 'http://localhost:5173'
  });
});

app.get('/api', (req, res) => {
  res.json({
    status: 'online',
    message: 'DomainPortal API is operational.'
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/status', async (req, res) => {
  try {
    const adminCount = await dbService.getAdminCount();
    const totalUsers = await dbService.getUserCount();
    const databaseEngine = dbService.getDatabaseEngine();

    res.json({
      hasAdmin: adminCount > 0,
      adminCount,
      totalUsers,
      databaseEngine,
      isSupabase: databaseEngine === 'supabase',
      serverTime: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve system status', details: err.message });
  }
});

// Setup first admin (only valid if zero admins exist in database)
app.post('/api/auth/setup-first-admin', async (req, res) => {
  try {
    const adminCount = await dbService.getAdminCount();
    if (adminCount > 0) {
      return res.status(403).json({ error: 'Administrator already configured. Use admin console or sign in.' });
    }

    const { name, email, password } = req.body;
    if (!email || !password || password.length < 6) {
      return res.status(400).json({ error: 'Valid email and password (min 6 characters) are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await dbService.getUserByEmail(cleanEmail);
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists.' });
    }

    const user = await dbService.createUser({
      id: 'admin_' + Date.now().toString(36),
      name: name && name.trim() ? name.trim() : 'Master Administrator',
      clientRef: 'System Admin',
      email: cleanEmail,
      passwordHash: authService.hashPassword(password),
      role: 'admin',
      createdAt: new Date().toISOString().split('T')[0]
    });

    const token = authService.generateToken(user);
    res.cookie(authService.COOKIE_NAME, token, authService.getCookieOptions());

    res.status(201).json({
      message: 'Master administrator created successfully.',
      user: {
        id: user.id,
        name: user.name,
        clientRef: user.client_ref,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// AUTHENTICATION & MULTI-TENANT CLIENT REGISTRATION
// =============================================================================

/**
 * CLIENT SELF-REGISTRATION (Sign Up)
 * Allows new clients to register their account and receive an isolated tenant workspace.
 */
app.post('/api/auth/register-client', async (req, res) => {
  try {
    const { name, email, password, clientRef } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await dbService.getUserByEmail(cleanEmail);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists. Please sign in.' });
    }

    // Auto-generate client reference if not provided (e.g. Client #342)
    const refNumber = Math.floor(100 + Math.random() * 900);
    const assignedRef = (clientRef && clientRef.trim()) || `Client #${refNumber}`;
    const displayName = (name && name.trim()) || assignedRef;

    // Check if designated admin in ADMIN_EMAILS
    const isAdmin = authService.isAdminEmail(cleanEmail);

    const newUser = await dbService.createUser({
      id: 'client_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
      name: displayName,
      clientRef: assignedRef,
      email: cleanEmail,
      passwordHash: authService.hashPassword(password),
      role: isAdmin ? 'admin' : 'user',
      createdAt: new Date().toISOString().split('T')[0]
    });

    const token = authService.generateToken(newUser);
    res.cookie(authService.COOKIE_NAME, token, authService.getCookieOptions());

    res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      user: {
        id: newUser.id,
        name: newUser.name,
        clientRef: newUser.client_ref,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (err) {
    console.error('[Register Client Error]:', err);
    res.status(500).json({ error: err.message || 'Failed to create client account.' });
  }
});

/**
 * FIREBASE AUTH INTEGRATION (Sign Up & Login)
 * Synchronizes Firebase-authenticated users with Supabase/internal database.
 */
app.post('/api/auth/firebase-sync', async (req, res) => {
  try {
    const { idToken, uid, email, name, clientRef } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required from Firebase authentication.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const targetUid = uid || 'fb_' + Date.now().toString(36);

    // Check if user already exists by ID or email
    let user = await dbService.getUserById(targetUid);
    if (!user) {
      user = await dbService.getUserByEmail(cleanEmail);
    }

    if (!user) {
      // Provision new client tenant in Supabase / SQLite
      const refNumber = Math.floor(100 + Math.random() * 900);
      const assignedRef = (clientRef && clientRef.trim()) || `Client #${refNumber}`;
      const displayName = (name && name.trim()) || assignedRef;
      const isAdmin = authService.isAdminEmail(cleanEmail);

      user = await dbService.createUser({
        id: targetUid,
        name: displayName,
        clientRef: assignedRef,
        email: cleanEmail,
        passwordHash: '', // Handled by Firebase Auth
        role: isAdmin ? 'admin' : 'user',
        createdAt: new Date().toISOString().split('T')[0]
      });
    }

    const token = authService.generateToken(user);
    res.cookie(authService.COOKIE_NAME, token, authService.getCookieOptions());

    res.json({
      success: true,
      message: 'Firebase authenticated successfully.',
      user: {
        id: user.id,
        name: user.name,
        clientRef: user.client_ref,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('[Firebase Sync Error]:', err);
    res.status(500).json({ error: err.message || 'Firebase synchronization failed.' });
  }
});

/**
 * GOOGLE IDENTITY SERVICES OAUTH (Sign In & Sign Up)
 * Supports Google ID token verification and Google Access Token profile retrieval.
 */
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential, accessToken } = req.body;

    if (!credential && !accessToken) {
      return res.status(400).json({ error: 'Google credential or access token is required.' });
    }

    let email = '';
    let name = '';
    let googleId = '';

    if (credential) {
      // 1. Verify Google ID token
      try {
        const ticket = await googleOAuthClient.verifyIdToken({
          idToken: credential,
          audience: GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        email = payload.email;
        name = payload.name || payload.given_name || (email ? email.split('@')[0] : 'Google User');
        googleId = payload.sub;
      } catch (verifyErr) {
        // Fallback: Validate against Google's tokeninfo API
        console.warn('[Google verifyIdToken failed]:', verifyErr.message, 'Trying Google tokeninfo API fallback...');
        const tokenRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
        if (!tokenRes.ok) {
          throw new Error('Google token verification failed. Please try signing in again.');
        }
        const tokenInfo = await tokenRes.json();
        email = tokenInfo.email;
        name = tokenInfo.name || (email ? email.split('@')[0] : 'Google User');
        googleId = tokenInfo.sub;
      }
    } else if (accessToken) {
      // 2. Fetch user profile from Google UserInfo API using Access Token
      const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!userinfoRes.ok) {
        throw new Error('Failed to retrieve user profile from Google.');
      }
      const profile = await userinfoRes.json();
      email = profile.email;
      name = profile.name || profile.given_name || (email ? email.split('@')[0] : 'Google User');
      googleId = profile.sub;
    }

    if (!email) {
      return res.status(400).json({ error: 'No email address found in Google account.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const targetUid = 'g_' + (googleId || Date.now().toString(36));

    // Check if user already exists
    let user = await dbService.getUserById(targetUid);
    if (!user) {
      user = await dbService.getUserByEmail(cleanEmail);
    }

    if (!user) {
      // Auto-provision client account with unique client ref
      const refNumber = Math.floor(100 + Math.random() * 900);
      const assignedRef = `Client #${refNumber}`;
      const isAdmin = authService.isAdminEmail(cleanEmail);

      user = await dbService.createUser({
        id: targetUid,
        name: name || assignedRef,
        clientRef: assignedRef,
        email: cleanEmail,
        passwordHash: '', // Authenticated via Google
        role: isAdmin ? 'admin' : 'user',
        createdAt: new Date().toISOString().split('T')[0]
      });
    }

    const token = authService.generateToken(user);
    res.cookie(authService.COOKIE_NAME, token, authService.getCookieOptions());

    res.json({
      success: true,
      message: 'Signed in with Google successfully.',
      user: {
        id: user.id,
        name: user.name,
        clientRef: user.client_ref,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('[Google OAuth Error]:', err);
    res.status(401).json({ error: err.message || 'Google authentication failed.' });
  }
});


/**
 * STANDARD DIRECT LOGIN
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await dbService.getUserByEmail(cleanEmail);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (!user.password_hash) {
      return res.status(401).json({
        error: 'This account was created via Firebase/Google. Please sign in with Firebase or Google.'
      });
    }

    const passwordValid = authService.comparePassword(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = authService.generateToken(user);
    res.cookie(authService.COOKIE_NAME, token, authService.getCookieOptions());

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        clientRef: user.client_ref,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(authService.COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax'
  });
  res.json({ success: true, message: 'Logged out successfully.' });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      clientRef: req.user.client_ref,
      email: req.user.email,
      role: req.user.role
    }
  });
});

// =============================================================================
// CLIENT DOMAIN ROUTES (Strict Tenant Isolation)
// =============================================================================

/**
 * GET CLIENT'S SPECIFIC DOMAINS
 * Guarantees that Client A only sees Client A's data!
 */
app.get('/api/domains', requireAuth, async (req, res) => {
  try {
    const domains = await dbService.getDomainsByUserId(req.user.id);
    res.json(domains);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch domain listings.', details: err.message });
  }
});

/**
 * SUBMIT SINGLE DOMAIN
 * Attached to authenticated client user_id
 */
app.post('/api/domains', requireAuth, async (req, res) => {
  try {
    const { name, category, price, note } = req.body;
    const cleanedName = cleanDomain(name);

    if (!cleanedName) {
      return res.status(400).json({ error: 'Please enter a valid domain name.' });
    }
    if (!category || !category.trim()) {
      return res.status(400).json({ error: 'Category is required.' });
    }
    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice <= 0) {
      return res.status(400).json({ error: 'Please enter a positive numeric asking price.' });
    }

    const newDomain = await dbService.createDomain({
      id: 'dom-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
      userId: req.user.id,
      clientRef: req.user.client_ref,
      userEmail: req.user.email,
      name: cleanedName,
      category: category.trim(),
      price: numPrice,
      note: (note || '').trim(),
      status: 'Available',
      dateAdded: new Date().toISOString().split('T')[0]
    });

    res.status(201).json(newDomain);
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit domain.', details: err.message });
  }
});

/**
 * BULK EXCEL / CSV DOMAIN UPLOAD
 */
app.post('/api/domains/bulk', requireAuth, async (req, res) => {
  try {
    const { domains } = req.body;
    if (!Array.isArray(domains) || domains.length === 0) {
      return res.status(400).json({ error: 'A non-empty list of domains is required.' });
    }

    const now = new Date().toISOString().split('T')[0];
    const listToInsert = [];

    for (let i = 0; i < domains.length; i++) {
      const item = domains[i];
      const cleaned = cleanDomain(item.name);
      const cat = (item.category || 'General').trim();
      const pr = Number(item.price);
      if (cleaned && !isNaN(pr) && pr > 0) {
        listToInsert.push({
          id: 'dom-' + Date.now().toString(36) + '-' + i,
          userId: req.user.id,
          clientRef: req.user.client_ref,
          userEmail: req.user.email,
          name: cleaned,
          category: cat,
          price: pr,
          note: (item.note || '').trim(),
          status: 'Available',
          dateAdded: now
        });
      }
    }

    if (listToInsert.length === 0) {
      return res.status(400).json({ error: 'No valid domain records found in the upload.' });
    }

    await dbService.createBatchDomains(listToInsert);
    res.status(201).json({
      message: `Successfully imported ${listToInsert.length} domain listings.`,
      count: listToInsert.length
    });
  } catch (err) {
    res.status(500).json({ error: 'Bulk import failed.', details: err.message });
  }
});

// =============================================================================
// ADMIN-ONLY ROUTES (Cross-Tenant Access)
// =============================================================================
app.get('/api/admin/domains', requireAuth, requireAdmin, async (req, res) => {
  try {
    const allDomains = await dbService.getAllDomains();
    res.json(allDomains);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve all domains.', details: err.message });
  }
});

app.put('/api/admin/domains/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, price, note, status } = req.body;

    const updated = await dbService.updateDomain(id, {
      name: name ? cleanDomain(name) : undefined,
      category: category ? category.trim() : undefined,
      price: price !== undefined ? Number(price) : undefined,
      note: note !== undefined ? note.trim() : undefined,
      status
    });

    if (!updated) {
      return res.status(404).json({ error: 'Domain listing not found.' });
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update domain.', details: err.message });
  }
});

app.delete('/api/admin/domains/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const domain = await dbService.getDomainById(id);
    if (!domain) {
      return res.status(404).json({ error: 'Domain listing not found.' });
    }

    await dbService.deleteDomain(id);
    res.json({ success: true, message: 'Domain deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete domain.', details: err.message });
  }
});

app.get('/api/admin/clients', requireAuth, requireAdmin, async (req, res) => {
  try {
    const clients = await dbService.getAllClients();
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve clients.', details: err.message });
  }
});

app.post('/api/admin/clients', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password || password.length < 6) {
      return res.status(400).json({ error: 'Valid email and password (min 6 chars) are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await dbService.getUserByEmail(cleanEmail);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const refNum = Math.floor(100 + Math.random() * 900);
    const clientRef = `Client #${refNum}`;

    const newClient = await dbService.createUser({
      id: 'usr_' + Date.now().toString(36),
      name: (name && name.trim()) || clientRef,
      clientRef,
      email: cleanEmail,
      passwordHash: authService.hashPassword(password),
      role: 'user',
      createdAt: new Date().toISOString().split('T')[0]
    });

    res.status(201).json({
      success: true,
      user: {
        id: newClient.id,
        name: newClient.name,
        clientRef: newClient.client_ref,
        email: newClient.email,
        role: newClient.role,
        createdAt: newClient.created_at
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/clients/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own active administrator account.' });
    }

    const target = await dbService.getUserById(id);
    if (!target) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (target.role === 'admin') {
      const adminCount = await dbService.getAdminCount();
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot delete the sole administrator account.' });
      }
    }

    await dbService.deleteUser(id);
    res.json({ success: true, message: `Account ${target.email} removed.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Server
app.listen(PORT, async () => {
  console.log(`[DomainPortal Backend] Secure API server running on port ${PORT}`);
  try {
    const adminCount = await dbService.getAdminCount();
    const engine = dbService.getDatabaseEngine();
    console.log(`[Database Status] Using ${engine.toUpperCase()} engine. Admins initialized: ${adminCount}.`);
  } catch (e) {
    console.warn(`[Startup check]`, e.message);
  }
});
