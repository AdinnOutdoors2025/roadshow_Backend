// controllers/roadshowQuotation.controller.js

import mongoose from "mongoose";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import RoadshowQuotation from "../../Models/RoadshowQuotationModel.js";
import {
  spacesClient,
  DO_SPACES_BUCKET,
  DO_SPACES_REGION,
  DO_SPACES_ENDPOINT,
} from "../../config/digitalOceanSpaces.js";
import {
  getCurrentIndiaDateParts,
  sanitizeFileNamePart,
  getPublicPdfUrl,
  generateRoadshowQuotationNumber,
  getNextRoadshowQuotationNumberWithoutIncrement,
  normalizeRoadshowQuotationNumber,
  isValidRoadshowQuotationNumber,
} from "../../Utils/quotationUtils.js";
import {
  createRoadshowQuotationShortUrl,
  shortenAnyUrl,
} from "../../Utils/shortUrl.js";

import { sendOtpSms } from "../../Utils/smsServices.js";
//EMAIL ADDED 
import axios from "axios";
//EMAIL ADDED 
const ROADSHOW_APPROVAL_PASSWORD =
  process.env.ROADSHOW_QUOTATION_APPROVAL_PASSWORD || "Adinn@#123";

const ALLOWED_ROADSHOW_QUOTATION_STATUSES = new Set([
  "saved",
  "pdf_uploaded",
  "waiting_for_approval",
  "approved",
  "failed",
]);

const normalizeRoadshowQuotationStatus = (value = "") => {
  const status = String(value || "").trim();

  return ALLOWED_ROADSHOW_QUOTATION_STATUSES.has(status) ? status : "saved";
};

const sanitizeWaitingApprovalQuotationForResponse = (quotation) => {
  if (!quotation) return quotation;

  const data =
    typeof quotation.toObject === "function"
      ? quotation.toObject()
      : { ...quotation };

  if (data.status === "waiting_for_approval" && data.pdf) {
    data.pdf = {
      ...data.pdf,
      publicUrl: undefined,
      cdnUrl: undefined,
      downloadUrl: undefined,
    };
  }

  return data;
};

//EMAIL ADDED 
// const ROADSHOW_RATECARD_MAIL_API_URL =
//   process.env.ROADSHOW_RATECARD_MAIL_API_URL ||
//   "https://adinndigital.com/api/roadshow_rateCard/index_roadshowQuotationApproval.php";

// const ROADSHOW_APPROVAL_MAIL_TO =
//   process.env.ROADSHOW_APPROVAL_MAIL_TO || "reactdeveloper@adinn.co.in";

// const ROADSHOW_APPROVAL_MAIL_CC =
//   process.env.ROADSHOW_APPROVAL_MAIL_CC || "smm@adinn.co.in";

// const normalizeEmailCsv = (value = "") =>
//   String(value || "")
//     .split(",")
//     .map((email) => email.trim())
//     .filter(Boolean);

// const buildFrontendQuotationUrl = (quotationNumber = "") => {
//   const frontendBaseUrl = process.env.FRONTEND_BASE_URL || "";

//   if (!frontendBaseUrl || !quotationNumber) return "";

//   return `${frontendBaseUrl.replace(
//     /\/$/,
//     "",
//   )}/roadshow-quotations?qn=${encodeURIComponent(quotationNumber)}`;
// };

// const sendRoadshowQuotationApprovalMail = async ({
//   quotation,
//   pdfUrl = "",
//   pdfShortUrl = "",
// }) => {
//   if (!quotation) return null;

//   const quotationObject =
//     typeof quotation.toObject === "function"
//       ? quotation.toObject()
//       : quotation;

//   const rawPayload = quotationObject.rawPayload || {};

//   const sourcePayload =
//     rawPayload && Object.keys(rawPayload).length > 0
//       ? rawPayload
//       : quotationObject;

//   const quotationNumber =
//     quotationObject.quotationNumber ||
//     sourcePayload.quotationNumber ||
//     sourcePayload?.quotation?.displayedProposalNumber ||
//     "";

//   const quotationUrl = buildFrontendQuotationUrl(quotationNumber);

//   const finalPdfUrl =
//     pdfUrl ||
//     quotationObject?.pdf?.publicUrl ||
//     sourcePayload?.pdf?.publicUrl ||
//     "";

//   const mailData = {
//     ...sourcePayload,

//     quotationId: String(quotationObject._id || sourcePayload.quotationId || ""),
//     quotationNumber,
//     status: quotationObject.status || sourcePayload.status || "waiting_for_approval",

