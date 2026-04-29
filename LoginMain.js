const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const bcyrypt = require('bcryptjs');
const request = require('request');
require('dotenv').config();

// MongoDB connection 
// //USER LOGIN DETAILS ARE STORED IN THIS COLLECTION / DATABASE
// const UserSchema = new mongoose.Schema(
//     {
//         userName: { type: String, required: true },
//         userEmail: { type: String, required: true, unique: true },
//         userPhone: { type: String, required: true },
//         createdAt: { type: Date, default: Date.now }
//     }
// );
// const User = mongoose.model("User", UserSchema);

// Add this to your backend (after User schema)
const EmployeeSchema = new mongoose.Schema(
    {
        employeeName: { type: String, required: true },
        employeeEmail: { type: String, required: true, unique: true },
        secretCode : {type: String},
        employeeId: { type: String, required: true, unique: true },
        role: { type: String, default: 'employee' },
        // department: { type: String },
        createdAt: { type: Date, default: Date.now },
        lastLogin: { type: Date }
    }
);
const Employee = mongoose.model("Employee", EmployeeSchema);


const router = express.Router();
router.use(bodyParser.json());
router.use(cors());



// // Configuration
// const NETTYFISH_API_KEY = process.env.NETTYFISH_API_KEY || 'aspv58uRbkqDbhCcCN87Mw';
// const NETTYFISH_SENDER_ID = process.env.NETTYFISH_SENDER_ID || 'ADINAD';
// const NETTYFISH_TEMPLATE_ID = process.env.NETTYFISH_TEMPLATE_ID || '1007403395830327066';

// const otpStore = {}; // Store OTPs temporarily


// Employee Registration Endpoint
router.post('/employee/register', async (req, res) => {
    const { employeeName, employeeEmail, secretCode } = req.body;
    
    try {
        // Validate secret code
        if (secretCode !== "AdinnRdShowAdmin@2025") {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid secret code" 
            });
        }
        
        // Validate email domain
        if (!employeeEmail.endsWith('@adinn.co.in')) {
            return res.status(400).json({ 
                success: false, 
                message: "Only @adinn.co.in emails are allowed" 
            });
        }
        
        // Check if employee already exists
        const existingEmployee = await Employee.findOne({ employeeEmail });
        if (existingEmployee) {
            return res.status(400).json({ 
                success: false, 
                message: "Employee already registered. Please login." 
            });
        }
        
        // Create new employee
        const newEmployee = new Employee({
            employeeName,
            employeeEmail,
            secretCode,
            employeeId: `EMP${Date.now()}`,
            role: 'employee'
        });
        
        await newEmployee.save();
        
        res.json({
            success: true,
            message: "Employee registered successfully",
            employee: {
                employeeName: newEmployee.employeeName,
                employeeEmail: newEmployee.employeeEmail,
                secretCode : newEmployee.secretCode,
                employeeId: newEmployee.employeeId,
                role: newEmployee.role
            }
        });
        
    } catch (err) {
        console.error(err);
        res.status(500).json({ 
            success: false, 
            message: "Server error during registration" 
        });
    }
});

// Employee Login Endpoint
router.post('/employee/login', async (req, res) => {
    const { employeeEmail } = req.body;
    
    try {
        // Validate email domain
        if (!employeeEmail.endsWith('@adinn.co.in')) {
            return res.status(400).json({ 
                success: false, 
                message: "Only @adinn.co.in emails are allowed" 
            });
        }
        
        // Find employee
        const employee = await Employee.findOne({ employeeEmail });
        if (!employee) {
            return res.status(400).json({ 
                success: false, 
                message: "Employee not found. Please register first." 
            });
        }
        
        // Update last login
        employee.lastLogin = new Date();
        await employee.save();
        
        res.json({
            success: true,
            message: "Login successful",
            employee: {
                employeeName: employee.employeeName,
                employeeEmail: employee.employeeEmail,
                secretCode : employee.secretCode,
                employeeId: employee.employeeId,
                role: employee.role
            }
        });
        
    } catch (err) {
        console.error(err);
        res.status(500).json({ 
            success: false, 
            message: "Server error during login" 
        });
    }
});





// Root endpoint
router.get('/', (req, res) => {
    res.send('Welcome to Employee Authentication API');
});




