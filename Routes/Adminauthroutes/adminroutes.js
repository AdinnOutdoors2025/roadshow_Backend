

const express = require('express');
const router  = express.Router();

const { registerAdmin, loginAdmin, getAdminProfile,createStaffAdmin,
  getAllStaffAdmins,
  updateStaffAdmin,
  deleteStaffAdmin, } = require('../../controllers/Adminauthcontroller/admincontroller');


const {
    protect,
    isAdmin,
    verifyAdminExists,
} = require('../../Middleware/rolemiddleware');


router.post('/register-admin', registerAdmin);
router.post('/admin',          loginAdmin);
router.post('/staff-admins',protect,  createStaffAdmin);
router.get('/staff-admins',  protect,getAllStaffAdmins);
router.put('/staff-admins/:id',    updateStaffAdmin);
router.delete('/staff-admins/:id', deleteStaffAdmin);

router.get('/me',
    protect,        
    isAdmin,           
    verifyAdminExists,  
    getAdminProfile
);

module.exports = router;