// src/middleware/rbac.js — Role-Based Access Control
/**
 * Require specific roles to access a route.
 * Usage: router.get('/admin', authenticate, requireRole('admin'), handler)
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: `Required role: ${roles.join(' or ')}`,
    });
  }
  next();
};

module.exports = { requireRole };
