// models/RoadshowQuotation.model.js

import mongoose from "mongoose";

const Mixed = mongoose.Schema.Types.Mixed;

const QuoteLineItemSchema = new mongoose.Schema(
  {
    serialNumber: Number,
    label: String,
    description: String,
    rateLabel: String,
    periodLabel: String,
    quantityLabel: String,
    formulaLabel: String,
    amount: {
      type: Number,
      default: 0,
    },
  },
  {
    _id: false,
  },
);

const RoadshowQuotationSchema = new mongoose.Schema(
  {
    quotationNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    quotationDate: {
      type: String,
      required: true,
      index: true,
    },

    quotationDateKey: {
      type: String,
      required: true,
      index: true,
    },

    quotationSequence: {
      type: Number,
      required: true,
    },

    payloadVersion: {
      type: String,
      default: "roadshow-quotation-v1",
    },

    source: {
      type: String,
      default: "roadshow_quotation_generator",
    },

    quotationType: {
      type: String,
      default: "roadshow_campaign",
    },

    status: {
      type: String,
      enum: ["saved", "pdf_uploaded", "failed"],
      default: "saved",
      index: true,
    },

    company: {
      name: String,
      title: String,
      validityDays: Number,
      defaultLogoSrc: String,
      displayLogoSrc: String,
    },

    quotation: {
      draftProposalNumber: String,
      displayedProposalNumber: String,
      proposalDate: Date,
      proposalDateDisplay: String,
      validUntilDate: Date,
      validUntilDateDisplay: String,
      validityDays: Number,
    },

    clientDetails: {
      clientName: {
        type: String,
        default: "",
        trim: true,
      },

      companyName: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },

      contactNumber: {
        type: String,
        default: "",
        trim: true,
      },

      email: {
        type: String,
        default: "",
        trim: true,
        lowercase: true,
      },

      campaignName: {
        type: String,
        default: "",
        trim: true,
      },

      campaignLocation: {
        type: String,
        default: "",
        trim: true,
      },
    },

    preparedByDetails: {
      companyName: {
        type: String,
        default: "",
        trim: true,
      },

      staffName: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },

      staffPhone: {
        type: String,
        required: true,
        trim: true,
      },

      email: {
        type: String,
        default: "",
        trim: true,
        lowercase: true,
      },

      address: {
        type: String,
        default: "",
        trim: true,
      },

      staff: {
        name: {
          type: String,
          default: "",
          trim: true,
        },

        phoneNumber: {
          type: String,
          default: "",
          trim: true,
        },
      },
    },

    campaign: {
      campaignName: String,
      campaignLocation: String,
      region: String,
      regionLabel: String,
      selectedCategory: String,
      selectedVehicleId: String,

      quantity: {
        type: Number,
        default: 1,
      },

      promoterQuantity: {
        type: Number,
        default: 1,
      },

      days: {
        type: Number,
        default: 10,
      },

      kmLimit: {
        type: Number,
        default: 60,
      },

      minimumDays: {
        type: Number,
        default: 10,
      },

      gstPercent: {
        type: Number,
        default: 18,
      },

      rtoPermissionValidityDays: {
        type: Number,
        default: 28,
      },

      rtoBillingMonths: {
        type: Number,
        default: 1,
      },
    },

    vehicle: {
      selectedCategory: String,
      selectedVehicleId: String,
      selectedVehicleSnapshot: Mixed,
    },

    pricing: {
      currency: {
        type: String,
        default: "INR",
      },

      pricingDetails: {
        vehicleRate: {
          type: Number,
          default: 0,
        },

        brandingCost: {
          type: Number,
          default: 0,
        },

        rtoPermission: {
          type: Number,
          default: 0,
        },

        promoterCost: {
          type: Number,
          default: 0,
        },

        ledCost: {
          type: Number,
          default: 0,
        },

        led55Cost: {
          type: Number,
          default: 0,
        },

        powerBackup: {
          type: Number,
          default: 0,
        },

        upDownCharge: {
          type: Number,
          default: 0,
        },
      },

      quoteLineItems: [QuoteLineItemSchema],

      subtotal: {
        type: Number,
        default: 0,
      },

      gstPercent: {
        type: Number,
        default: 18,
      },

      gstAmount: {
        type: Number,
        default: 0,
      },

      grandTotal: {
        type: Number,
        default: 0,
      },

      advancePercent: {
        type: Number,
        default: 50,
      },

      advanceAmount: {
        type: Number,
        default: 0,
      },
    },

    addOns: {
      includePromoter: {
        type: Boolean,
        default: false,
      },

      includeLed: {
        type: Boolean,
        default: false,
      },

      includeLed55: {
        type: Boolean,
        default: false,
      },

      includePowerBackup: {
        type: Boolean,
        default: false,
      },

      selectedAddOns: {
        type: [String],
        default: [],
      },
    },

    assets: {
      logo: {
        isCustomLogoUploaded: {
          type: Boolean,
          default: false,
        },

        defaultLogoSrc: String,
        displayLogoSrc: String,
      },

      signature: {
        hasSignature: {
          type: Boolean,
          default: false,
        },

        signatureCrop: Mixed,
        signatureDataUrl: String,
      },
    },

    termsAndConditions: {
      type: [String],
      default: [],
    },

    pdf: {
      status: {
        type: String,
        enum: ["not_uploaded", "uploaded", "failed"],
        default: "not_uploaded",
      },

      access: {
        type: String,
        enum: ["private", "public"],
        default: "public",
      },

      fileName: String,
      originalFileName: String,

      contentType: {
        type: String,
        default: "application/pdf",
      },

      size: Number,
      bucket: String,
      spaceKey: String,
      region: String,
      endpoint: String,
      cdnUrl: String,
      signedDownloadUrlGeneratedAt: Date,
      uploadedAt: Date,
    },

    rawPayload: Mixed,

    audit: {
      createdFromIp: String,
      userAgent: String,
      lastPdfUploadIp: String,
      lastPdfUploadUserAgent: String,
    },
  },
  {
    timestamps: true,
    minimize: false,
  },
);

const RoadshowQuotation = mongoose.model(
  "RoadshowQuotation",
  RoadshowQuotationSchema,
);

export default RoadshowQuotation;
