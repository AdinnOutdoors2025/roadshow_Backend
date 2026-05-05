const jwt = require('jsonwebtoken');
const AdminUser = require('../../Models/MainLoginSchema');

const JWT_SECRET     = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN;

const generateToken = (admin) =>
  jwt.sign(
    { id: admin._id, username: admin.username, role: admin.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );


const registerAdmin = async (req, res) => {
  const { username, password } = req.body;

  try {
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: username, password',
      });
    }

    if (!/^[a-zA-Z0-9]{4,20}$/.test(username)) {
      return res.status(400).json({
        success: false,
        message: 'Username must be 4-20 alphanumeric characters',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters',
      });
    }

    const existing = await AdminUser.findOne({ username: username.trim() });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'USERNAME_ALREADY_EXISTS',
      });
    }

    const admin = new AdminUser({
      username: username.trim(),
      password,
      role: 'admin',
    });
    await admin.save();

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


const loginAdmin = async (req, res) => {
  const { username, password } = req.body;

  try {
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
      });
    }

    const admin = await AdminUser.findOne({
      username: username.trim(),
      role: 'admin',
    });

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'ADMIN_NOT_FOUND',
      });
    }

    const isAuthenticated = await admin.comparePassword(password);
    if (!isAuthenticated) {
      return res.status(401).json({
        success: false,
        message: 'INVALID_PASSWORD',
      });
    }

    const token = generateToken(admin);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: admin,
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

const getAdminProfile = (req, res) => {
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