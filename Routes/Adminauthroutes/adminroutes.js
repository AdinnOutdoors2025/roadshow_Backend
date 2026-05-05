

const express = require('express');
const router  = express.Router();

const { registerAdmin, loginAdmin, getAdminProfile } = require('../../controllers/Adminauthcontroller/admincontroller');


const {
    protect,
    isAdmin,
    verifyAdminExists,
} = require('../../Middleware/rolemiddleware');


router.post('/register-admin', registerAdmin);
router.post('/admin',          loginAdmin);

router.get('/me',
    protect,        
    isAdmin,           
    verifyAdminExists,  
    getAdminProfile
);

module.exports = router;