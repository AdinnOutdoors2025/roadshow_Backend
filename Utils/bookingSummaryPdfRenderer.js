// utils/bookingSummaryPdfRenderer.js
require("dotenv").config();
const puppeteer = require("puppeteer");
const uploadToSpaces = require("./uploadToSpaces");

const frontendBaseUrl = () =>
  (process.env.FRONTEND_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

/**
 * Renders the real BookingSummaryDocument.tsx template for `order` by
 * driving a headless browser to the frontend's print-only route
 * (src/app/print-summary/[orderId]/page.tsx), printing that page to PDF,
 * and uploading the result to DigitalOcean Spaces via the existing
 * uploadToSpaces helper. Returns the public CDN URL.
 */
async function renderAndUploadBookingSummaryPdf(order) {
  const printUrl = `${frontendBaseUrl()}/print-summary/${order._id}`;

  let browser;
  let pdfBuffer;

  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.goto(printUrl, { waitUntil: "networkidle0", timeout: 30000 });

    pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
  } finally {
    if (browser) await browser.close();
  }

  const pdfFile = {
    originalname: `Booking_Summary_${order.orderId}.pdf`,
    mimetype: "application/pdf",
    buffer: pdfBuffer,
  };

  return uploadToSpaces(pdfFile, "Roadshows/booking-summaries");
}

module.exports = { renderAndUploadBookingSummaryPdf };