//     quotation: sourcePayload.quotation || quotationObject.quotation || {},
//     clientDetails: sourcePayload.clientDetails || quotationObject.clientDetails || {},
//     preparedByDetails:
//       sourcePayload.preparedByDetails || quotationObject.preparedByDetails || {},
//     campaign: sourcePayload.campaign || quotationObject.campaign || {},
//     vehicle: sourcePayload.vehicle || quotationObject.vehicle || {},
//     pricing: sourcePayload.pricing || quotationObject.pricing || {},
//     addOns: sourcePayload.addOns || quotationObject.addOns || {},
//     approval: sourcePayload.approval || quotationObject.approval || {},

//     urls: {
//       approvalUrl: quotationUrl,
//       quotationUrl,
//       pdfUrl: finalPdfUrl,
//       pdfShortUrl: "",
//       downloadUrl: finalPdfUrl,
//     },
//   };

//   console.log("Roadshow approval mail API URL:", ROADSHOW_RATECARD_MAIL_API_URL);
//   console.log("Roadshow approval mail TO:", ROADSHOW_APPROVAL_MAIL_TO);
//   console.log("Roadshow approval mail CC:", ROADSHOW_APPROVAL_MAIL_CC);

//   console.log("Roadshow mail clientDetails:", mailData.clientDetails);
//   console.log("Roadshow mail campaign:", mailData.campaign);
//   console.log("Roadshow mail vehicle:", {
//     name: mailData?.vehicle?.selectedVehicleSnapshot?.name,
//     category: mailData?.vehicle?.selectedCategory,
//   });
//   console.log("Roadshow mail pricing:", {
//     vehicleRate: mailData?.pricing?.pricingDetails?.vehicleRate,
//     vehicleDiscountAmount: mailData?.pricing?.pricingDetails?.vehicleDiscountAmount,
//     vehicleFinalRate: mailData?.pricing?.pricingDetails?.vehicleFinalRate,
//     brandingCostDiscount:
//       mailData?.pricing?.pricingDetails?.brandingCostDiscount,
//     rtoPermissionDiscount:
//       mailData?.pricing?.pricingDetails?.rtoPermissionDiscount,
//     totalDiscountAmount: mailData?.pricing?.totalDiscountAmount,
//     grandTotal: mailData?.pricing?.grandTotal,
//   });

// const mailPayload = {
//   mailtype: "roadshow_quotationApproval",
//   testOnly: true,
//   to: normalizeEmailCsv(ROADSHOW_APPROVAL_MAIL_TO),
//   cc: normalizeEmailCsv(ROADSHOW_APPROVAL_MAIL_CC),
//   data: mailData,
// };

//   const response = await axios.post(
//     ROADSHOW_RATECARD_MAIL_API_URL,
//     mailPayload,
//     {
//       headers: {
//         "Content-Type": "application/json",
//       },
//       timeout: 20000,
//     },
//   );

//   return response.data;
// };

const ROADSHOW_RATECARD_MAIL_API_URL =
  process.env.ROADSHOW_RATECARD_MAIL_API_URL ||
  "https://adinndigital.com/api/roadshow_rateCard/index_roadshowQuotationApproval.php";

const ROADSHOW_APPROVAL_MAIL_TO =
  process.env.ROADSHOW_APPROVAL_MAIL_TO || "reactdeveloper@adinn.co.in";

const ROADSHOW_APPROVAL_MAIL_CC =
  process.env.ROADSHOW_APPROVAL_MAIL_CC || "smm@adinn.co.in";

const ROADSHOW_APPROVAL_MAIL_TEST_ONLY =
  String(process.env.ROADSHOW_APPROVAL_MAIL_TEST_ONLY || "false").toLowerCase() ===
  "true";

