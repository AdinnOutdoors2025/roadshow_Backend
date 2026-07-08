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

    let quotationShortUrl = "";
    let quotationLongUrl = "";
    let shortUrlError = "";

    try {
      const shortUrlResult = await createRoadshowQuotationShortUrl({
        quotationNumber: quotation.quotationNumber,
        quotationId: quotation._id,
      });

      quotationShortUrl = shortUrlResult.shortUrl;
      quotationLongUrl = shortUrlResult.longUrl;

      if (quotationShortUrl) {
        quotation.shortUrl = {
          provider: shortUrlResult.provider || "is.gd",
          shortUrl: quotationShortUrl,
          longUrl: quotationLongUrl,
          code: shortUrlResult.code || "",
          createdAt: new Date(),
        };

        await quotation.save();

        const smsResult = await sendOtpSms({
          mobileNumber: process.env.ADMIN_PHONE_NUMBER,
          quotationNumber: quotation.quotationNumber,
          shortUrl: quotationShortUrl,
        });

        smsResponse = smsResult.response || null;
      }
    } catch (urlError) {
      shortUrlError =
        urlError instanceof Error
          ? urlError.message
          : "Unable to create short URL";

      console.error("Roadshow short URL error:", urlError);
    }

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

    let pdfShortUrl = "";
    let pdfShortUrlError = "";
    let pdfShortUrlData = undefined;

    try {
      const pdfShortUrlResult = await shortenAnyUrl(publicUrl);

      pdfShortUrl = pdfShortUrlResult.shortUrl;

      pdfShortUrlData = {
        provider: pdfShortUrlResult.provider || "is.gd",
        shortUrl: pdfShortUrlResult.shortUrl,
        longUrl: pdfShortUrlResult.longUrl,
        code: pdfShortUrlResult.code || "",
        createdAt: new Date(),
      };
    } catch (urlError) {
      pdfShortUrlError =
        urlError instanceof Error
          ? urlError.message
          : "Unable to create PDF short URL";

      console.error("PDF short URL error:", urlError);
    }

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

    await quotation.save();

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
      },
    });
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

    let quotationShortUrl = quotation.shortUrl?.shortUrl || "";
    let quotationLongUrl = quotation.shortUrl?.longUrl || "";
    let quotationUrlError = "";

    if (!quotationShortUrl) {
      try {
        const shortUrlResult = await createRoadshowQuotationShortUrl({
          quotationNumber: quotation.quotationNumber,
          quotationId: quotation._id,
        });

        quotationShortUrl = shortUrlResult.shortUrl || "";
        quotationLongUrl = shortUrlResult.longUrl || "";

        if (quotationShortUrl) {
          quotation.shortUrl = {
            provider: shortUrlResult.provider || "is.gd",
            shortUrl: quotationShortUrl,
            longUrl: quotationLongUrl,
            code: shortUrlResult.code || "",
            createdAt: new Date(),
          };
        }
      } catch (urlError) {
        quotationUrlError =
          urlError instanceof Error
            ? urlError.message
            : "Unable to create quotation URL";

        console.error("Approve quotation URL error:", urlError);
      }
    }

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
    const smsResult = await sendOtpSms({
      mobileNumber: process.env.ADMIN_PHONE_NUMBER,
      quotationNumber: quotation.quotationNumber,
      shortUrl: quotationShortUrl,
    });
    ////////////////send sms///////////////

    return res.json({
      success: true,
      message: "Quotation approved successfully",
      data: {
        quotationId: quotation._id,
        quotationNumber: quotation.quotationNumber,
        status: quotation.status,
        approval: quotation.approval,

        quotationUrl: quotationShortUrl || quotationLongUrl,
        shortUrl: quotationShortUrl,
        longUrl: quotationLongUrl,
        quotationUrlError,

        pdfUrl: pdfShortUrl || pdfLongUrl,
        pdfShortUrl,
        pdfLongUrl,
        downloadUrl: pdfShortUrl || pdfLongUrl,
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
