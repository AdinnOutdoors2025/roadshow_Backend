

const jwt      = require('jsonwebtoken');
const AdminUser = require('../Models/MainLoginSchema');


const JWT_SECRET = process.env.JWT_SECRET;


// STEP 1 — verifyToken  (SHARED — used by BOTH admin & employee routes)
//
// Also re-checks the account's live `status` in the DB on every request
// (not just at login) — a JWT is stateless, so without this an admin
// deactivating a sales/operation user wouldn't take effect until that
// user's existing token naturally expires (up to 7 days later).

const protect = async (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'Access denied. No token provided.',
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        const liveUser = await AdminUser.findById(decoded.id);
        if (!liveUser) {
            return res.status(401).json({ success: false, message: 'ACCOUNT_NOT_FOUND' });
        }
        if (liveUser.status === 'inactive') {
            return res.status(401).json({ success: false, message: 'ACCOUNT_INACTIVE' });
        }

        // Merge token claims (e.g. allowedMenus, baked in at login) with the
        // live role/status/isAdmin, in case those changed after the token issued.
        req.user = { ...decoded, role: liveUser.role, isAdmin: liveUser.isAdmin, status: liveUser.status };
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'TOKEN_EXPIRED' });
        }
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ success: false, message: 'INVALID_TOKEN' });
        }
        console.error('protect middleware error:', err.message);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
};


// STEP 2 — authorizeRoles(...roles)   (ROLE-BASED — reusable factory)

const authorizeRoles = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            message: `Access denied. Allowed roles: [${roles.join(', ')}]`,
        });
    }
    next();
};


// STEP 3A — verifyAdminExists   (Admin DB check)

const verifyAdminExists = async (req, res, next) => {
    try {
        const admin = await AdminUser.findById(req.user.id);
        if (!admin || admin.role !== 'admin') {
            return res.status(401).json({
                success: false,
                message: 'Admin account no longer exists.',
            });
        }
        req.admin = admin;
        next();
    } catch (err) {
        console.error('verifyAdminExists error:', err.message);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
};



// ─────────────────────────────────────────────────────────────────────────────
// Named shortcuts (optional convenience aliases)

const isAdmin    = authorizeRoles('admin');

//CLIENT AUTHENTICATION
const authorizeUserType = (...types) => (req, res, next) => {
  if (!req.user || !types.includes(req.user.userType)) {
    return res.status(403).json({
      success: false,
      message: "Not allowed. This route is restricted to specific user types.",
    });
  }
  next();
};


module.exports = {
    protect,         
    authorizeRoles,     
    isAdmin,               
    verifyAdminExists,  
//CLIENT AUTHENTICATION
    authorizeUserType
};