const normalizeEmailCsv = (value = "") =>
  String(value || "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

const FRONTEND_BASE_URL =
  process.env.FRONTEND_BASE_URL ||
  "http://localhost:3000";

const buildFrontendQuotationUrl = (quotationNumber = "") => {
  const baseUrl = String(FRONTEND_BASE_URL || "").trim();
  const qn = String(quotationNumber || "").trim();

  if (!baseUrl || !qn) return "";

  return `${baseUrl.replace(/\/+$/, "")}/roadshow-quotations?qn=${encodeURIComponent(
    qn,
  )}`;
};
const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const getPlainQuotation = (quotation) => {
  if (!quotation) return {};
  return typeof quotation.toObject === "function"
    ? quotation.toObject()
    : quotation;
};

const buildApprovalMailData = ({ quotation, pdfUrl = "", pdfShortUrl = "" }) => {
  const quotationObject = getPlainQuotation(quotation);

  const rawPayload =
    quotationObject.rawPayload && Object.keys(quotationObject.rawPayload).length > 0
      ? quotationObject.rawPayload
      : quotationObject;

  const quotationNumber =
    quotationObject.quotationNumber ||
    rawPayload.quotationNumber ||
    rawPayload?.quotation?.displayedProposalNumber ||
    "";

  const quotationUrl = buildFrontendQuotationUrl(quotationNumber);

  const clientDetails =
    rawPayload.clientDetails || quotationObject.clientDetails || {};

  const preparedByDetails =
    rawPayload.preparedByDetails || quotationObject.preparedByDetails || {};

  const campaign = rawPayload.campaign || quotationObject.campaign || {};
  const vehicle = rawPayload.vehicle || quotationObject.vehicle || {};
  const pricing = rawPayload.pricing || quotationObject.pricing || {};
  const pricingDetails = pricing.pricingDetails || {};

  const selectedVehicleSnapshot =
    vehicle.selectedVehicleSnapshot ||
    vehicle.selectedVehicleVariantSnapshot ||
    {};

  const vehicleName =
    selectedVehicleSnapshot.name ||
    vehicle.name ||
    campaign.selectedVehicleName ||
    "";

  const variantLabel =
    campaign.selectedVehicleVariantLabel ||
    vehicle.variantLabel ||
    selectedVehicleSnapshot.variantLabel ||
    "";

  const finalPdfUrl =
    pdfShortUrl ||
    pdfUrl ||
    quotationObject?.pdf?.publicUrl ||
    quotationObject?.pdf?.cdnUrl ||
    "";

  return {
    quotationId: String(quotationObject._id || rawPayload.quotationId || ""),
    quotationNumber,
    status: "waiting_for_approval",

    clientDetails: {
      companyName: clientDetails.companyName || "",
      clientName: clientDetails.clientName || "",
      contactNumber: clientDetails.contactNumber || "",
      email: clientDetails.email || "",
      campaignName:
        clientDetails.campaignName || campaign.campaignName || "",
      campaignLocation:
        clientDetails.campaignLocation || campaign.campaignLocation || "",
    },

    preparedByDetails: {
      staffName:
        preparedByDetails.staffName ||
        preparedByDetails?.staff?.name ||
        "",
      staffPhone:
        preparedByDetails.staffPhone ||
        preparedByDetails?.staff?.phoneNumber ||
        "",
      email: preparedByDetails.email || "",
    },

    campaign: {
      selectedCategory: campaign.selectedCategory || vehicle.selectedCategory || "",
      selectedVehicleVariantLabel: variantLabel,
      regionLabel: campaign.regionLabel || "",
      quantity: campaign.quantity || "",
      days: campaign.days || "",
      kmLimit: campaign.kmLimit || campaign.selectedVehicleVariantKmPerDay || "",
      rtoBillingMonths: campaign.rtoBillingMonths || "",
    },

    vehicle: {
      // Keep both shapes so PHP can read either old or new format.
      name: vehicleName,
      category: campaign.selectedCategory || vehicle.selectedCategory || "",
      variantLabel,
      selectedVehicleSnapshot: {
        name: vehicleName,
      },
    },

    pricing: {
      pricingDetails: {
        vehicleRate: toNumber(pricingDetails.vehicleRate),
        vehicleFinalRate: toNumber(pricingDetails.vehicleFinalRate),
        vehicleDiscountAmount: toNumber(pricingDetails.vehicleDiscountAmount),

        brandingCost: toNumber(pricingDetails.brandingCost),
        brandingCostDiscount: toNumber(pricingDetails.brandingCostDiscount),

        rtoPermission: toNumber(pricingDetails.rtoPermission),
        rtoPermissionDiscount: toNumber(pricingDetails.rtoPermissionDiscount),
      },

      actualSubtotal: toNumber(pricing.actualSubtotal),
      totalDiscountAmount: toNumber(pricing.totalDiscountAmount),
      subtotal: toNumber(pricing.subtotal),
      gstPercent: toNumber(pricing.gstPercent, 18),
      gstAmount: toNumber(pricing.gstAmount),
      grandTotal: toNumber(pricing.grandTotal),
      advanceAmount: toNumber(pricing.advanceAmount),

      quoteLineItems: Array.isArray(pricing.quoteLineItems)
        ? pricing.quoteLineItems.slice(0, 20).map((item, index) => ({
          serialNumber: item.serialNumber || index + 1,
          label: item.label || "",
          description: item.description || "",
          rateLabel: item.rateLabel || "",
          periodLabel: item.periodLabel || "",
          quantityLabel: item.quantityLabel || "",
          formulaLabel: item.formulaLabel || "",
          amount: toNumber(item.amount),
        }))
        : [],
    },

    urls: {
      approvalUrl: quotationUrl,
      quotationUrl,
      // pdfUrl: finalPdfUrl,
      // downloadUrl: finalPdfUrl,
       pdfUrl: "",
  downloadUrl: "",
    },
  };
};

const sendRoadshowQuotationApprovalMail = async ({
  quotation,
  pdfUrl = "",
  pdfShortUrl = "",
}) => {
  if (!quotation) return null;

  const mailData = buildApprovalMailData({
    quotation,
    pdfUrl,
    pdfShortUrl,
  });

  if (!mailData.quotationNumber) {
    throw new Error("Quotation number is missing for approval mail.");
  }

  if (!mailData.clientDetails.companyName) {
    throw new Error("Client company name is missing for approval mail.");
  }

  const mailPayload = {
    mailtype: "roadshow_quotationApproval",
    testOnly: ROADSHOW_APPROVAL_MAIL_TEST_ONLY,
    to: normalizeEmailCsv(ROADSHOW_APPROVAL_MAIL_TO),
    cc: normalizeEmailCsv(ROADSHOW_APPROVAL_MAIL_CC),
    data: mailData,
  };
console.log(
  "Roadshow approval mail payload:",
  JSON.stringify(mailPayload, null, 2),
);
  const response = await axios.post(
    ROADSHOW_RATECARD_MAIL_API_URL,
    mailPayload,
    {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
      timeout: 30000,
      validateStatus: () => true,
    },
  );

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      response.data?.message ||
      response.data?.error ||
      `Approval mail API failed with HTTP ${response.status}`,
    );
  }

  if (response.data?.status !== "success") {
    throw new Error(
      response.data?.message ||
      response.data?.error ||
      "Approval mail API returned non-success response",
    );
  }

  return response.data;
  console.log("Approval mail raw response:", response.status, JSON.stringify(response.data));
};


