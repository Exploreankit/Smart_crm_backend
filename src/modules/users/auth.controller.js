const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../../config/prisma');

// ─── Token helpers ─────────────────────────────────────────────────────────────

/**
 * Generate a short-lived access token (1 day)
 */
const generateAccessToken = (userId) => {
  return jwt.sign(
    { userId, type: 'access' },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '1d' }
  );
};

/**
 * Generate a random opaque refresh token string (not a JWT).
 * We store a SHA-256 hash of it in the DB so the raw value never persists.
 */
const generateRefreshToken = () => {
  return crypto.randomBytes(64).toString('hex');
};

/** Hash a refresh token before storing */
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Persist a new refresh token for a user.
 * Expires in 7 days.
 */
const saveRefreshToken = async (userId, rawToken) => {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await prisma.refreshToken.create({
    data: {
      token: hashToken(rawToken),
      userId,
      expiresAt,
    },
  });
};

// ─── Controllers ───────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: role || 'SALESPERSON',
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken();
    await saveRefreshToken(user.id, refreshToken);

    res.status(201).json({ user, accessToken, refreshToken });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken();
    await saveRefreshToken(user.id, refreshToken);

    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword, accessToken, refreshToken });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/refresh
 * Exchange a valid refresh token for a new access token + rotated refresh token.
 * Implements refresh token rotation — old token is deleted on use.
 */
const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required.' });
    }

    const hashed = hashToken(refreshToken);

    // Look up the token in DB
    const stored = await prisma.refreshToken.findUnique({
      where: { token: hashed },
      include: { user: { select: { id: true, name: true, email: true, role: true, isActive: true } } },
    });

    if (!stored) {
      return res.status(401).json({ error: 'Invalid refresh token.', code: 'REFRESH_INVALID' });
    }

    // Check expiry
    if (new Date() > stored.expiresAt) {
      // Clean up expired token
      await prisma.refreshToken.delete({ where: { id: stored.id } });
      return res.status(401).json({ error: 'Refresh token expired. Please log in again.', code: 'REFRESH_EXPIRED' });
    }

    if (!stored.user.isActive) {
      return res.status(401).json({ error: 'Account is inactive.', code: 'REFRESH_INVALID' });
    }

    // Rotate: delete old token, issue new pair
    await prisma.refreshToken.delete({ where: { id: stored.id } });

    const newAccessToken = generateAccessToken(stored.user.id);
    const newRefreshToken = generateRefreshToken();
    await saveRefreshToken(stored.user.id, newRefreshToken);

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: stored.user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/logout
 * Revoke the provided refresh token (single device logout).
 */
const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      const hashed = hashToken(refreshToken);
      // Delete silently — don't error if token not found
      await prisma.refreshToken.deleteMany({ where: { token: hashed } });
    }

    res.json({ message: 'Logged out successfully.' });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/logout-all
 * Revoke ALL refresh tokens for the current user (all devices).
 */
const logoutAll = async (req, res, next) => {
  try {
    await prisma.refreshToken.deleteMany({ where: { userId: req.user.id } });
    res.json({ message: 'Logged out from all devices.' });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/me
 */
const getMe = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        createdAt: true,
        _count: {
          select: { assignedLeads: true, tasks: true },
        },
      },
    });
    res.json(user);
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/auth/change-password
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword },
    });

    // Revoke all refresh tokens so other sessions are invalidated after password change
    await prisma.refreshToken.deleteMany({ where: { userId: req.user.id } });

    res.json({ message: 'Password updated successfully. Please log in again.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login, refresh, logout, logoutAll, getMe, changePassword };
