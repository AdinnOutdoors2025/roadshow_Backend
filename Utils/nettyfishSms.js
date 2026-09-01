// Utils/nettyfishSms.js
/* -------------------------------------------------------------------------- */
/*                    SHARED NETTYFISH SMS UTILITY                            */
/* -------------------------------------------------------------------------- */
/*  One place that knows how to normalize an Indian mobile number, decide      */
/*  local-vs-production, print a consistent console record, and call the      */
/*  Nettyfish SendSMS API. Every SMS send in this backend (order-created       */
/*  notifications, OTP) goes through sendNettyfishSms() rather than each       */
/*  call site building its own axios request — see Utils/orderSms.js and      */
/*  Utils/sendotp.js.                                                         */
/*                                                                            */
/*  Never throws for an ordinary send failure (bad number, Nettyfish error,   */
/*  missing API key, timeout) — it always resolves with a structured result   */
/*  so a caller decides for itself whether that failure should be fatal (OTP  */
/*  delivery, where the endpoint may need to fail) or non-fatal (order        */
/*  notifications, which must never roll back an already-saved order). Only   */
/*  a genuine programmer error (missing type/message) throws.                 */

require("dotenv").config();
const axios = require("axios");

const DEFAULT_BASE_URL = "https://retailsms.nettyfish.com/api/mt/SendSMS";
const DEFAULT_ROUTE = "17";

/**
 * Accepts "9876543210", "+919876543210" or "919876543210" and returns the
 * canonical "91XXXXXXXXXX" form Nettyfish expects, or null when the value
 * isn't a plausible Indian mobile number — callers must skip rather than
 * send a malformed request.
 */
function normalizeIndianMobile(rawNumber) {
  const digits = String(rawNumber || "").replace(/\D/g, "");

  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return digits;

  return null;
}

/** "local" unless SMS_MODE is exactly "production" — an unset/misspelled
 *  value fails safe to local rather than silently sending real SMS. */
function currentSmsMode() {
  const mode = String(process.env.SMS_MODE || "").trim().toLowerCase();
  return mode === "production" ? "production" : "local";
}

function printSmsLog({ logHeader, phoneLabel, meta, templateId, message, mode }) {
  console.log(logHeader);
  console.log(`Phone: ${phoneLabel}`);

  Object.entries(meta || {}).forEach(([key, value]) => {
    console.log(`${key}: ${value}`);
  });

  console.log(`Template ID: ${templateId || "(none)"}`);
  console.log(`Message: ${message}`);
  console.log(`SMS Mode: ${mode}`);
}

/**
 * Sends one SMS to one phone number, or — in local mode — only logs what
 * would have been sent.
 *
 * @param {object} opts
 * @param {string} opts.type          Short label for logs/results, e.g. "ORDER_ADMIN" | "ORDER_USER" | "OTP".
 * @param {string} [opts.logHeader]   Console header line, defaults to `[SMS <type>]`.
 * @param {string} opts.phoneNumber   Raw or already-normalized Indian mobile number.
 * @param {string} [opts.templateId]  Approved DLT template id for this message.
 * @param {string} opts.message       Exact final SMS text (must already match the DLT wording).
 * @param {object} [opts.meta]        Extra ordered fields to print (e.g. { OTP: 123456 }).
 * @param {"local"|"production"} [opts.mode]  Overrides SMS_MODE for this call — used by
 *   ClientAuthController's OTP flow, which has its own independent OTP_MODE switch.
 *
 * @returns {Promise<{skipped:boolean, sent:boolean, mode:string, type:string,
 *   phoneNumber:string, normalizedPhone:string|null, templateId:string,
 *   message:string, reason?:string, response?:any, error?:any}>}
 */
async function sendNettyfishSms({
  type,
  logHeader,
  phoneNumber,
  templateId = "",
  message,
  meta = {},
  mode,
}) {
  if (!type || !message) {
    throw new Error("sendNettyfishSms requires both type and message");
  }

  const effectiveMode = mode === "local" || mode === "production" ? mode : currentSmsMode();
  const normalizedNumber = normalizeIndianMobile(phoneNumber);
  const header = logHeader || `[SMS ${type}]`;

  const base = {
    type,
    phoneNumber,
    normalizedPhone: normalizedNumber,
    templateId,
    message,
    mode: effectiveMode,
  };

  if (!normalizedNumber) {
    console.warn(`${header} Skipped — invalid/unrecognized phone number: ${phoneNumber}`);
    return { skipped: true, sent: false, reason: "invalid_phone", ...base };
  }

  printSmsLog({
    logHeader: header,
    phoneLabel: normalizedNumber,
    meta,
    templateId,
    message,
    mode: effectiveMode,
  });

  if (effectiveMode !== "production") {
    console.log("SMS sent: false");
    return { skipped: false, sent: false, ...base };
  }

  // API key is read here, only for the live call, and is never logged —
  // printSmsLog() above never receives it.
  const apiKey = String(process.env.NETTYFISH_API_KEY || "").trim();
  const senderId = String(process.env.NETTYFISH_SENDER_ID || "ADINAD").trim();
  const baseUrl = String(process.env.NETTYFISH_BASE_URL || "").trim() || DEFAULT_BASE_URL;
  const route = String(process.env.NETTYFISH_ROUTE || "").trim() || DEFAULT_ROUTE;

  if (!apiKey) {
    console.error(`${header} Configuration error — NETTYFISH_API_KEY is not set. SMS not sent.`);
    console.log("SMS sent: false");
    return { skipped: false, sent: false, error: "missing_api_key", ...base };
  }

  try {
    const response = await axios.get(baseUrl, {
      params: {
        APIKey: apiKey,
        senderid: senderId,
        channel: "Trans",
        DCS: "0",
        flashsms: "0",
        number: normalizedNumber,
        dlttemplateid: templateId,
        text: message,
        route,
      },
      timeout: 15000,
    });

    console.log("SMS sent: true");
    console.log("Provider response:", response.data);

    return { skipped: false, sent: true, response: response.data, ...base };
  } catch (error) {
    const errorPayload = error.response?.data || error.message;

    console.log("SMS sent: false");
    console.error(`${header} Nettyfish request failed:`, errorPayload);

    return { skipped: false, sent: false, error: errorPayload, ...base };
  }
}

module.exports = {
  sendNettyfishSms,
  normalizeIndianMobile,
  currentSmsMode,
};
