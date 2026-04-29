const User  = require("../../Models/User/user");
const OTP   = require("../../Models/otp/otpmodel");
const jwt   = require("jsonwebtoken");
const { sendOTP } = require("../../Utils/sendotp");

const JWT_SECRET    = process.env.JWT_SECRET    || "roadshow_secret_key";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const OTP_EXPIRY_MIN = 30; // OTP valid for 5 minutes

// ── Generate 6-digit OTP ──────────────────────────────────────────────────────
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

// ── Generate JWT ──────────────────────────────────────────────────────────────
const generateToken = (userId) =>
  jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });


// POST /register

const register = async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Name is required" });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ success: false, message: "Phone number is required" });
    }

    // Check phone duplicate
    const phoneExists = await User.findOne({ phone: phone.trim() });
    if (phoneExists) {
      // If already registered but not verified — resend OTP
      if (!phoneExists.isVerified) {
        const otp = generateOTP();
        await OTP.deleteMany({ phone: phone.trim() }); // clear old OTPs
        await OTP.create({
          phone: phone.trim(),
          otp,
          expiresAt: new Date(Date.now() + OTP_EXPIRY_MIN * 60 * 1000),
        });
        await sendOTP(phone.trim(), otp);
        return res.status(200).json({
          success: true,
          message: "OTP resent. Please verify your phone number.",
          phone: phone.trim(),
        });
      }
      return res.status(409).json({ success: false, message: "Phone number is already registered" });
    }

    // Check email duplicate (if provided)
    if (email && email.trim()) {
      const emailExists = await User.findOne({ email: email.toLowerCase().trim() });
      if (emailExists) {
        return res.status(409).json({ success: false, message: "Email is already registered" });
      }
    }

    // Create user (isVerified = false until OTP confirmed)
    const user = await User.create({
      name:  name.trim(),
      phone: phone.trim(),
      email: email ? email.toLowerCase().trim() : undefined,
      isVerified: false,
    });

    // Generate & save OTP
    const otp = generateOTP();
    await OTP.create({
      phone: phone.trim(),
      otp,
      expiresAt: new Date(Date.now() + OTP_EXPIRY_MIN * 60 * 1000),
    });

    // Send OTP via Nettyfish
    await sendOTP(phone.trim(), otp);

    return res.status(201).json({
      success: true,
      message: `OTP sent to ${phone.trim()}. Please verify to complete registration.`,
      phone: phone.trim(),
    });

  } catch (error) {
    if (error.name === "ValidationError") {
      const msg = Object.values(error.errors).map((e) => e.message)[0];
      return res.status(400).json({ success: false, message: msg });
    }
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(409).json({ success: false, message: `${field} already exists` });
    }
    console.error("Register Error:", error);
    return res.status(500).json({ success: false, message: "Server error during registration" });
  }
};


// POST /api/user/verify-otp

const verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: "Phone and OTP are required" });
    }

    // Find latest OTP for this phone
    const otpRecord = await OTP.findOne({ phone: phone.trim() }).sort({ createdAt: -1 });

    if (!otpRecord) {
      return res.status(400).json({ success: false, message: "OTP not found. Please register again." });
    }

    // Check expiry
    if (otpRecord.expiresAt < new Date()) {
      await OTP.deleteMany({ phone: phone.trim() });
      return res.status(400).json({ success: false, message: "OTP expired. Please request a new one." });
    }

    // Match OTP
    if (otpRecord.otp !== otp.trim()) {
      return res.status(400).json({ success: false, message: "Invalid OTP. Please try again." });
    }

    // Mark user as verified
    const user = await User.findOneAndUpdate(
      { phone: phone.trim() },
      { isVerified: true },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Delete used OTP
    await OTP.deleteMany({ phone: phone.trim() });

    // Issue JWT
    const token = generateToken(user._id);

    return res.status(200).json({
      success: true,
      message: "Phone verified successfully. Registration complete!",
      token,
      user: {
        id:        user._id,
        name:      user.name,
        email:     user.email || null,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
      },
    });

  } catch (error) {
    console.error("verifyOtp Error:", error);
    return res.status(500).json({ success: false, message: "Server error during OTP verification" });
  }
};


// POST /api/user/login

const login = async (req, res) => {
  try {
    const { name, phone, email } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Name is required" });
    }
    if (!phone && !email) {
      return res.status(400).json({ success: false, message: "Provide phone number or email" });
    }

    // Find user
    let user = null;
    if (phone && phone.trim()) {
      user = await User.findOne({ phone: phone.trim() });
    } else if (email && email.trim()) {
      user = await User.findOne({ email: email.toLowerCase().trim() });
    }

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found. Please register first." });
    }

    // Verify name matches
    if (user.name.toLowerCase() !== name.trim().toLowerCase()) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // Must be verified
    if (!user.isVerified) {
      return res.status(403).json({ success: false, message: "Phone not verified. Please complete registration." });
    }

    // Generate & send OTP
    const otp = generateOTP();
    await OTP.deleteMany({ phone: user.phone }); // clear old login OTPs
    await OTP.create({
      phone: user.phone,
      otp,
      expiresAt: new Date(Date.now() + OTP_EXPIRY_MIN * 60 * 1000),
    });

    await sendOTP(user.phone, otp);

    return res.status(200).json({
      success: true,
      message: `OTP sent to your registered phone. Please verify to login.`,
      phone: user.phone,
    });

  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({ success: false, message: "Server error during login" });
  }
};


// POST /api/user/login-verify

const loginVerifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: "Phone and OTP are required" });
    }

    const otpRecord = await OTP.findOne({ phone: phone.trim() }).sort({ createdAt: -1 });

    if (!otpRecord) {
      return res.status(400).json({ success: false, message: "OTP not found. Please login again." });
    }

    if (otpRecord.expiresAt < new Date()) {
      await OTP.deleteMany({ phone: phone.trim() });
      return res.status(400).json({ success: false, message: "OTP expired. Please login again." });
    }

    if (otpRecord.otp !== otp.trim()) {
      return res.status(400).json({ success: false, message: "Invalid OTP. Please try again." });
    }

    const user = await User.findOne({ phone: phone.trim() });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Delete used OTP
    await OTP.deleteMany({ phone: phone.trim() });

    const token = generateToken(user._id);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id:    user._id,
        name:  user.name,
        email: user.email || null,
        isVerified: user.isVerified,
      },
    });

  } catch (error) {
    console.error("loginVerifyOtp Error:", error);
    return res.status(500).json({ success: false, message: "Server error during login verification" });
  }
};


// GET /api/user/getUser

const getUsers = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    return res.status(200).json({
      success: true,
      user: {
        id:        user._id,
        name:      user.name,
        email:     user.email || null,
        phone:     user.phone,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    console.error("getUser Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};


// POST /api/user/resend-otp

const resendOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || !phone.trim()) {
      return res.status(400).json({ success: false, message: "Phone number is required" });
    }

    const user = await User.findOne({ phone: phone.trim() });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found. Please register first." });
    }

    const otp = generateOTP();
    await OTP.deleteMany({ phone: phone.trim() });
    await OTP.create({
      phone: phone.trim(),
      otp,
      expiresAt: new Date(Date.now() + OTP_EXPIRY_MIN * 60 * 1000),
    });

    await sendOTP(phone.trim(), otp);

    return res.status(200).json({
      success: true,
      message: "OTP resent successfully",
      phone: phone.trim(),
    });

  } catch (error) {
    console.error("resendOtp Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = { register, verifyOtp, login, loginVerifyOtp, getUsers, resendOtp };