// // Check if user exists
// router.post('/check-user', async (req, res) => {
//     const { email, phone } = req.body;
//     try {
//         let user;
//         if (email) {
//             user = await User.findOne({ userEmail: email });
//         } else if (phone) {
//             user = await User.findOne({ userPhone: phone });
//         } else {
//             return res.status(400).json({ error: 'Email or phone is required' });
//         }

//         res.json({ exists: !!user });
//     } catch (err) {
//         res.status(500).json({ error: 'Server error' });
//     }
// });

// // Add this new endpoint to your backend
// router.post('/check-user-exists', async (req, res) => {
//     const { email, phone } = req.body;

//     try {
//         const emailExists = email ? await User.findOne({ userEmail: email }) : false;
//         const phoneExists = phone ? await User.findOne({ userPhone: phone }) : false;

//         res.json({
//             emailExists: !!emailExists,
//             phoneExists: !!phoneExists
//         });
//     } catch (err) {
//         res.status(500).json({ error: 'Server error' });
//     }
// });

// // Create new user
// router.post('/create-user', async (req, res) => {
//     const { userName, userEmail, userPhone } = req.body;
//     try {
//         // Validate all required fields
//         if (!userName || !userEmail || !userPhone) {
//             return res.status(400).json({ error: 'All fields are required' });
//         }
//         // if (userEmail) {
//         const existingEmail = await User.findOne({ userEmail });
//         if (existingEmail) {
//             return res.status(400).json({
//                 error: 'Email already registered',
//                 suggestion: 'Try logging in or use a different email'

//             });
//         }
//         const existingPhone = await User.findOne({ userPhone });
//         if (existingPhone) {
//             return res.status(400).json({
//                 error: 'Phone number already registered',
//                 suggestion: 'Try logging in or use a different phone number'

//             });
//         }
//         // Create new user
//         const newUser = new User({
//             userName,
//             userEmail,
//             userPhone
//         });

//         await newUser.save();
//         // Send welcome SMS after successful registration
//         try {
//             const welcomeMessage = "Thank you for registering with Adinn Outdoors. We're glad to have you on board!";
//             const mobileNumber = userPhone.replace(/\D/g, '');
//             const formattedNumber = mobileNumber.length === 10 ? `91${mobileNumber}` : mobileNumber;

//             const welcomeSmsUrl = `https://retailsms.nettyfish.com/api/mt/SendSMS?APIKey=${NETTYFISH_API_KEY}&senderid=${NETTYFISH_SENDER_ID}&channel=Trans&DCS=0&flashsms=0&number=${formattedNumber}&dlttemplateid=1007653370910160293&text=${encodeURIComponent(welcomeMessage)}&route=17`;

//             request(welcomeSmsUrl, { method: 'GET' }, (error, response, body) => {
//                 if (error) {
//                     console.error("Welcome SMS Error:", error);
//                 } else {
//                     console.log("Welcome SMS sent successfully:", body);
//                 }
//             });
//         } catch (smsError) {
//             console.error("Error sending welcome SMS:", smsError);
//             // Don't fail the registration if SMS fails
//         }
//         //Sent welcome mail to the User
//         const transporter = nodemailer.createTransport(
//             {
//                 service: 'gmail',
//                 auth: {
//                     user: 'reactdeveloper@adinn.co.in',
//                     pass: 'gxnn sezu klyp ifhn'
//                 }
//             }
//         );
//         //Welcome Email to user
//         const userMailOptions = {
//             from: 'reactdeveloper@adinn.co.in',
//             to: userEmail,
//             subject: 'Welcome to Adinn - Registration Successful',
//             html: `
//              <div
//         style='font-family: Montserrat; margin: 0 auto; padding:20px; border: 1px solid #ddd; border-radius:5px; width:max-content;'>
//         <center>
//             <img src="https://www.adinnoutdoors.com/wp-content/uploads/2024/04/adinn-outdoor-final-logo.png"
//                 alt="adinn_logo" style="height:auto; width:auto; margin:0 auto;" />
//         </center>

