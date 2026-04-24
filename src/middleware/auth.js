const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

/**
 * Verify access token and attach user to request.
 * Returns 401 with code 'TOKEN_EXPIRED' when the access token has expired
 * so the frontend knows to attempt a silent refresh.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided.', code: 'NO_TOKEN' });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        // Tell the client the access token expired — it should try /auth/refresh
        return res.status(401).json({ error: 'Access token expired.', code: 'TOKEN_EXPIRED' });
      }
      return res.status(401).json({ error: 'Invalid token.', code: 'TOKEN_INVALID' });
    }

    // Ensure this is an access token, not a refresh token
    if (decoded.type !== 'access') {
      return res.status(401).json({ error: 'Invalid token type.', code: 'TOKEN_INVALID' });
    }

    // Fetch fresh user data from DB
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User not found or inactive.', code: 'TOKEN_INVALID' });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Restrict access to specific roles.
 * @param {...string} roles - Allowed roles
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated.', code: 'NO_TOKEN' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${roles.join(' or ')}.`,
      });
    }

    next();
  };
};

module.exports = { authenticate, authorize };
