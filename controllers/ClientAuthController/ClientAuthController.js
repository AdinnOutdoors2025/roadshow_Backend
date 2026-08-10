const jwt = require("jsonwebtoken");
const axios = require("axios");

const ClientUser = require("../../Models/ClientLoginModel/ClientLoginSchema");
const otpStore = {};

const JWT_SECRET = process.env.JWT_SECRET;
const OTP_MODE = process.env.OTP_MODE;


function generateToken(user) {

    return jwt.sign(
        {
            id: user._id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            userType: user.userType
        },

        JWT_SECRET,
        {
            expiresIn: "7d"
        }

    );

}
// Configuration
const NETTYFISH_API_KEY = process.env.NETTYFISH_API_KEY || 'aspv58uRbkqDbhCcCN87Mw';
const NETTYFISH_SENDER_ID = process.env.NETTYFISH_SENDER_ID || 'ADINAD';
const NETTYFISH_TEMPLATE_ID = process.env.NETTYFISH_TEMPLATE_ID || '1007811523025425787';

// SEND OTP
exports.sendClientOtp = async (req, res) => {
    try {
        const { name, email, phone, mode } = req.body; // mode: "register" or "login"

        if (!phone) {
            return res.status(400).json({ success: false, message: "Phone required" });
        }

        const userExists = await ClientUser.findOne({ phone });
        const emailExists = email ? await ClientUser.findOne({ email }) : null;

        if (mode === "register") {
            // Require all fields for registration
            if (!name || !email) {
                return res.status(400).json({ success: false, message: "Name, Email, and Phone are required for registration" });
            }

            // Check uniqueness
            if (userExists && userExists.phone === phone) {
                return res.status(409).json({ success: false, message: "Phone already exists" });
            }
            if (emailExists && emailExists.email === email) {
                return res.status(409).json({ success: false, message: "Email already exists" });
            }
        }

        if (mode === "login") {
            // Only allow login for existing users
            if (!userExists) {
                return res.status(404).json({ success: false, message: "User not found. Please register first." });
            }
        }

        const otp = Math.floor(100000 + Math.random() * 900000);
        otpStore[phone] = {
            otp,
            expires: Date.now() + 300000, // 5 min
            name,
            email
        };

        if (OTP_MODE === "local") {
            console.log("CLIENT OTP:", phone, otp);
        } else {
            const mobileNumber = phone.replace(/\D/g, "");
            const formattedNumber = mobileNumber.length === 10 ? `91${mobileNumber}` : mobileNumber;
            const message = `Welcome to Adinn Roadshows! : Use ${otp} to verify your mobile number. This OTP is valid for 5 minutes. Please do not share this code. - Adinn`;
            const url = `https://retailsms.nettyfish.com/api/mt/SendSMS?APIKey=${NETTYFISH_API_KEY}&senderid=${NETTYFISH_SENDER_ID}&channel=Trans&DCS=0&flashsms=0&number=${formattedNumber}&dlttemplateid=${NETTYFISH_TEMPLATE_ID}&text=${encodeURIComponent(message)}&route=17`;
            await axios.get(url);
        }
        res.json({ success: true, message: "OTP sent" });

    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, message: "OTP failed" });
    }
};

// VERIFY OTP
exports.verifyClientOtp = async (req, res) => {
    try {
        const { phone, otp } = req.body;

        const saved = otpStore[phone];
        if (!saved || saved.expires < Date.now()) {
            return res.status(400).json({ success: false, message: "OTP expired" });
        }

        if (saved.otp.toString() !== otp.toString()) {
            return res.status(400).json({ success: false, message: "Invalid OTP" });
        }

        delete otpStore[phone];

        let user = await ClientUser.findOne({ phone });

        // If not found and mode was register (name/email stored in OTP), create user
        if (!user) {
            if (!saved.name || !saved.email) {
                return res.status(400).json({ success: false, message: "User does not exist. Please register first." });
            }
            user = await ClientUser.create({
                name: saved.name,
                email: saved.email,
                phone,
                userType: 2
            });
        }

        const token = generateToken(user);
        res.json({
            success: true,
            token,
            user
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, message: "Verification failed" });
    }
};