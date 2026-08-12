const RolePermission = require('../../Models/RolePermissionModel');
const AdminUserLogin = require('../../Models/MainLoginSchema');
const { successResponse, errorResponse } = require('../../Utils/response');

const VALID_ROLES = ['sales', 'operation'];

const getAllRolePermissions = async (req, res) => {
  try {
    const list = await RolePermission.find({});
    return successResponse(res, 'Role permissions fetched', { data: list });
  } catch (err) {
    return errorResponse(res, 'Server error', err.message);
  }
};

const getRolePermission = async (req, res) => {
  const { role } = req.params;
  try {
    if (!VALID_ROLES.includes(role)) {
      return errorResponse(res, 'Invalid role', null, 400);
    }
    const doc = await RolePermission.findOne({ role });
    return successResponse(res, 'Role permission fetched', {
      data: doc || { role, allowedMenus: [] },
    });
  } catch (err) {
    return errorResponse(res, 'Server error', err.message);
  }
};

const upsertRolePermission = async (req, res) => {
  const { role } = req.params;
  const { allowedMenus } = req.body;
  try {
    if (!VALID_ROLES.includes(role)) {
      return errorResponse(res, 'Invalid role', null, 400);
    }
    if (!Array.isArray(allowedMenus)) {
      return errorResponse(res, 'allowedMenus must be an array', null, 400);
    }
    const doc = await RolePermission.findOneAndUpdate(
      { role },
      { role, allowedMenus },
      { new: true, upsert: true }
    );
    return successResponse(res, 'Role permission saved', { data: doc });
  } catch (err) {
    return errorResponse(res, 'Server error', err.message);
  }
};

// Per-user permission override. Falls back to the role-level default
// (userId: null doc) when this specific user has no override saved yet, so
// a user who's never been individually configured still gets the role's
// baseline access — same shape as getRolePermission's fallback.
const getUserPermission = async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await AdminUserLogin.findById(userId);
    if (!user) {
      return errorResponse(res, 'User not found', null, 404);
    }
    const override = await RolePermission.findOne({ userId });
    if (override) {
      return successResponse(res, 'User permission fetched', { data: override });
    }
    const roleDefault = await RolePermission.findOne({ role: user.role, userId: null });
    return successResponse(res, 'User permission fetched (role default)', {
      data: {
        role: user.role,
        userId,
        allowedMenus: roleDefault ? roleDefault.allowedMenus : [],
        isRoleDefault: true,
      },
    });
  } catch (err) {
    return errorResponse(res, 'Server error', err.message);
  }
};

const upsertUserPermission = async (req, res) => {
  const { userId } = req.params;
  const { allowedMenus } = req.body;
  try {
    if (!Array.isArray(allowedMenus)) {
      return errorResponse(res, 'allowedMenus must be an array', null, 400);
    }
    const user = await AdminUserLogin.findById(userId);
    if (!user) {
      return errorResponse(res, 'User not found', null, 404);
    }
    if (!VALID_ROLES.includes(user.role)) {
      return errorResponse(res, 'This user\'s role is not permission-gated', null, 400);
    }
    const doc = await RolePermission.findOneAndUpdate(
      { userId },
      { role: user.role, userId, allowedMenus },
      { new: true, upsert: true }
    );
    return successResponse(res, 'User permission saved', { data: doc });
  } catch (err) {
    return errorResponse(res, 'Server error', err.message);
  }
};

module.exports = {
  getAllRolePermissions, getRolePermission, upsertRolePermission,
  getUserPermission, upsertUserPermission,
};
