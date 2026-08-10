const RolePermission = require('../../Models/RolePermissionModel');
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

module.exports = { getAllRolePermissions, getRolePermission, upsertRolePermission };
