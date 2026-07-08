
require("dotenv").config();
const axios = require("axios");
const AdminUser = require("../Models/MainLoginSchema");

const FOC_MAIL_API_URL = "https://adinndigital.com/api/roadshows/index.php";

function buildDocumentUrl(documentPath) {
  if (!documentPath) return "";
  if (documentPath.startsWith("http")) return documentPath;
  const base = (process.env.APP_BASE_URL || "http://localhost:5000").replace(/\/$/, "");
  return `${base}${documentPath.startsWith("/") ? documentPath : `/${documentPath}`}`;
}

function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toISOString().split("T")[0]; // YYYY-MM-DD
}

async function getActiveAdminEmails() {
  const admins = await AdminUser.find({ role: "admin", status: "active" }).select("email");
  return admins.map((a) => a.email).filter(Boolean);
}

async function getEmailByUsername(username) {
  if (!username) return "";
  const user = await AdminUser.findOne({ username }).select("email");
  return user?.email || "";
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

async function sendFocMail({ status, reason, fromDate, toDate, documentPath, description, toEmail, ccEmail }) {
  const toArr = toArray(toEmail);
  const ccArr = toArray(ccEmail);

  if (toArr.length === 0) {
    throw new Error("FOC mail: no recipient (toEmail) resolved — aborting");
  }

  
  const primaryTo = toArr[0];
  const overflowToCc = toArr.slice(1);
  const finalCcArr = Array.from(new Set([...ccArr, ...overflowToCc]));

  const payload = {
    mailtype: "roadshowFOC",
    status,
    reason: reason || "",
    fromDate: fmtDate(fromDate),
    toDate: fmtDate(toDate),
    documentUrl: buildDocumentUrl(documentPath),
    description: description || "",
    toEmail: primaryTo,  
    ccEmail: finalCcArr, 
  };

  console.log("payload",payload)

  let response;
  try {
    response = await axios.post(process.env.EXTERNAL_API_URL, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
    });
  } catch (err) {
    throw new Error(`FOC mail API request failed: ${err?.response?.data?.message || err.message}`);
  } 

  const data = response.data;
  if (!data || data.status !== "success") {
    throw new Error(`FOC mail API did not confirm success: ${data?.message || "unknown error"}`);
  }

  return data;
}

module.exports = { sendFocMail, getActiveAdminEmails, getEmailByUsername, buildDocumentUrl };