
require("dotenv").config();
const jwt = require('jsonwebtoken');
const AdminUser = require('../../Models/MainLoginSchema');
const RolePermission = require('../../Models/RolePermissionModel');
const { successResponse, errorResponse } = require('../../Utils/response');

const JWT_SECRET     = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN;

// admin role gets full sidebar access, so no allowedMenus is embedded for it.
// sales/operation roles get their currently-configured allowedMenus baked into
// the token at login time — a permission change only takes effect on next login.
const generateToken = async (admin) => {
  let allowedMenus;
  if (admin.role === 'sales' || admin.role === 'operation') {
    const perm = await RolePermission.findOne({ role: admin.role });
    allowedMenus = perm ? perm.allowedMenus : [];
  }
  return jwt.sign(
    {
      id: admin._id,
      username: admin.username,
      role: admin.role,
      isAdmin: admin.isAdmin,
      email: admin.email,
      ...(allowedMenus ? { allowedMenus } : {}),
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

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

    const token = await generateToken(admin);

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

    const identifier = username.trim();
    const admin = await AdminUser.findOne({
      $or: [
        { username: identifier },
        { email: identifier.toLowerCase() },
      ],
    });

    if (!admin) {
      return errorResponse(res, 'ADMIN_NOT_FOUND', null, 401);
    }

    const isAuthenticated = await admin.comparePassword(password);
    if (!isAuthenticated) {
      return errorResponse(res, 'INVALID_PASSWORD', null, 401);
    }

    if (admin.status === 'inactive') {
      return errorResponse(res, 'ACCOUNT_INACTIVE', null, 401);
    }

    const token = await generateToken(admin);

    return successResponse(res, 'Login successful', { token, user: admin });

  } catch (err) {
    console.error(err);
    return errorResponse(res, 'Server error', err.message);
  }
};


// Cheap polling target for the frontend to detect mid-session deactivation —
// `protect` itself already 401s with ACCOUNT_INACTIVE before this runs if the
// account's status flipped since the token was issued.
const checkSession = (req, res) => {
  return successResponse(res, 'Session active', null);
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

// Self-service profile update — works for both "admin" and "staffAdmin" roles.
// Identifies the account via req.user.id (from the JWT), never a route param,
// so a logged-in user can only ever edit their own account here.
const updateOwnProfile = async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;

  try {
    const user = await AdminUser.findById(req.user.id);
    if (!user) return errorResponse(res, 'Account not found', null, 404);

    if (username !== undefined) {
      if (!/^[a-zA-Z0-9]{4,20}$/.test(username.trim()))
        return errorResponse(res, 'Username must be 4-20 alphanumeric characters', null, 400);
      user.username = username.trim();
    }

    if (email !== undefined) {
      if (!EMAIL_REGEX.test(email.trim()))
        return errorResponse(res, 'Please provide a valid email address', null, 400);

      const existing = await AdminUser.findOne({
        email: email.trim().toLowerCase(),
        _id: { $ne: user._id },
      });
      if (existing) return errorResponse(res, 'EMAIL_ALREADY_EXISTS', null, 409);

      user.email = email.trim().toLowerCase();
    }

    if (password) {
      if (password.length < 6)
        return errorResponse(res, 'Password must be at least 6 characters', null, 400);
      if (password !== confirmPassword)
        return errorResponse(res, 'Password and Confirm Password do not match', null, 400);
      user.password = password; // pre-save hook hashes this
    }

    await user.save();

    const token = await generateToken(user);

    return successResponse(res, 'Profile updated successfully', {
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        isAdmin: user.isAdmin,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return errorResponse(res, 'EMAIL_ALREADY_EXISTS', null, 409);
    }
    return errorResponse(res, 'Server error', err.message);
  }
};

// Management-user CRUD (Sales Management / Operation Management) —
// both roles share identical fields (username, email, phone, password, status),
// so the create/list/update/delete handlers are parametrized by `role`
// instead of duplicating the staffAdmin-era hardcoded functions.
const makeCreateManagementUser = (role) => async (req, res) => {
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
      if (existing.username === username.trim()) {
        return errorResponse(res, 'USERNAME_ALREADY_EXISTS', null, 409);
      }
      return errorResponse(res, 'EMAIL_ALREADY_EXISTS', null, 409);
    }

    const managementUser = new AdminUser({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password,
      phone: phone || '',
      isAdmin: role === 'sales' ? 2 : role === 'operation' ? 3 : 0,
      role,
      status: 'active',
    });

    await managementUser.save();

    return successResponse(res, 'User created successfully', {
      user: {
        id: managementUser._id,
        username: managementUser.username,
        email: managementUser.email,
        phone: managementUser.phone,
        role: managementUser.role,
        isAdmin: managementUser.isAdmin,
        status: managementUser.status,
      },
    }, 201);

  } catch (err) {
    if (err.code === 11000) {
      return errorResponse(res, 'EMAIL_ALREADY_EXISTS', null, 409);
    }
    return errorResponse(res, 'Server error', err.message);
  }
};