//         <h1 style="color: #333;">Hi ${userName}, Welcome to Adinn Outdoors!</h1>
//         <p style="font-size: 17px;color:black;">You have successfully registered with us. We're glad to have you on board! </p>
//         <h2 style="color: #333; margin-top: 20px;"> Your Registration Details</h2>
//         <ul style="font-size: 17px;">
//             <li><strong>Name: </strong> ${userName}</li>
//             <li><strong>Email: </strong> ${userEmail}</li>
//             <li><strong>Phone: </strong> <a href='tel:${userPhone}'> ${userPhone} </a></li>
//         </ul>
//         <p style="margin-top: 20px;font-size: 17px; color:black;">If you have any questions, Get in touch with us.</p>
//        <div>
//          <a href="https://www.facebook.com/adinnoutdoors/" target="_blank"
//             style="display: inline-block; width: 25px; height: 25px; margin:0px 5px;">
//             <img src="https://cdn-icons-png.flaticon.com/512/124/124010.png" alt="Facebook"
//                 style="width: 100%; height: auto;">
//         </a>
//         <a href="https://www.instagram.com/adinnoutdoor/" target="_blank"
//             style="display: inline-block; width: 25px; height: 25px; margin:0px 5px;">
//             <img src="https://cdn-icons-png.flaticon.com/512/2111/2111463.png" alt="Instagram"
//                 style="width: 100%; height: auto;">
//         </a>
//         <a href="https://www.linkedin.com/showcase/adinn-outdoors/" target="_blank"
//             style="display: inline-block; width: 25px; height: 25px; margin:0px 5px;">
//             <img src="https://cdn-icons-png.flaticon.com/512/174/174857.png" alt="LinkedIn"
//                 style="width: 100%; height: auto;">
//         </a>
//         <a href="https://www.youtube.com/@AdinnChannel" target="_blank"
//             style="display: inline-block; width: 25px; height: 25px; margin:0px 5px;">
//             <img src="https://cdn-icons-png.flaticon.com/512/1384/1384060.png" alt="YouTube"
//                 style="width: 100%; height: auto;">
//         </a>
//         <a href="mailto:reactdeveloper@adinn.co.in" target="_blank"
//             style="display: inline-block; width: 25px; height: 25px; margin:0px 5px;">
//             <img src="https://cdn-icons-png.flaticon.com/512/5968/5968534.png" alt="Gmail"
//                 style="width: 100%; height: auto;">
//         </a>
//        </div>
//     </div> `
//         };
//         const adminMailOptions = {
//             from: 'reactdeveloper@adinn.co.in',
//             to: 'reactdeveloper@adinn.co.in',
//             subject: 'New User Registration on Adinn Site',
//             html: `
// <div style='font-family: Montserrat; margin: 0 auto; padding:20px; border: 1px solid #ddd; border-radius:5px;'> 
// <h2 style="color: #333;">New User Registration</h2>
// <h3 style="color: #333; margin-top: 20px;">User Details : </h3>
// <ul>
// <li><strong>Name: </strong> ${userName}</li>
// <li><strong>Email: </strong> ${userEmail}</li>
// <li><strong>Phone: </strong> ${userPhone}</li>
// <li><strong>Registration Date:</strong> ${new Date().toLocaleString()}</li>
// </ul>
// </div> `
//         };
//         //Sent both emails (don't wait for these to complete)
//         transporter.sendMail(userMailOptions, (error) => {
//             if (error) {
//                 console.error("Error Sending Welcome Mail:", error);
//             }
//         })
//         transporter.sendMail(adminMailOptions, (error) => {
//             if (error) {
//                 console.error("Error Sending admin Mail:", error);
//             }
//         })
//         res.json({
//             success: true,
//             user: {
//                 userName: newUser.userName,
//                 userEmail: newUser.userEmail,
//                 userPhone: newUser.userPhone
//             }
//         });
//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ error: 'Server error' });
//     }
// });

// // Updated Send OTP endpoint with proper Nettyfish integration
// router.post('/send-otp', async (req, res) => {
//     const { email, phone, userName, isSignUp } = req.body;

//     if (!email && !phone) {
//         return res.status(400).json({ success: false, message: "Email or phone is required" });
//     }

//     // Generate 4-digit OTP
//     const otp = Math.floor(1000 + Math.random() * 9000);
//     const otpKey = email || phone;

//     otpStore[otpKey] = {
//         otp,
//         expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes expiry
//         userName: userName || null
//     };

//     if (email) {
//         // Email OTP logic
//         const transporter = nodemailer.createTransport({
//             service: 'gmail',
//             auth: {
//                 user: 'reactdeveloper@adinn.co.in',
//                 pass: 'gxnn sezu klyp ifhn'
//             }
//         });

