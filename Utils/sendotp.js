require('dotenv').config();

const { sendNettyfishSms } = require("./nettyfishSms");

/* Falls back to the pre-existing NETTYFISH_TEMPLATE_ID so this keeps working
   unchanged for deployments that haven't set the new, more specific
   NETTYFISH_OTP_TEMPLATE_ID yet. */
const OTP_TEMPLATE_ID =
  process.env.NETTYFISH_OTP_TEMPLATE_ID || process.env.NETTYFISH_TEMPLATE_ID || "";

/**
 * Sends the registration/login OTP used by controllers/UserController.
 *
 * Routed through the shared Utils/nettyfishSms.js utility (local/production
 * switch via SMS_MODE, phone normalization, consistent console logging, no
 * API-key logging) instead of building the Nettyfish request by hand.
 * Preserves this function's original contract: it resolves in local mode
 * (console-only, matching "OTP shown only in console") and throws if the
 * SMS genuinely fails to send in production — callers here have never
 * wrapped this in their own try/catch, so a production send failure must
 * still surface as an error the way it always has, exactly as before.
 */
const sendOTP = async (mobileNumber, otp) => {
  const message =
    `Welcome to Adinn Outdoors! Your verification code is ${otp}. ` +
    `Use this OTP to complete your verification. Please don't share it with anyone.`;

  const result = await sendNettyfishSms({
    type: "OTP",
    logHeader: "[OTP SMS]",
    phoneNumber: mobileNumber,
    templateId: OTP_TEMPLATE_ID,
    message,
    meta: { OTP: otp },
  });

  if (result.mode === "production" && !result.sent) {
    throw new Error(
      `Nettyfish OTP SMS failed: ${result.reason || JSON.stringify(result.error) || "unknown error"}`
    );
  }

  return result;
};

module.exports = { sendOTP };