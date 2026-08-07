const express = require('express');
const router = express.Router();

const {
  getAllRolePermissions,
  getRolePermission,
  upsertRolePermission,
} = require('../../controllers/RolePermissionController/RolePermissionController');

const { protect, isAdmin } = require('../../Middleware/rolemiddleware');

router.get('/role-permissions', protect, isAdmin, getAllRolePermissions);
router.get('/role-permissions/:role', protect, getRolePermission);
router.put('/role-permissions/:role', protect, isAdmin, upsertRolePermission);

module.exports = router;