const makeGetAllManagementUsers = (role) => async (req, res) => {
  try {
    const list = await AdminUser.find({ role }).sort({ createdAt: -1 });
    return successResponse(res, 'Users fetched', { data: list });
  } catch (err) {
    return errorResponse(res, 'Server error', err.message);
  }
};

const makeUpdateManagementUser = (role) => async (req, res) => {
  const { id } = req.params;
  const { username, email, phone, status, password } = req.body;

  try {
    const managementUser = await AdminUser.findOne({ _id: id, role });
    if (!managementUser)
      return errorResponse(res, 'User not found', null, 404);

    if (username && username.trim() !== managementUser.username) {
      if (!/^[a-zA-Z0-9]{4,20}$/.test(username.trim()))
        return errorResponse(res, 'Username must be 4-20 alphanumeric characters', null, 400);
      const usernameTaken = await AdminUser.findOne({
        username: username.trim(),
        _id: { $ne: managementUser._id },
      });
      if (usernameTaken) return errorResponse(res, 'USERNAME_ALREADY_EXISTS', null, 409);
      managementUser.username = username.trim();
    }

    if (email && email.trim().toLowerCase() !== managementUser.email) {
      if (!EMAIL_REGEX.test(email.trim()))
        return errorResponse(res, 'Please provide a valid email address', null, 400);
      const emailTaken = await AdminUser.findOne({
        email: email.trim().toLowerCase(),
        _id: { $ne: managementUser._id },
      });
      if (emailTaken) return errorResponse(res, 'EMAIL_ALREADY_EXISTS', null, 409);
      managementUser.email = email.trim().toLowerCase();
    }

    if (phone !== undefined) managementUser.phone = phone;
    if (status) managementUser.status = status;

    if (password) {
      if (password.length < 6)
        return errorResponse(res, 'Password must be at least 6 characters', null, 400);
      managementUser.password = password; // pre-save hook hashes this
    }

    await managementUser.save();

    return successResponse(res, 'User updated successfully', {
      user: {
        id: managementUser._id,
        username: managementUser.username,
        email: managementUser.email,
        phone: managementUser.phone,
        status: managementUser.status,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return errorResponse(res, 'EMAIL_ALREADY_EXISTS', null, 409);
    }
    return errorResponse(res, 'Server error', err.message);
  }
};

const makeDeleteManagementUser = (role) => async (req, res) => {
  const { id } = req.params;
  try {
    const managementUser = await AdminUser.findOneAndDelete({ _id: id, role });
    if (!managementUser)
      return errorResponse(res, 'User not found', null, 404);
    return successResponse(res, 'User deleted successfully', null);
  } catch (err) {
    return errorResponse(res, 'Server error', err.message);
  }
};

// Forgot Password — no OTP/email-verification step; identifies the account
// by username or email and sets the new password directly.
const forgotPasswordReset = async (req, res) => {
  const { identifier, newPassword, confirmPassword } = req.body;

  try {
    if (!identifier || !newPassword || !confirmPassword)
      return errorResponse(res, 'Username/email, new password and confirm password are required', null, 400);

    if (newPassword.length < 6)
      return errorResponse(res, 'Password must be at least 6 characters', null, 400);

    if (newPassword !== confirmPassword)
      return errorResponse(res, 'Password and Confirm Password do not match', null, 400);

    const trimmedIdentifier = identifier.trim();
    const user = await AdminUser.findOne({
      $or: [
        { username: trimmedIdentifier },
        { email: trimmedIdentifier.toLowerCase() },
      ],
    });

    if (!user) return errorResponse(res, 'ACCOUNT_NOT_FOUND', null, 404);

    user.password = newPassword; // pre-save hook hashes this
    await user.save();

    return successResponse(res, 'Password reset successfully', null);
  } catch (err) {
    return errorResponse(res, 'Server error', err.message);
  }
};

// Sales Management (reuses the former "Staff Admin" endpoints/UI)
const createStaffAdmin = makeCreateManagementUser('sales');
const getAllStaffAdmins = makeGetAllManagementUsers('sales');
const updateStaffAdmin = makeUpdateManagementUser('sales');
const deleteStaffAdmin = makeDeleteManagementUser('sales');

// Operation Management
const createOperationUser = makeCreateManagementUser('operation');
const getAllOperationUsers = makeGetAllManagementUsers('operation');
const updateOperationUser = makeUpdateManagementUser('operation');
const deleteOperationUser = makeDeleteManagementUser('operation');

module.exports = {
  registerAdmin, loginAdmin, getAdminProfile, updateOwnProfile,
  createStaffAdmin, getAllStaffAdmins, updateStaffAdmin, deleteStaffAdmin,
  createOperationUser, getAllOperationUsers, updateOperationUser, deleteOperationUser,
  forgotPasswordReset, checkSession,
};