//         const greetingName = userName || 'User';
//         const mailOptions = {
//             from: 'reactdeveloper@adinn.co.in',
//             to: email,
//             subject: 'Your OTP for Verification',
//             html: `
//                 <div style='font-family: Montserrat; margin: 0 auto; padding:20px; border: 1px solid #ddd; border-radius:5px;width:max-content;'>
//                     <center>
//                         <img src="https://www.adinnoutdoors.com/wp-content/uploads/2024/04/adinn-outdoor-final-logo.png" alt="adinn_logo" style="height:auto; width:auto; margin:0 auto;"/>
//                     </center>
//                     <h2 style="color: #333;">Hi ${greetingName}, Welcome to Adinn Outdoors!</h2>
//                     <div style="color:black; font-size:15px">Your One-Time Password (OTP) for verification : </div>
//                     <p style="font-weight:bold; font-size: 26px; gap:20px;">${otp}</p>
//                     <div style="color:black;font-size:15px">This is valid for 5 minutes</div>
//                 </div>
//             `
//         };
//         transporter.sendMail(mailOptions, (error) => {
//             if (error) {
//                 console.error(error);
//                 return res.status(500).json({ success: false, message: "Failed to send OTP via email" });
//             }
//             res.json({ success: true, message: "OTP sent to email" });
//         });
//     } else if (phone) {
//         // Nettyfish SMS OTP implementation - FIXED
//         try {
//             // Clean the phone number
//             const mobileNumber = phone.replace(/\D/g, '');
//             // Check if number has country code, if not add 91 for India
//             const formattedNumber = mobileNumber.length === 10 ? `91${mobileNumber}` : mobileNumber;
//             // Use the approved DLT template with the OTP variable properly formatted
//             const message = `Welcome to Adinn Outdoors! Your verification code is ${otp}. Use this OTP to complete your verification. Please don't share it with anyone.`;
//             // Construct the API URL with template ID
//             const apiUrl = `https://retailsms.nettyfish.com/api/mt/SendSMS?APIKey=${NETTYFISH_API_KEY}&senderid=${NETTYFISH_SENDER_ID}&channel=Trans&DCS=0&flashsms=0&number=${formattedNumber}&dlttemplateid=${NETTYFISH_TEMPLATE_ID}&text=${encodeURIComponent(message)}&route=17`;
//             console.log("Sending SMS via URL:", apiUrl);

//             // Make the request to Nettyfish API
//             request(apiUrl, { method: 'GET' }, (error, response, body) => {
//                 if (error) {
//                     console.error("Nettyfish API Error:", error);
//                     return res.status(500).json({
//                         success: false,
//                         message: "Failed to send OTP via SMS",
//                         error: error.message
//                     });
//                 }

//                 console.log("Nettyfish API Response:", body);

//                 // Check if the response was successful
//                 if (response.statusCode === 200) {
//                     console.log(`OTP ${otp} sent to ${phone}`);
//                     res.json({ success: true, message: "OTP sent to phone" });
//                 } else {
//                     console.error("Nettyfish API Non-200 Response:", body);
//                     res.status(500).json({
//                         success: false,
//                         message: "SMS gateway returned an error",
//                         apiResponse: body
//                     });
//                 }
//             });
//         } catch (error) {
//             console.error("Error in SMS OTP sending:", error);
//             res.status(500).json({
//                 success: false,
//                 message: "Internal server error while sending SMS OTP",
//                 error: error.message
//             });
//         }
//     }
// });

// // Verify OTP endpoint - FIXED user retrieval
// router.post('/verify-otp', async (req, res) => {
//     const { email, phone, otp } = req.body;
//     const otpKey = email || phone;

//     if (!otpKey || !otp) {
//         return res.status(400).json({ success: false, message: "Email/phone and OTP required" });
//     }

//     const storedData = otpStore[otpKey];

//     if (!storedData || Date.now() > storedData.expiresAt) {
//         return res.status(400).json({ success: false, message: "OTP expired or invalid" });
//     }

//     if (otp.toString() !== storedData.otp.toString()) {
//         return res.status(400).json({ success: false, message: "Invalid OTP" });
//     }
//     delete otpStore[otpKey]; // Clear OTP after verification

//     try {
//         // Find user by email OR phone (whichever was used for OTP)
//         let user;
//         if (email) {
//             user = await User.findOne({ userEmail: email });
//         } else if (phone) {
//             user = await User.findOne({ userPhone: phone });
//         }

//         res.json({
//             success: true,
//             verified: true,
//             user: user || null
//         });

//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ error: 'Server error' });
//     }
// });

module.exports = router;