// const express = require('express');
// const router = express.Router();
// const jwt = require('jsonwebtoken');
// const User = require('./Models/MainLoginSchema');

// const JWT_SECRET = 'admin@2025';
// const ADMIN_SECRET = 'ADMIN2025';

// // Admin registration
// router.post('/register-admin', async (req, res) => {
//     const { username, password, secretCode } = req.body;

//     // console.log('Registration attempt:', { username, password, secretCode });
//  console.log('Registration attempt:', { username, password: password ? '***' : 'missing', secretCode: secretCode ? '***' : 'missing' });

//     try {
//          // Validate input
//         if (!username || !password || !secretCode) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'All fields are required'
//             });
//         }
//         // Validate secret code
//         if (secretCode !== ADMIN_SECRET) {
//             return res.status(401).json({ 
//                 success: false,
//                 message: 'INVALID_ADMIN_SECRET_CODE' 
//             });
//         }

//         // Validate username
//         if (!/^[a-zA-Z0-9]{4,20}$/.test(username)) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Username must be 4-20 alphanumeric characters'
//             });
//         }

//         // Validate password
//         if (password.length < 6) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Password must be at least 6 characters'
//             });
//         }

//         // Check if user exists
//         const existingUser = await User.findOne({ username });
//         if (existingUser) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'USERNAME_ALREADY_EXISTS'
//             });
//         }

//         // Create new admin user
//         const newAdmin = new User({
//             username,
//             password,
//             secretCode,
//             role: 'admin'
//         });

//         await newAdmin.save();

//         console.log('Admin registered successfully:', username);
        
//         res.status(201).json({
//             success: true,
//             message: 'Admin registered successfully'
//         });
//     } catch (err) {
//         console.error('Admin registration error:', err);
//         res.status(500).json({
//             success: false,
//             message: 'Server error during registration: ' + err.message
//         });
//     }
// });

// // Admin login
// router.post('/admin', async (req, res) => {
//     const { username, password, secretCode } = req.body;
    
//     console.log('Login attempt:', { username, hasPassword: !!password, hasSecretCode: !!secretCode });

//     try {

//         if (!username) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Username is required'
//             });
//         }

//         if (!password && !secretCode) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Provide either password or secret code'
//             });
//         }

//         // Find admin user
//         const admin = await User.findOne({ username :username.trim(), role: 'admin' });
//         if (!admin) {
//             return res.status(401).json({
//                 success: false,
//                 message: 'ADMIN_NOT_FOUND'
//             });
//         }

//         let isAuthenticated = false;
//         let authMethod = '';

//         // Check authentication method
//         if (password && !secretCode) {
//             authMethod = 'password';
//             isAuthenticated = (password === admin.password);
//             if (!isAuthenticated) {
//                 return res.status(401).json({
//                     success: false,
//                     message: 'INVALID_PASSWORD'
//                 });
//             }
//         } else if (secretCode && !password) {
//             authMethod = 'secretCode';
//             isAuthenticated = (secretCode === admin.secretCode);
//             if (!isAuthenticated) {
//                 return res.status(401).json({
//                     success: false,
//                     message: 'INVALID_SECRET_CODE'
//                 });
//             }
//         } else {
//             return res.status(400).json({
//                 success: false,
//                 message: 'PROVIDE_EITHER_PASSWORD_OR_SECRETCODE'
//             });
//         }

//         console.log(`Admin ${username} authenticated via ${authMethod}`);

//         // Create JWT token
//         const token = jwt.sign(
//             { 
//                 id: admin._id, 
//                 username: admin.username, 
//                 role: admin.role 
//             },
//             JWT_SECRET,
//             { expiresIn: '2h' }
//         );

//         res.json({
//             success: true,
//             token,
//             user: {
//                 id: admin._id,
//                 username: admin.username,
//                 role: admin.role
//             }
//         });
//     } catch (err) {
//         console.error('Admin login error:', err);
//         res.status(500).json({
//             success: false,
//             message: 'Server error during login: ' + err.message
//         });
//     }
// });

// module.exports = router;