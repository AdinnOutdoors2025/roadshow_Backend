
// Utils/smsServices.js

import https from "node:https";

const isProduction = () => {
  return String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
};

const shouldSendSms = () => {
  return isProduction() || String(process.env.NETTYFISH_SEND_SMS_IN_DEV || "") === "true";
};

const cleanMobileNumber = (mobileNumber) => {
  return String(mobileNumber || "").replace(/\D/g, "").trim();
};

const formatIndianMobileNumber = (mobileNumber) => {
  const digits = cleanMobileNumber(mobileNumber);

  if (/^[6-9]\d{9}$/.test(digits)) {
    return `91${digits}`;
  }

  if (/^91[6-9]\d{9}$/.test(digits)) {
    return digits;
  }

  return digits;
};

const requestUrl = (url) => {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let responseBody = "";

      res.on("data", (chunk) => {
        responseBody += chunk;
      });

      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          body: responseBody,
        });
      });
    });

    req.on("error", reject);

    req.setTimeout(20000, () => {
      req.destroy(new Error("SMS request timed out"));
    });
  });
};

const parseNettyfishBody = (body = "") => {
  const raw = String(body || "").trim();

  let json = null;

  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }

  return {
    raw,
    json,
  };
};

const isNettyfishSuccess = ({ statusCode, parsedBody }) => {
  if (Number(statusCode) < 200 || Number(statusCode) >= 300) {
    return false;
  }

  const json = parsedBody?.json;

  if (!json) {
    return true;
  }

  const errorCode = String(json.ErrorCode ?? json.errorCode ?? "").trim();
  const errorMessage = String(
    json.ErrorMessage ?? json.errorMessage ?? "",
  )
    .trim()
    .toLowerCase();

  if (errorCode && !["0", "000"].includes(errorCode)) {
    return false;
  }

  if (
    errorMessage &&
    (
      errorMessage.includes("fail") ||
      errorMessage.includes("invalid") ||
      errorMessage.includes("error")
    )
  ) {
    return false;
  }

  return true;
};

const buildRoadshowQuotationSmsMessage = ({
  quotationNumber,
  shortUrl,
}) => {
  /*
    IMPORTANT:
    This SMS text must match your approved DLT template.

    Optional env:
    NETTYFISH_ROADSHOW_MESSAGE_TEMPLATE=Your roadshow quotation {{quotationNumber}} is ready. View here: {{shortUrl}}
  */

  const template = String(
    process.env.NETTYFISH_ROADSHOW_MESSAGE_TEMPLATE || "",
  ).trim();

  if (template) {
    return template
      .replace(/{{quotationNumber}}/g, quotationNumber)
      .replace(/{quotationNumber}/g, quotationNumber)
      .replace(/#QUOTATION_NUMBER#/g, quotationNumber)
      .replace(/{{shortUrl}}/g, shortUrl)
      .replace(/{shortUrl}/g, shortUrl)
      .replace(/#SHORT_URL#/g, shortUrl);
  }

//   return `Your roadshow quotation ${quotationNumber} is ready. View here: ${shortUrl}`;
  return `Welcome to Adinn Outdoors! Your verification code is 123456. Use this OTP to complete your verification. Please don't share it with anyone.`;
};

export const sendOtpSms = async ({
  mobileNumber,
  quotationNumber,
  shortUrl,
}) => {
  if (!mobileNumber || !quotationNumber || !shortUrl) {
    throw new Error(
      "Mobile number, quotation number and short URL are required to send SMS",
    );
  }

  if (!shouldSendSms()) {
    return {
      skipped: true,
      provider: "nettyfish",
      reason: "NODE_ENV is not production. Set NETTYFISH_SEND_SMS_IN_DEV=true to send SMS in local/dev.",
    };
  }

  const NETTYFISH_API_KEY = String(process.env.NETTYFISH_API_KEY || "").trim();
  const NETTYFISH_SENDER_ID = String(process.env.NETTYFISH_SENDER_ID || "").trim();
  const NETTYFISH_TEMPLATE_ID = String(process.env.NETTYFISH_TEMPLATE_ID || "").trim();

  if (!NETTYFISH_API_KEY || !NETTYFISH_SENDER_ID || !NETTYFISH_TEMPLATE_ID) {
    throw new Error(
      "Nettyfish SMS configuration missing. Check NETTYFISH_API_KEY, NETTYFISH_SENDER_ID and NETTYFISH_TEMPLATE_ID",
    );
  }

  const formattedNumber = formatIndianMobileNumber(mobileNumber);

  if (!/^91[6-9]\d{9}$/.test(formattedNumber)) {
    throw new Error("Invalid Indian mobile number for SMS");
  }

  const message = buildRoadshowQuotationSmsMessage({
    quotationNumber,
    shortUrl,
  });

  const baseUrl =
    String(process.env.NETTYFISH_API_URL || "").trim() ||
    "https://retailsms.nettyfish.com/api/mt/SendSMS";

  const params = new URLSearchParams({
    APIKey: NETTYFISH_API_KEY,
    senderid: NETTYFISH_SENDER_ID,
    channel: "Trans",
    DCS: "0",
    flashsms: "0",
    number: formattedNumber,
    dlttemplateid: NETTYFISH_TEMPLATE_ID,
    text: message,
    route: "17",
  });

  const apiUrl = `${baseUrl}?${params.toString()}`;

  // Do not console.log(apiUrl), because it exposes API key.
  console.log("Sending quotation SMS:", {
    provider: "nettyfish",
    number: formattedNumber,
    quotationNumber,
    shortUrl,
  });

  const response = await requestUrl(apiUrl);
  const parsedBody = parseNettyfishBody(response.body);

  const success = isNettyfishSuccess({
    statusCode: response.statusCode,
    parsedBody,
  });

  if (!success) {
    throw new Error(
      `Nettyfish SMS failed with status ${response.statusCode}: ${parsedBody.raw}`,
    );
  }

  const responseJson = parsedBody.json || {};
  const messageData = Array.isArray(responseJson.MessageData)
    ? responseJson.MessageData
    : [];

  return {
    skipped: false,
    provider: "nettyfish",
    statusCode: response.statusCode,
    errorCode: responseJson.ErrorCode || null,
    errorMessage: responseJson.ErrorMessage || null,
    jobId: responseJson.JobId || null,
    messageId: messageData[0]?.MessageId || null,
    number: messageData[0]?.Number || formattedNumber,
    message,
    response: parsedBody.raw,
  };
};

export const sendRoadshowQuotationSms = sendOtpSms;

