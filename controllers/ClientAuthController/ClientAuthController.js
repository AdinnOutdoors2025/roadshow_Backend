const jwt = require("jsonwebtoken");
const axios = require("axios");

const ClientUser = require("../../Models/ClientLoginModel/ClientLoginSchema");
const GstDetail = require("../../Models/GstDetailsModel/gstdetails");
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
            userType: user.userType,
            accountType: user.accountType || "individual",
            gstDetailId: user.gstDetailId ? String(user.gstDetailId._id || user.gstDetailId) : null
        },

        JWT_SECRET,
        {
            expiresIn: "7d"
        }

    );

}

/**
 * Shape a ClientUser (with gstDetailId optionally populated) for the client.
 * Agencies get a flat `business` object so the frontend never has to know
 * whether the reference was populated.
 */
function shapeClientUser(user) {
    const plain = user.toObject ? user.toObject() : { ...user };
    const gst = plain.gstDetailId;
    const isPopulated = gst && typeof gst === "object" && gst.gst_number;

    return {
        ...plain,
        userType: plain.userType || 2,
        accountType: plain.accountType || "individual",
        gstDetailId: gst ? String(isPopulated ? gst._id : gst) : null,
        business: isPopulated
            ? {
                gst_number: gst.gst_number,
                business_name: gst.business_name,
                business_pan: gst.business_pan,
                business_address: gst.business_address,
                business_entity_type: gst.business_entity_type,
                business_registration_type: gst.business_registration_type,
                business_registration_date: gst.business_registration_date,
                business_department_code: gst.business_department_code,
                nature_of_business: gst.nature_of_business,
                status: gst.status
            }
            : null
    };
}

/**
 * Resolve the GST record an agency signup claims, by id or number.
 * Never trusts the client-supplied business details — only the stored record
 * counts, so a forged payload cannot invent a company.
 */
async function resolveAgencyGst({ gstDetailId, gstNumber }) {
    let record = null;

    if (gstDetailId && require("mongoose").Types.ObjectId.isValid(gstDetailId)) {
        record = await GstDetail.findById(gstDetailId);
    }

    if (!record && gstNumber) {
        record = await GstDetail.findOne({
            gst_number: String(gstNumber).trim().toUpperCase()
        });
    }

    return record;
}
// Configuration
const NETTYFISH_API_KEY = process.env.NETTYFISH_API_KEY || 'aspv58uRbkqDbhCcCN87Mw';
const NETTYFISH_SENDER_ID = process.env.NETTYFISH_SENDER_ID || 'ADINAD';
const NETTYFISH_TEMPLATE_ID = process.env.NETTYFISH_TEMPLATE_ID || '1007811523025425787';

// SEND OTP
exports.sendClientOtp = async (req, res) => {
    try {
        // mode: "register" or "login"
        const { name, email, phone, mode, accountType, gstNumber, gstDetailId } = req.body;

        if (!phone) {
            return res.status(400).json({ success: false, message: "Phone required" });
        }

        const userExists = await ClientUser.findOne({ phone });
        const emailExists = email ? await ClientUser.findOne({ email }) : null;

        const requestedAccountType = accountType === "agency" ? "agency" : "individual";
        let agencyGst = null;

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

            /* An agency's identity is its GST registration — verify it exists
               here rather than trusting whatever the browser posted. */
            if (requestedAccountType === "agency") {
                agencyGst = await resolveAgencyGst({ gstDetailId, gstNumber });

                if (!agencyGst) {
                    return res.status(400).json({
                        success: false,
                        message: "A verified GST number is required for an agency account"
                    });
                }

                if (agencyGst.status && agencyGst.status !== "Active") {
                    return res.status(400).json({
                        success: false,
                        message: `This GST registration is "${agencyGst.status}". An Active GSTIN is required.`
                    });
                }
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
            email,
            /* Carried across the OTP round-trip — the user record is only
               created at verify time, so this is where the agency identity
               has to survive. */
            accountType: mode === "register" ? requestedAccountType : undefined,
            gstDetailId: agencyGst ? agencyGst._id : null
        };

        if (OTP_MODE === "local") {
            console.log("CLIENT OTP:", phone, otp);
        } else {
            const mobileNumber = phone.replace(/\D/g, "");
            const formattedNumber = mobileNumber.length === 10 ? `91${mobileNumber}` : mobileNumber;
            const message = `Welcome to Adinn Roadshows! : Use ${otp} to verify your mobile number. This OTP is valid for 5 minutes. Please do not share this code. - Adinn`;
            const url = `https://retailsms.nettyfish.com/api/mt/SendSMS?APIKey=${NETTYFISH_API_KEY}&senderid=${NETTYFISH_SENDER_ID}&channel=Trans&DCS=0&flashsms=0&number=${formattedNumber}&dlttemplateid=${NETTYFISH_TEMPLATE_ID}&text=${encodeURIComponent(message)}&route=17`;
            const smsResponse = await axios.get(url);
            console.log("Nettyfish CLIENT SMS response:", smsResponse.data);
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
                userType: 2,
                accountType: saved.accountType || "individual",
                gstDetailId: saved.gstDetailId || null
            });
        }

        /* Business details are read live from GstDetail rather than copied,
           so a corrected GST record is reflected on the next login. */
        await user.populate("gstDetailId");

        const token = generateToken(user);
        res.json({
            success: true,
            token,
            user: shapeClientUser(user)
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, message: "Verification failed" });
    }
};