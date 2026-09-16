// utils/bookingSummaryPdfRenderer.js
require("dotenv").config();
const puppeteer = require("puppeteer");
const uploadToSpaces = require("./uploadToSpaces");

// Mirrors Utils/shortUrl.js's buildRoadshowQuotationLongUrl — fail loudly in
// production instead of silently falling back to localhost:3000, which
// Puppeteer cannot reach from the deployed server and previously made this
// step fail silently (caught by sendCampaignRequestMail's try/catch), so the
// campaign mail went out with no booking summary PDF attached and no visible
// error beyond a console.error buried in the logs.
const frontendBaseUrl = () => {
  const url = process.env.FRONTEND_BASE_URL || "";

  if (!url) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("FRONTEND_BASE_URL is missing in the production environment");
    }
    return "http://localhost:3000";
  }

  return url.replace(/\/$/, "");
};

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

    // The print route disables animations/transitions itself via CSS, but
    // this also stops anything that only responds to the media feature
    // (e.g. autoplay-on-motion) rather than the CSS rules.
    await page.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: "reduce" },
    ]);

    await page.goto(printUrl, { waitUntil: "networkidle0", timeout: 30000 });

    // Explicit readiness signal set by PdfReadySignal.tsx once fonts are
    // loaded and every <img> has settled (loaded or errored) — networkidle0
    // alone is not enough: it can resolve while the root layout's global
    // loader overlay is still visible/fading (client-side timers, not
    // network activity), which is what produced a black "loader" PDF
    // instead of the actual booking summary.
    await page.waitForFunction(
      () => window.__BOOKING_SUMMARY_READY__ === true,
      { timeout: 20000 }
    );

    // Belt-and-suspenders — PdfReadySignal already waits on this, but a
    // slow/blocked font load can theoretically outlast it.
    await page
      .evaluate(() => document.fonts && document.fonts.ready)
      .catch(() => {});

    pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
  } finally {
    if (browser) await browser.close();
  }

  const pdfFile = {
    originalname: `Booking_Summary_${order.orderId}.pdf`,
    mimetype: "application/pdf",
    buffer: pdfBuffer,
  };

  return uploadToSpaces(pdfFile, "Roadshows/bookingsummary");
}

module.exports = { renderAndUploadBookingSummaryPdf };
