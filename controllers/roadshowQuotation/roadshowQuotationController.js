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
  isValidRoadshowQuotationNumber
  
} from "../../Utils/quotationUtils.js";

export const getNextRoadshowQuotationNumber = async (req, res) => {
  try {
    const nextQuotation = await getNextRoadshowQuotationNumberWithoutIncrement();

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

    const quotation = await RoadshowQuotation.create({
      quotationNumber: requestedQuotationNumber,
      quotationDate: dateOnly,
      quotationDateKey: dateKey,
      quotationSequence,

      payloadVersion: payload.payloadVersion || "roadshow-quotation-v1",
      source: payload.source || "roadshow_quotation_generator",
      quotationType: payload.quotationType || "roadshow_campaign",

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

    return res.status(201).json({
      success: true,
      message: "Quotation values saved successfully",
      data: {
        quotationId: quotation._id,
        quotationNumber: quotation.quotationNumber,
        quotationDate: quotation.quotationDate,
        quotationSequence: quotation.quotationSequence,
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

    const safeQuotationNumber = sanitizeFileNamePart(quotation.quotationNumber);

    const requestedFileName = req.body.fileName
      ? sanitizeFileNamePart(req.body.fileName)
      : `${safeCompanyName}-${safeQuotationNumber}`;

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

    quotation.status = "pdf_uploaded";

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
        downloadUrl: publicUrl,
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
      data: quotation,
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

    if (!quotation.pdf?.publicUrl) {
      return res.status(404).json({
        success: false,
        message: "Public PDF URL is not available for this quotation",
      });
    }

    return res.json({
      success: true,
      data: {
        quotationId: quotation._id,
        quotationNumber: quotation.quotationNumber,
        fileName: quotation.pdf.fileName,
        spaceKey: quotation.pdf.spaceKey,
        publicUrl: quotation.pdf.publicUrl,
        cdnUrl: quotation.pdf.cdnUrl,
        downloadUrl: quotation.pdf.publicUrl,
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
          "quotationNumber quotationDate quotationDateKey quotationSequence status clientDetails.companyName clientDetails.clientName clientDetails.contactNumber clientDetails.campaignName preparedByDetails.staffName preparedByDetails.staffPhone campaign.campaignName pdf.status pdf.fileName pdf.publicUrl pdf.cdnUrl pdf.uploadedAt createdAt updatedAt",
        )
        .lean(),

      RoadshowQuotation.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: {
        items,
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