//EMAIL ADDED 
export const getNextRoadshowQuotationNumber = async (req, res) => {
  try {
    const nextQuotation =
      await getNextRoadshowQuotationNumberWithoutIncrement();

    return res.json({
      success: true,
      data: nextQuotation,
    });
  } catch (error) {
    console.error("Get next quotation number error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to get next quotation number",
      error: error.message,
    });
  }
};

export const createRoadshowQuotation = async (req, res) => {
  try {
    const payload = req.body;
    let smsResponse = null;
    const clientCompanyName = payload?.clientDetails?.companyName?.trim();
    const staffName = payload?.preparedByDetails?.staffName?.trim();
    const staffPhone = payload?.preparedByDetails?.staffPhone?.trim();

    if (!clientCompanyName) {
      return res.status(400).json({
        success: false,
        message: "Client company name is required",
      });
    }

    if (!staffName || !staffPhone) {
      return res.status(400).json({
        success: false,
        message: "Staff name and staff phone number are required",
      });
    }

    const requestedQuotationNumber = normalizeRoadshowQuotationNumber(
      payload?.quotationNumber ||
      payload?.quotation?.displayedProposalNumber ||
      "",
    );

    if (!requestedQuotationNumber) {
      return res.status(400).json({
        success: false,
        message:
          "Quotation number is required. Please refresh and generate a quotation number.",
      });
    }

    if (!isValidRoadshowQuotationNumber(requestedQuotationNumber)) {
      return res.status(400).json({
        success: false,
        message: "Invalid quotation number format. Expected format: EST-30001",
      });
    }

    const existingQuotation = await RoadshowQuotation.exists({
      quotationNumber: requestedQuotationNumber,
    });

    if (existingQuotation) {
      return res.status(409).json({
        success: false,
        message:
          "Quotation number already exists. Please refresh and try again.",
      });
    }

    const { dateOnly, dateKey } = getCurrentIndiaDateParts();

    const quotationSequence = Number(
      requestedQuotationNumber.replace("EST-", ""),
    );

    const requestedStatus = normalizeRoadshowQuotationStatus(payload?.status);
    const requestedApproval = payload?.approval || {};
    const approvalRequired = Boolean(
      requestedApproval?.required ||
      payload?.pricing?.pricingDetails?.approvalRequired ||
      requestedStatus === "waiting_for_approval",
    );

    const quotation = await RoadshowQuotation.create({
      quotationNumber: requestedQuotationNumber,
      quotationDate: dateOnly,
      quotationDateKey: dateKey,
      quotationSequence,

      payloadVersion: payload.payloadVersion || "roadshow-quotation-v1",
      source: payload.source || "roadshow_quotation_generator",
      quotationType: payload.quotationType || "roadshow_campaign",
      status: requestedStatus,

      company: payload.company || {},

      quotation: {
        ...(payload.quotation || {}),
        displayedProposalNumber: requestedQuotationNumber,
      },

      clientDetails: payload.clientDetails || {},

      preparedByDetails: {
        ...(payload.preparedByDetails || {}),
        staff: {
          name:
            payload?.preparedByDetails?.staff?.name ||
            payload?.preparedByDetails?.staffName ||
            "",
          phoneNumber:
            payload?.preparedByDetails?.staff?.phoneNumber ||
            payload?.preparedByDetails?.staffPhone ||
            "",
        },
      },

      campaign: payload.campaign || {},
      vehicle: payload.vehicle || {},
      pricing: payload.pricing || {},
      addOns: payload.addOns || {},
      assets: payload.assets || {},
      termsAndConditions: payload.termsAndConditions || [],

      approval: {
        required: approvalRequired,
        status: approvalRequired ? "waiting_for_approval" : "not_required",
        requestedAt: approvalRequired
          ? requestedApproval?.requestedAt || new Date()
          : undefined,
        requestedBy: payload?.preparedByDetails?.staffName || "",
        approvedAt: undefined,
        approvedBy: "",
      },

      rawPayload: {
        ...payload,
        quotationNumber: requestedQuotationNumber,
        quotation: {
          ...(payload.quotation || {}),
          displayedProposalNumber: requestedQuotationNumber,
        },
      },

      audit: {
        createdFromIp: req.ip,
        userAgent: req.get("user-agent") || "",
      },
    });

    // let quotationShortUrl = "";
    // let quotationLongUrl = "";
    // let shortUrlError = "";

    // try {
    //   const shortUrlResult = await createRoadshowQuotationShortUrl({
    //     quotationNumber: quotation.quotationNumber,
    //     quotationId: quotation._id,
    //   });

    //   quotationShortUrl = shortUrlResult.shortUrl;
    //   quotationLongUrl = shortUrlResult.longUrl;

    //   if (quotationShortUrl) {
    //     quotation.shortUrl = {
    //       provider: shortUrlResult.provider || "is.gd",
    //       shortUrl: quotationShortUrl,
    //       longUrl: quotationLongUrl,
    //       code: shortUrlResult.code || "",
    //       createdAt: new Date(),
    //     };

    //     await quotation.save();

    //     const smsResult = await sendOtpSms({
    //       mobileNumber: process.env.ADMIN_PHONE_NUMBER,
    //       quotationNumber: quotation.quotationNumber,
    //       shortUrl: quotationShortUrl,
    //     });

    //     smsResponse = smsResult.response || null;
    //   }
    // } catch (urlError) {
    //   shortUrlError =
    //     urlError instanceof Error
    //       ? urlError.message
    //       : "Unable to create short URL";

    //   console.error("Roadshow short URL error:", urlError);
    // }

    const quotationShortUrl = "";
    const quotationLongUrl = buildFrontendQuotationUrl(quotation.quotationNumber);
    const shortUrlError = "Short URL disabled";
    smsResponse = null;

    return res.status(201).json({
      success: true,
      message: "Quotation values saved successfully",
      data: {
        quotationId: quotation._id,
        quotationNumber: quotation.quotationNumber,
        quotationDate: quotation.quotationDate,
        quotationSequence: quotation.quotationSequence,
        shortUrl: quotationShortUrl,
        longUrl: quotationLongUrl,
        smsStatus: smsResponse,
        shortUrlError,
      },
    });
  } catch (error) {
    console.error("Create roadshow quotation error:", error);

    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "Quotation number already exists. Please refresh and try again.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to save quotation values",
      error: error.message,
    });
  }
};

