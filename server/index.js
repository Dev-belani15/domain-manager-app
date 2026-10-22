import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dbService } from './db.js';
import { authService, requireAuth, requireAdmin } from './auth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

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
// SYSTEM & STATUS
// =============================================================================
app.get('/api/status', (req, res) => {
  const adminCount = dbService.getAdminCount();
  const totalUsers = dbService.getUserCount();
  res.json({
    hasAdmin: adminCount > 0,
    adminCount,
    totalUsers
  });
});

// Setup first admin (only valid if zero admins exist in database)
app.post('/api/auth/setup-first-admin', (req, res) => {
  const adminCount = dbService.getAdminCount();
  if (adminCount > 0) {
    return res.status(403).json({ error: 'Administrator already configured. Use admin console to create additional users.' });
  }

  const { name, email, password } = req.body;
  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Valid email and password (min 6 characters) are required.' });
  }

  const existing = dbService.getUserByEmail(email);
  if (existing) {
    return res.status(400).json({ error: 'User with this email already exists.' });
  }

  const user = dbService.createUser({
    id: 'usr_' + Date.now().toString(36),
    name: name && name.trim() ? name.trim() : 'Administrator',
    clientRef: 'Admin',
    email: email.trim().toLowerCase(),
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
});

// =============================================================================
// AUTHENTICATION ROUTES
// =============================================================================
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = dbService.getUserByEmail(email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
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
app.get('/api/domains', requireAuth, (req, res) => {
  // CLIENT ONLY sees their own domains, queried directly by their user_id
  const domains = dbService.getDomainsByUserId(req.user.id);
  res.json(domains);
});

app.post('/api/domains', requireAuth, (req, res) => {
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

  const newDomain = dbService.createDomain({
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
});

app.post('/api/domains/bulk', requireAuth, (req, res) => {
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

  dbService.createBatchDomains(listToInsert);
  res.status(201).json({
    message: `Successfully imported ${listToInsert.length} domain listings.`,
    count: listToInsert.length
  });
});

// =============================================================================
// ADMIN-ONLY ROUTES
// =============================================================================
app.get('/api/admin/domains', requireAuth, requireAdmin, (req, res) => {
  const allDomains = dbService.getAllDomains();
  res.json(allDomains);
});

app.put('/api/admin/domains/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, category, price, note, status } = req.body;

  const updated = dbService.updateDomain(id, {
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
});

app.delete('/api/admin/domains/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const domain = dbService.getDomainById(id);
  if (!domain) {
    return res.status(404).json({ error: 'Domain listing not found.' });
  }

  dbService.deleteDomain(id);
  res.json({ success: true, message: 'Domain deleted successfully.' });
});

app.get('/api/admin/clients', requireAuth, requireAdmin, (req, res) => {
  const clients = dbService.getAllClients();
  res.json(clients);
});

app.post('/api/admin/clients', requireAuth, requireAdmin, (req, res) => {
  const { name, email, password } = req.body;
  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Valid email and password (min 6 chars) are required.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const existing = dbService.getUserByEmail(cleanEmail);
  if (existing) {
    return res.status(400).json({ error: 'An account with this email already exists.' });
  }

  const refNum = Math.floor(100 + Math.random() * 900);
  const clientRef = `Client #${refNum}`;

  const newClient = dbService.createUser({
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
});

app.delete('/api/admin/clients/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  if (id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own active administrator account.' });
  }

  const target = dbService.getUserById(id);
  if (!target) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (target.role === 'admin') {
    const adminCount = dbService.getAdminCount();
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'Cannot delete the sole administrator account.' });
    }
  }

  dbService.deleteUser(id);
  res.json({ success: true, message: `Account ${target.email} removed.` });
});

// Start Server
app.listen(PORT, () => {
  console.log(`[DomainPortal Backend] Secure API server running on port ${PORT}`);
  const adminCount = dbService.getAdminCount();
  if (adminCount === 0) {
    console.log(`[Setup Alert] No administrator account found. Run 'npm run create-admin' or visit the portal to initialize master admin.`);
  } else {
    console.log(`[Security Status] System initialized with ${adminCount} administrator(s).`);
  }
});
