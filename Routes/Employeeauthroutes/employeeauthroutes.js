// const express = require('express');
// const router  = express.Router();

// const { registerEmployee, loginEmployee, getEmployeeProfile } = require('../../controllers/Employeeauthcontroller/Employeeauthcontroller');

// // ── Import from ONE shared middleware file ────────────────────────────────────
// const {
//     protect,
//     isEmployee,
//     verifyEmployeeExists,
// } = require('../../Middleware/rolemiddleware');

// // ── Public routes ─────────────────────────────────────────────────────────────
// router.post('/employee/register', registerEmployee);
// router.post('/employee/login',    loginEmployee);

// // ── Protected routes ──────────────────────────────────────────────────────────
// router.get('/me',
//     protect,           
//     isEmployee,            
//     verifyEmployeeExists,  
//     getEmployeeProfile
// );

// module.exports = router;