export const uploadRoadshowQuotationPdf = async (req, res) => {
  try {
    const { quotationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(quotationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid quotation id",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "PDF file is required",
      });
    }

    const quotation = await RoadshowQuotation.findById(quotationId);

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: "Quotation not found",
      });
    }

    const safeCompanyName = sanitizeFileNamePart(
      quotation.clientDetails?.companyName || "client",
    );

    const requestedFileName = req.body.fileName
      ? sanitizeFileNamePart(req.body.fileName)
      : `${safeCompanyName}-${quotation.quotationNumber}`;

    const finalFileName = `${requestedFileName}.pdf`;

    const safeQuotationFolder = sanitizeFileNamePart(quotation.quotationNumber);

    const spaceKey = `roadshow/quotations/${quotation.quotationDateKey}/${safeQuotationFolder}/${finalFileName}`;

    await spacesClient.send(
      new PutObjectCommand({
        Bucket: DO_SPACES_BUCKET,
        Key: spaceKey,
        Body: req.file.buffer,
        ContentType: "application/pdf",
        ACL: "public-read",
        Metadata: {
          quotationId: String(quotation._id),
          quotationNumber: String(quotation.quotationNumber),
          clientCompanyName: String(quotation.clientDetails?.companyName || ""),
          staffName: String(quotation.preparedByDetails?.staffName || ""),
          staffPhone: String(quotation.preparedByDetails?.staffPhone || ""),
        },
      }),
    );

    const publicUrl = getPublicPdfUrl(spaceKey);

    // let pdfShortUrl = "";
    // let pdfShortUrlError = "";
    // let pdfShortUrlData = undefined;

    // try {
    //   const pdfShortUrlResult = await shortenAnyUrl(publicUrl);

    //   pdfShortUrl = pdfShortUrlResult.shortUrl;

    //   pdfShortUrlData = {
    //     provider: pdfShortUrlResult.provider || "is.gd",
    //     shortUrl: pdfShortUrlResult.shortUrl,
    //     longUrl: pdfShortUrlResult.longUrl,
    //     code: pdfShortUrlResult.code || "",
    //     createdAt: new Date(),
    //   };
    // } catch (urlError) {
    //   pdfShortUrlError =
    //     urlError instanceof Error
    //       ? urlError.message
    //       : "Unable to create PDF short URL";

    //   console.error("PDF short URL error:", urlError);
    // }


    const pdfShortUrl = "";
    const pdfShortUrlError = "Short URL disabled";
    const pdfShortUrlData = undefined;

    if (
      !["waiting_for_approval", "approved"].includes(
        String(quotation.status || ""),
      )
    ) {
      quotation.status = "pdf_uploaded";
    }

    quotation.pdf = {
      status: "uploaded",
      access: "public",
      fileName: finalFileName,
      originalFileName: req.file.originalname,
      contentType: req.file.mimetype,
      size: req.file.size,
      bucket: DO_SPACES_BUCKET,
      spaceKey,
      region: DO_SPACES_REGION,
      endpoint: DO_SPACES_ENDPOINT,
      publicUrl,
      cdnUrl: publicUrl,
      shortUrl: pdfShortUrlData,
      uploadedAt: new Date(),
    };

    quotation.audit = {
      ...(quotation.audit || {}),
      lastPdfUploadIp: req.ip,
      lastPdfUploadUserAgent: req.get("user-agent") || "",
    };
    //EMAIL ADDED 

    // await quotation.save();

    // return res.json({
    //   success: true,
    //   message: "Quotation PDF uploaded publicly successfully",
    //   data: {
    //     quotationId: quotation._id,
    //     quotationNumber: quotation.quotationNumber,
    //     fileName: finalFileName,
    //     bucket: DO_SPACES_BUCKET,
    //     spaceKey,

    //     publicUrl,
    //     cdnUrl: publicUrl,

    //     pdfShortUrl,
    //     pdfLongUrl: publicUrl,
    //     downloadUrl: pdfShortUrl || publicUrl,
    //     pdfShortUrlError,
    //   },
    // });

   await quotation.save();

