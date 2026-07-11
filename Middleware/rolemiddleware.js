

const jwt      = require('jsonwebtoken');
const AdminUser = require('../Models/MainLoginSchema');


const JWT_SECRET = process.env.JWT_SECRET;


// STEP 1 — verifyToken  (SHARED — used by BOTH admin & employee routes)

const protect = (req, res, next) => {
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
        req.user = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'TOKEN_EXPIRED' });
        }
        return res.status(401).json({ success: false, message: 'INVALID_TOKEN' });
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