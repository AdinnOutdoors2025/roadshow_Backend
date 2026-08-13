const express = require('express');
const router = express.Router();

const {
  getAllRolePermissions,
  getRolePermission,
  upsertRolePermission,
  getUserPermission,
  upsertUserPermission,
} = require('../../controllers/RolePermissionController/RolePermissionController');

const { protect, isAdmin } = require('../../Middleware/rolemiddleware');

router.get('/role-permissions', protect, isAdmin, getAllRolePermissions);
router.get('/role-permissions/:role', protect, getRolePermission);
router.put('/role-permissions/:role', protect, isAdmin, upsertRolePermission);

router.get('/user-permissions/:userId', protect, getUserPermission);
router.put('/user-permissions/:userId', protect, isAdmin, upsertUserPermission);

module.exports = router;
