

const jwt = require('jsonwebtoken');
const AdminUser = require('../../Models/MainLoginSchema');
const { successResponse, errorResponse } = require('../../Utils/response');

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
      return errorResponse(res, 'All fields are required: username, password', null, 400);
    }

    if (!/^[a-zA-Z0-9]{4,20}$/.test(username)) {
      return errorResponse(res, 'Username must be 4-20 alphanumeric characters', null, 400);
    }

    if (password.length < 6) {
      return errorResponse(res, 'Password must be at least 6 characters', null, 400);
    }

    const existing = await AdminUser.findOne({ username: username.trim() });
    if (existing) {
      return errorResponse(res, 'USERNAME_ALREADY_EXISTS', null, 409);
    }

    const admin = new AdminUser({
      username: username.trim(),
      password,
      role: 'admin',
    });
    await admin.save();

    const token = generateToken(admin);

    return successResponse(res, 'Admin registered successfully', {
      token,
      user: { id: admin._id, username: admin.username, role: admin.role },
    }, 201);

  } catch (err) {
    if (err.code === 11000) {
      return errorResponse(res, 'USERNAME_ALREADY_EXISTS', null, 409);
    }
    console.error('Register error:', err.message);
    return errorResponse(res, 'Server error during registration', err.message);
  }
};


const loginAdmin = async (req, res) => {
  const { username, password } = req.body;

  try {
    if (!username || !password) {
      return errorResponse(res, 'Username and password are required', null, 400);
    }

    const admin = await AdminUser.findOne({
      username: username.trim(),
      role: 'admin',
    });

    if (!admin) {
      return errorResponse(res, 'ADMIN_NOT_FOUND', null, 401);
    }

    const isAuthenticated = await admin.comparePassword(password);
    if (!isAuthenticated) {
      return errorResponse(res, 'INVALID_PASSWORD', null, 401);
    }

    const token = generateToken(admin);

    return successResponse(res, 'Login successful', { token, user: admin });

  } catch (err) {
    console.error(err);
    return errorResponse(res, 'Server error', err.message);
  }
};


const getAdminProfile = (req, res) => {
  return successResponse(res, 'Profile fetched successfully', {
    user: {
      id:        req.admin._id,
      username:  req.admin.username,
      role:      req.admin.role,
      createdAt: req.admin.createdAt,
    },
  });
};

module.exports = { registerAdmin, loginAdmin, getAdminProfile };