let approvalMailStatus = null;
let approvalMailError = "";

if (
  String(quotation.status || "") === "waiting_for_approval" &&
  quotation.approval?.required
) {
  try {
    approvalMailStatus = await sendRoadshowQuotationApprovalMail({
      quotation,
      pdfUrl: publicUrl,
      pdfShortUrl,
    });
  } catch (mailError) {
    approvalMailError =
      mailError?.response?.data?.message ||
      mailError?.response?.data?.error ||
      mailError?.message ||
      "Unable to send approval mail";

    console.error("Roadshow approval mail error:", approvalMailError);
  }
}

return res.json({
  success: true,
  message: "Quotation PDF uploaded publicly successfully",
  data: {
    quotationId: quotation._id,
    quotationNumber: quotation.quotationNumber,
    fileName: finalFileName,
    bucket: DO_SPACES_BUCKET,
    spaceKey,

    publicUrl,
    cdnUrl: publicUrl,

    pdfShortUrl,
    pdfLongUrl: publicUrl,
    downloadUrl: pdfShortUrl || publicUrl,
    pdfShortUrlError,

    approvalMailStatus,
    approvalMailError,
  },
});

    // return res.json({
    //   success: true,
    //   message: "Quotation PDF uploaded publicly successfully",
    //   data: {
    //     quotationId: quotation._id,
    //     quotationNumber: quotation.quotationNumber,
    //     fileName: finalFileName,
    //     bucket: DO_SPACES_BUCKET,
    //     spaceKey,

    //     publicUrl,
    //     cdnUrl: publicUrl,

    //     pdfShortUrl,
    //     pdfLongUrl: publicUrl,
    //     downloadUrl: pdfShortUrl || publicUrl,
    //     pdfShortUrlError,

    //     approvalMailStatus,
    //     approvalMailError,
    //   },
    // });

    //EMAIL ADDED 
  } catch (error) {
    console.error("Upload roadshow quotation PDF error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to upload quotation PDF",
      error: error.message,
    });
  }
};

