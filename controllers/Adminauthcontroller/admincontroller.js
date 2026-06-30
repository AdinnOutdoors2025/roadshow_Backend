
require("dotenv").config();
const jwt = require('jsonwebtoken');
const AdminUser = require('../../Models/MainLoginSchema');
const { successResponse, errorResponse } = require('../../Utils/response');

const JWT_SECRET     = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN;

const generateToken = (admin) =>
  jwt.sign(
    { id: admin._id, username: admin.username, role: admin.role , isAdmin: admin.isAdmin ,email:admin.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


const registerAdmin = async (req, res) => {
  const { username, email, password } = req.body;

  try {
    if (!username || !email || !password) {
      return errorResponse(res, 'All fields are required: username, email, password', null, 400);
    }

    if (!/^[a-zA-Z0-9]{4,20}$/.test(username)) {
      return errorResponse(res, 'Username must be 4-20 alphanumeric characters', null, 400);
    }

    if (!EMAIL_REGEX.test(email.trim())) {
      return errorResponse(res, 'Please provide a valid email address', null, 400);
    }

    if (password.length < 6) {
      return errorResponse(res, 'Password must be at least 6 characters', null, 400);
    }

    const existing = await AdminUser.findOne({
      $or: [
        { username: username.trim() },
        { email: email.trim().toLowerCase() },
      ],
    });

    if (existing) {
      if (existing.username === username.trim()) {
        return errorResponse(res, 'USERNAME_ALREADY_EXISTS', null, 409);
      }
      return errorResponse(res, 'EMAIL_ALREADY_EXISTS', null, 409);
    }

    const admin = new AdminUser({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password,
      role: 'admin',
    });
    await admin.save();

    const token = generateToken(admin);

    return successResponse(res, 'Admin registered successfully', {
      token,
      user: { id: admin._id, username: admin.username, email: admin.email, role: admin.role },
    }, 201);

  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0];
      if (field === 'email') {
        return errorResponse(res, 'EMAIL_ALREADY_EXISTS', null, 409);
      }
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
      // role: 'admin',
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

const createStaffAdmin = async (req, res) => {
  const { username, email, password, phone } = req.body;

  try {
    if (!username || !email || !password)
      return errorResponse(res, 'Username, email and password are required', null, 400);

    if (!/^[a-zA-Z0-9]{4,20}$/.test(username))
      return errorResponse(res, 'Username must be 4-20 alphanumeric characters', null, 400);

    if (!EMAIL_REGEX.test(email.trim()))
      return errorResponse(res, 'Please provide a valid email address', null, 400);

    if (password.length < 6)
      return errorResponse(res, 'Password must be at least 6 characters', null, 400);

    const existing = await AdminUser.findOne({
      $or: [
        { username: username.trim() },
        { email: email.trim().toLowerCase() },
      ],
    });

    if (existing) {
      if (existing.username === username.trim())
        return errorResponse(res, 'USERNAME_ALREADY_EXISTS', null, 409);
      return errorResponse(res, 'EMAIL_ALREADY_EXISTS', null, 409);
    }

    const staffAdmin = new AdminUser({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password,
      phone: phone || '',
      isAdmin: 0,
      role: 'staffAdmin',
      status: 'active',
    });

    await staffAdmin.save();

    return successResponse(res, 'Staff admin created successfully', {
      user: {
        id: staffAdmin._id,
        username: staffAdmin.username,
        email: staffAdmin.email,
        phone: staffAdmin.phone,
        role: staffAdmin.role,
        isAdmin: staffAdmin.isAdmin,
        status: staffAdmin.status,
      },
    }, 201);

  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0];
      if (field === 'email')
        return errorResponse(res, 'EMAIL_ALREADY_EXISTS', null, 409);
      return errorResponse(res, 'USERNAME_ALREADY_EXISTS', null, 409);
    }
    return errorResponse(res, 'Server error', err.message);
  }
};

// GET ALL
const getAllStaffAdmins = async (req, res) => {
  try {
    const list = await AdminUser.find({ role: 'staffAdmin' }).sort({ createdAt: -1 });
    return successResponse(res, 'Staff admins fetched', { data: list });
  } catch (err) {
    return errorResponse(res, 'Server error', err.message);
  }
};

// UPDATE
const updateStaffAdmin = async (req, res) => {
  const { id } = req.params;
  const { username, email, phone, status, password } = req.body;

  try {
    const staffAdmin = await AdminUser.findOne({ _id: id, role: 'staffAdmin' });
    if (!staffAdmin)
      return errorResponse(res, 'Staff admin not found', null, 404);

    if (username) staffAdmin.username = username.trim();

    if (email) {
      if (!EMAIL_REGEX.test(email.trim()))
        return errorResponse(res, 'Please provide a valid email address', null, 400);
      staffAdmin.email = email.trim().toLowerCase();
    }

    if (phone !== undefined) staffAdmin.phone = phone;
    if (status) staffAdmin.status = status;

    if (password) {
      if (password.length < 6)
        return errorResponse(res, 'Password must be at least 6 characters', null, 400);
      staffAdmin.password = password; // pre-save hook hash பண்ணும்
    }

    await staffAdmin.save();

    return successResponse(res, 'Staff admin updated successfully', {
      user: {
        id: staffAdmin._id,
        username: staffAdmin.username,
        email: staffAdmin.email,
        phone: staffAdmin.phone,
        status: staffAdmin.status,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0];
      if (field === 'email')
        return errorResponse(res, 'EMAIL_ALREADY_EXISTS', null, 409);
      return errorResponse(res, 'USERNAME_ALREADY_EXISTS', null, 409);
    }
    return errorResponse(res, 'Server error', err.message);
  }
};

// DELETE
const deleteStaffAdmin = async (req, res) => {
  const { id } = req.params;
  try {
    const staffAdmin = await AdminUser.findOneAndDelete({ _id: id, role: 'staffAdmin' });
    if (!staffAdmin)
      return errorResponse(res, 'Staff admin not found', null, 404);
    return successResponse(res, 'Staff admin deleted successfully', null);
  } catch (err) {
    return errorResponse(res, 'Server error', err.message);
  }
};



module.exports = { registerAdmin, loginAdmin, getAdminProfile,createStaffAdmin, getAllStaffAdmins, updateStaffAdmin, deleteStaffAdmin };