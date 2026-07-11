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
const NETTYFISH_TEMPLATE_ID = process.env.NETTYFISH_TEMPLATE_ID || '1007403395830327066';


// SEND OTP
exports.sendClientOtp = async (req, res) => {
    try {
        const { name, email, phone } = req.body;
        if (!phone || !email || !name) {
            return res.status(400).json({
                success: false,
                message: "Name Email Phone required"
            });
        }

        const otp = Math.floor(100000 + Math.random() * 900000);
        otpStore[phone] = { otp, expires: Date.now() + 300000, name, email };
        if (OTP_MODE === "local") {
            console.log("====================");
            console.log("CLIENT OTP");
            console.log(phone);
            console.log(otp);
            console.log("====================");
        }

        else {
            const mobileNumber = phone.replace(/\D/g, '');
            // Check if number has country code, if not add 91 for India
            const formattedNumber = mobileNumber.length === 10 ? `91${mobileNumber}` : mobileNumber;
            const message = `Welcome to Adinn Outdoors! Your verification code is ${otp}. Use this OTP to complete your verification. Please don't share it with anyone.`;
            const url = `https://retailsms.nettyfish.com/api/mt/SendSMS?APIKey=${NETTYFISH_API_KEY}&senderid=${NETTYFISH_SENDER_ID}&channel=Trans&DCS=0&flashsms=0&number=${formattedNumber}&dlttemplateid=${NETTYFISH_TEMPLATE_ID}&text=${encodeURIComponent(message)}&route=17`;

            // const url =
            //     `https://retailsms.nettyfish.com/api/mt/SendSMS?APIKey=${process.env.NETTYFISH_API_KEY}&senderid=${process.env.NETTYFISH_SENDER_ID}&channel=Trans&DCS=0&flashsms=0&number=91${phone}&dlttemplateid=${process.env.NETTYFISH_TEMPLATE_ID}&text=${encodeURIComponent(message)}&route=17`;
            await axios.get(url);
        }
        res.json({
            success: true,
            message: "OTP sent"
        });
    }
    catch (err) {
        console.log(err);
        res.status(500).json({
            success: false,
            message: "OTP failed"
        });
    }
};


// VERIFY OTP
exports.verifyClientOtp = async (req, res) => {
    try {
        const { phone, otp } = req.body;

        const saved = otpStore[phone];
        if (!saved)
            return res.status(400).json({
                success: false,
                message: "OTP expired"
            });



        if (saved.expires < Date.now())
            return res.status(400).json({
                success: false,
                message: "OTP expired"
            });

        if (saved.otp.toString() !== otp.toString())
            return res.status(400).json({
                success: false,
                message: "Invalid OTP"
            });

        delete otpStore[phone];
        let user = await ClientUser.findOne({ phone });



        if (!user) {
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
    }
    catch (err) {
        console.log(err);
        res.status(500).json({
            success: false
        });
    }
};