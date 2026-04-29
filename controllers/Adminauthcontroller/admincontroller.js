const jwt = require('jsonwebtoken');
const AdminUser = require('../../Models/MainLoginSchema');

const JWT_SECRET     = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN;
const ADMIN_SECRET   = 'ADMIN2025';

// ── Generate JWT ──────────────────────────────────────────────────────────────
const generateToken = (admin) =>
    jwt.sign(
        { id: admin._id, username: admin.username, role: admin.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );

// ─── REGISTER ADMIN ───────────────────────────────────────────────────────────

const registerAdmin = async (req, res) => {
    const { username, password, secretCode } = req.body;

    try {
        // 1. Required fields
        if (!username || !password || !secretCode) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required: username, password, secretCode',
            });
        }

        // 2. Validate registration secret
        if (secretCode !== ADMIN_SECRET) {
            return res.status(401).json({
                success: false,
                message: 'INVALID_ADMIN_SECRET_CODE',
            });
        }

        // 3. Username format
        if (!/^[a-zA-Z0-9]{4,20}$/.test(username)) {
            return res.status(400).json({
                success: false,
                message: 'Username must be 4-20 alphanumeric characters',
            });
        }

        // 4. Password length
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters',
            });
        }

        // 5. Unique username check
        const existing = await AdminUser.findOne({ username: username.trim() });
        if (existing) {
            return res.status(409).json({
                success: false,
                message: 'USERNAME_ALREADY_EXISTS',
            });
        }

        // 6. Save — pre-save hook hashes password & secretCode
        const admin = new AdminUser({
            username: username.trim(),
            password,
            secretCode,
            role: 'admin',
        });
        await admin.save();

        // 7. Issue JWT
        const token = generateToken(admin);

        return res.status(201).json({
            success: true,
            message: 'Admin registered successfully',
            token,
            user: { id: admin._id, username: admin.username, role: admin.role },
        });

    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ success: false, message: 'USERNAME_ALREADY_EXISTS' });
        }
        console.error('Register error:', err.message);
        return res.status(500).json({ success: false, message: 'Server error during registration' });
    }
};

// ─── LOGIN ADMIN ──────────────────────────────────────────────────────────────

// Body: { username, password }  OR  { username, secretCode }
const loginAdmin = async (req, res) => {
    const { username, password, secretCode } = req.body;

    try {
        // 1. Required fields
        if (!username) {
            return res.status(400).json({ success: false, message: 'Username is required' });
        }
        if (!password && !secretCode) {
            return res.status(400).json({ success: false, message: 'Provide either password or secretCode' });
        }
        if (password && secretCode) {
            return res.status(400).json({ success: false, message: 'Provide either password or secretCode — not both' });
        }

        // 2. Find admin
        const admin = await AdminUser.findOne({ username: username.trim(), role: 'admin' });
        if (!admin) {
            return res.status(401).json({ success: false, message: 'ADMIN_NOT_FOUND' });
        }

        // 3. Verify credential with bcrypt
        let isAuthenticated = false;
        if (password) {
            isAuthenticated = await admin.comparePassword(password);
            if (!isAuthenticated) {
                return res.status(401).json({ success: false, message: 'INVALID_PASSWORD' });
            }
        } else {
            isAuthenticated = await admin.compareSecretCode(secretCode);
            if (!isAuthenticated) {
                return res.status(401).json({ success: false, message: 'INVALID_SECRET_CODE' });
            }
        }

        // 4. Issue JWT
        const token = generateToken(admin);

        return res.status(200).json({
            success: true,
            message: 'Login successful',
            token,
            user: { id: admin._id, username: admin.username, role: admin.role },
        });

    } catch (err) {
        console.error('Login error:', err.message);
        return res.status(500).json({ success: false, message: 'Server error during login' });
    }
};

// ─── GET ADMIN PROFILE (protected) ───────────────────────────────────────────

const getAdminProfile = (req, res) => {
    // req.admin attached by verifyAdminExists middleware
    return res.status(200).json({
        success: true,
        user: {
            id:        req.admin._id,
            username:  req.admin.username,
            role:      req.admin.role,
            createdAt: req.admin.createdAt,
        },
    });
};

module.exports = { registerAdmin, loginAdmin, getAdminProfile };