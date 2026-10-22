import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { dbService } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'domain_portal_super_secure_jwt_secret_9834271';
const COOKIE_NAME = 'domain_portal_token';

export const authService = {
  hashPassword(password) {
    const salt = bcrypt.genSaltSync(10);
    return bcrypt.hashSync(password, salt);
  },

  comparePassword(plain, hash) {
    return bcrypt.compareSync(plain, hash);
  },

  generateToken(user) {
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        clientRef: user.client_ref,
        name: user.name
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
  },

  verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch {
      return null;
    }
  },

  getCookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    };
  },

  COOKIE_NAME
};

export function requireAuth(req, res, next) {
  // Check cookie or Bearer token header
  let token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  const payload = authService.verifyToken(token);
  if (!payload) {
    res.clearCookie(COOKIE_NAME);
    return res.status(401).json({ error: 'Session expired or invalid token. Please sign in again.' });
  }

  // Verify user still exists in database
  const user = dbService.getUserById(payload.id);
  if (!user) {
    res.clearCookie(COOKIE_NAME);
    return res.status(401).json({ error: 'User account no longer exists.' });
  }

  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden. Administrator privileges required.' });
  }
  next();
}
