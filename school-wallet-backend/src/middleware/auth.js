const JWTUtil = require('../utils/jwt');
const ResponseHandler = require('../utils/response');
const User = require('../models/User');
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();

const isSuperAdmin = (user) => Boolean(
  user &&
  (user.role === 'super_admin'
    || (user.role === 'admin'
      && user.email
      && user.email.toLowerCase() === SUPER_ADMIN_EMAIL))
);

const isAdmin = (user) => user?.role === 'admin' || user?.role === 'super_admin';

/**
 * Verify JWT token and attach user to request
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = JWTUtil.extractToken(authHeader);

    if (!token) {
      return ResponseHandler.unauthorized(res, 'Access token required');
    }

    const decoded = JWTUtil.verifyAccessToken(token);
    
    // Fetch user details from database
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return ResponseHandler.unauthorized(res, 'User not found');
    }

    if (user.status === 'deleted' || user.status === 'inactive') {
      return ResponseHandler.unauthorized(res, 'User account is inactive');
    }

    // Attach user to request object
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      vendorId: decoded.vendorId || null
    };

    next();
  } catch (error) {
    if (error.message.includes('token')) {
      return ResponseHandler.unauthorized(res, error.message);
    }
    console.error('Auth middleware error:', error);
    return ResponseHandler.serverError(res, 'Authentication error');
  }
};

/**
 * Verify user has required role
 */
const authorizeRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return ResponseHandler.unauthorized(res, 'User not authenticated');
    }

    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    if (!isSuperAdmin(req.user) && !roles.includes(req.user.role)) {
      return ResponseHandler.forbidden(res, `Only ${roles.join(', ')} can access this resource`);
    }

    next();
  };
};

const authorizeSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return ResponseHandler.unauthorized(res, 'User not authenticated');
  }

  if (!isSuperAdmin(req.user)) {
    return ResponseHandler.forbidden(res, 'Only the super admin can create vendors');
  }

  next();
};

/**
 * Optional authentication - checks token if provided but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = JWTUtil.extractToken(authHeader);

    if (token) {
      const decoded = JWTUtil.verifyAccessToken(token);
      const user = await User.findById(decoded.userId);
      
      if (user && user.status !== 'deleted') {
        req.user = {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          status: user.status
        };
      }
    }

    next();
  } catch (error) {
    // Token exists but is invalid - log but continue
    console.warn('Optional auth token validation failed:', error.message);
    next();
  }
};

/**
 * Rate limiting middleware
 */
const rateLimiter = (() => {
  const requests = new Map();

  return (windowMs = 15 * 60 * 1000, maxRequests = 100) => {
    return (req, res, next) => {
      const key = req.ip || req.connection.remoteAddress;
      const now = Date.now();
      
      if (!requests.has(key)) {
        requests.set(key, []);
      }

      const requestTimes = requests.get(key).filter(time => now - time < windowMs);
      
      if (requestTimes.length >= maxRequests) {
        return ResponseHandler.error(
          res,
          'Too many requests. Please try again later.',
          429
        );
      }

      requestTimes.push(now);
      requests.set(key, requestTimes);
      
      // Cleanup old entries periodically
      if (requests.size > 1000) {
        for (const [reqKey, times] of requests.entries()) {
          const validTimes = times.filter(time => now - time < windowMs);
          if (validTimes.length === 0) {
            requests.delete(reqKey);
          } else {
            requests.set(reqKey, validTimes);
          }
        }
      }

      next();
    };
  };
})();

module.exports = {
  authenticateToken,
  authorizeRole,
  authorizeSuperAdmin,
  isAdmin,
  isSuperAdmin,
  optionalAuth,
  rateLimiter
};