export const getRoadshowQuotationById = async (req, res) => {
  try {
    const { quotationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(quotationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid quotation id",
      });
    }

    const quotation = await RoadshowQuotation.findById(quotationId);

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: "Quotation not found",
      });
    }

    return res.json({
      success: true,
      data: sanitizeWaitingApprovalQuotationForResponse(quotation),
    });
  } catch (error) {
    console.error("Get roadshow quotation error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch quotation",
      error: error.message,
    });
  }
};

export const getRoadshowQuotationDownloadUrl = async (req, res) => {
  try {
    const { quotationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(quotationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid quotation id",
      });
    }

    const quotation = await RoadshowQuotation.findById(quotationId);

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: "Quotation not found",
      });
    }

    if (quotation.status === "waiting_for_approval") {
      return res.status(403).json({
        success: false,
        message: "PDF download is available only after admin approval",
      });
    }

    if (!quotation.pdf?.publicUrl) {
      return res.status(404).json({
        success: false,
        message: "Public PDF URL is not available for this quotation",
      });
    }

    const pdfLongUrl = quotation.pdf.publicUrl;
    const pdfShortUrl = quotation.pdf?.shortUrl?.shortUrl || "";

    return res.json({
      success: true,
      data: {
        quotationId: quotation._id,
        quotationNumber: quotation.quotationNumber,
        fileName: quotation.pdf.fileName,
        spaceKey: quotation.pdf.spaceKey,

        publicUrl: pdfLongUrl,
        cdnUrl: quotation.pdf.cdnUrl,

        pdfShortUrl,
        pdfLongUrl,
        downloadUrl: pdfShortUrl || pdfLongUrl,
      },
    });
  } catch (error) {
    console.error("Get quotation public url error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to get public PDF URL",
      error: error.message,
    });
  }
};

