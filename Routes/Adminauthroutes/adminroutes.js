

const express = require('express');
const router  = express.Router();

const { registerAdmin, loginAdmin, getAdminProfile, updateOwnProfile, createStaffAdmin,
  getAllStaffAdmins,
  updateStaffAdmin,
  deleteStaffAdmin,
  createOperationUser,
  getAllOperationUsers,
  updateOperationUser,
  deleteOperationUser,
  forgotPasswordReset,
  checkSession, } = require('../../controllers/Adminauthcontroller/admincontroller');


const {
    protect,
    isAdmin,
    verifyAdminExists,
} = require('../../Middleware/rolemiddleware');


router.post('/register-admin', registerAdmin);
router.post('/admin',   loginAdmin);
router.post('/admin/forgot-password/reset', forgotPasswordReset);
router.post('/staff-admins',protect,  createStaffAdmin);
router.get('/staff-admins',  protect,getAllStaffAdmins);
router.put('/staff-admins/:id',    updateStaffAdmin);
router.delete('/staff-admins/:id', deleteStaffAdmin);

router.post('/operation-users',protect,  createOperationUser);
router.get('/operation-users',  protect,getAllOperationUsers);
router.put('/operation-users/:id',  protect,  updateOperationUser);
router.delete('/operation-users/:id',protect, deleteOperationUser);

router.put('/admin/update-profile', protect, updateOwnProfile);
router.get('/admin/session-check', protect, checkSession);

router.get('/me',
    protect,        
    isAdmin,           
    verifyAdminExists,  
    getAdminProfile
);

module.exports = router;