export const approveRoadshowQuotation = async (req, res) => {
  try {
    const { quotationId } = req.params;
    const { password } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(quotationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid quotation id",
      });
    }

    if (String(password || "") !== ROADSHOW_APPROVAL_PASSWORD) {
      return res.status(401).json({
        success: false,
        message: "Invalid approval password",
      });
    }

    const quotation = await RoadshowQuotation.findById(quotationId);

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: "Quotation not found",
      });
    }

    if (quotation.status !== "waiting_for_approval") {
      return res.status(400).json({
        success: false,
        message: "Only waiting for approval quotations can be approved",
      });
    }

    // let quotationShortUrl = quotation.shortUrl?.shortUrl || "";
    // let quotationLongUrl = quotation.shortUrl?.longUrl || "";
    // let quotationUrlError = "";

    // if (!quotationShortUrl) {
    //   try {
    //     const shortUrlResult = await createRoadshowQuotationShortUrl({
    //       quotationNumber: quotation.quotationNumber,
    //       quotationId: quotation._id,
    //     });

    //     quotationShortUrl = shortUrlResult.shortUrl || "";
    //     quotationLongUrl = shortUrlResult.longUrl || "";

    //     if (quotationShortUrl) {
    //       quotation.shortUrl = {
    //         provider: shortUrlResult.provider || "is.gd",
    //         shortUrl: quotationShortUrl,
    //         longUrl: quotationLongUrl,
    //         code: shortUrlResult.code || "",
    //         createdAt: new Date(),
    //       };
    //     }
    //   } catch (urlError) {
    //     quotationUrlError =
    //       urlError instanceof Error
    //         ? urlError.message
    //         : "Unable to create quotation URL";

    //     console.error("Approve quotation URL error:", urlError);
    //   }
    // }


    const quotationShortUrl = "";
    const quotationLongUrl = buildFrontendQuotationUrl(quotation.quotationNumber);
    const quotationUrlError = "Short URL disabled";

    const pdfLongUrl = quotation.pdf?.publicUrl || "";
    let pdfShortUrl = quotation.pdf?.shortUrl?.shortUrl || "";
    let pdfShortUrlError = "";

    if (!pdfLongUrl) {
      pdfShortUrlError = "PDF is not uploaded yet";
    }

    if (pdfLongUrl && !pdfShortUrl) {
      try {
        const pdfShortUrlResult = await shortenAnyUrl(pdfLongUrl);

        pdfShortUrl = pdfShortUrlResult.shortUrl;

        quotation.pdf = {
          ...(quotation.pdf || {}),
          shortUrl: {
            provider: pdfShortUrlResult.provider || "is.gd",
            shortUrl: pdfShortUrlResult.shortUrl,
            longUrl: pdfShortUrlResult.longUrl,
            code: pdfShortUrlResult.code || "",
            createdAt: new Date(),
          },
        };
      } catch (urlError) {
        pdfShortUrlError =
          urlError instanceof Error
            ? urlError.message
            : "Unable to create PDF short URL";

        console.error("Approve PDF short URL error:", urlError);
      }
    }

    quotation.status = "approved";
    quotation.approval = {
      ...(quotation.approval || {}),
      required: true,
      status: "approved",
      approvedAt: new Date(),
      approvedBy: req.get("x-admin-name") || "Admin",
    };

    await quotation.save();
    ////////////////send sms///////////////
    // const smsResult = await sendOtpSms({
    //   mobileNumber: process.env.ADMIN_PHONE_NUMBER,
    //   quotationNumber: quotation.quotationNumber,
    //   shortUrl: quotationShortUrl,
    // });
    ////////////////send sms///////////////

    return res.json({
      success: true,
      message: "Quotation approved successfully",
      data: {
        quotationId: quotation._id,
        quotationNumber: quotation.quotationNumber,
        status: quotation.status,
        approval: quotation.approval,

        // quotationUrl: quotationShortUrl || quotationLongUrl,
        // shortUrl: quotationShortUrl,
        // longUrl: quotationLongUrl,
        // quotationUrlError,

        // pdfUrl: pdfShortUrl || pdfLongUrl,
        // pdfShortUrl,
        // pdfLongUrl,
        // downloadUrl: pdfShortUrl || pdfLongUrl,
        // pdfShortUrlError,

        quotationUrl: quotationLongUrl,
        shortUrl: "",
        longUrl: quotationLongUrl,
        quotationUrlError,

        pdfUrl: pdfLongUrl,
        pdfShortUrl: "",
        pdfLongUrl,
        downloadUrl: pdfLongUrl,
        pdfShortUrlError,
      },
    });
  } catch (error) {
    console.error("Approve roadshow quotation error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to approve quotation",
      error: error.message,
    });
  }
};
export const listRoadshowQuotations = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 100);
    const skip = (page - 1) * limit;

    const search = String(req.query.search || "").trim();

    const filter = {};

    if (search) {
      filter.$or = [
        {
          quotationNumber: {
            $regex: search,
            $options: "i",
          },
        },
        {
          "clientDetails.companyName": {
            $regex: search,
            $options: "i",
          },
        },
        {
          "clientDetails.campaignName": {
            $regex: search,
            $options: "i",
          },
        },
        {
          "clientDetails.clientName": {
            $regex: search,
            $options: "i",
          },
        },
        {
          "preparedByDetails.staffName": {
            $regex: search,
            $options: "i",
          },
        },
        {
          "preparedByDetails.staffPhone": {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    const [items, total] = await Promise.all([
      RoadshowQuotation.find(filter)
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .select(
          "quotationNumber quotationDate quotationDateKey quotationSequence status clientDetails.companyName clientDetails.clientName clientDetails.contactNumber clientDetails.campaignName preparedByDetails.staffName preparedByDetails.staffPhone campaign.campaignName pricing.totalDiscountAmount pricing.grandTotal pricing.pricingDetails.brandingCostDiscount pricing.pricingDetails.rtoPermissionDiscount approval shortUrl pdf.status pdf.fileName pdf.publicUrl pdf.cdnUrl pdf.shortUrl pdf.uploadedAt createdAt updatedAt",
        )
        .lean(),

      RoadshowQuotation.countDocuments(filter),
    ]);

    const sanitizedItems = items.map(
      sanitizeWaitingApprovalQuotationForResponse,
    );

    return res.json({
      success: true,
      data: {
        items: sanitizedItems,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(Math.ceil(total / limit), 1),
        },
      },
    });
  } catch (error) {
    console.error("List roadshow quotations error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch quotations",
      error: error.message,
    });
  }
};
