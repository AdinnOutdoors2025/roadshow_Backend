

const mongoose = require('mongoose');


const vehicleTypeQuantitySchema = new mongoose.Schema(
  {
    vehicleId: {
      type: String,
      trim: true,
      default: "",
    },
    vehicleType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VehicleType",
      required: true,
    },
    vehicleName: {
      type: String,
      trim: true,
      default: "",
    },

    /* The package this line was priced from. Optional with a null default,
       so a request from any caller that does not send it still validates
       exactly as before — but when it IS sent, the Order raised alongside
       the request can read every rate from the package server-side rather
       than trusting the browser's numbers. */
    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Package",
      default: null,
    },
    vehicleModel: {
      type: String,
      trim: true,
      default: "",
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    campaignLocation: {
      type: String,
      trim: true,
      default: "",
    },
    fromDate: {
      type: Date,
      required: true,
    },
    toDate: {
      type: Date,
      required: true,
    },
    totalDays: {
      type: Number,
      default: 0,
      min: 1,
    },
    pricePerDay: {
      type: Number,
      default: 0,
      min: 0,
    },
    lineTotal: {
      type: Number,
      default: 0,
      min: 0,
    },

    /* ── Per-vehicle campaign details ──────────────────────────────────────
       Captured by the public Campaign Details step. Every field is optional
       with a neutral default, so a request created before this step existed
       — or by any caller that does not send them — still validates and
       still saves exactly as it did before. Nothing above this block
       changed. */

    campaignType: {
      type: String,
      trim: true,
      default: "",
    },
    /* What was typed when campaignType is "Others" */
    otherCampaignType: {
      type: String,
      trim: true,
      default: "",
    },
    campaignName: {
      type: String,
      trim: true,
      default: "",
    },

    needPromoter: {
      type: Boolean,
      default: false,
    },
    promoterType: {
      type: String,
      trim: true,
      default: "",
    },
    /* What was typed when promoterType is "Other" */
    otherPromoterType: {
      type: String,
      trim: true,
      default: "",
    },
    promoterGender: {
      type: String,
      trim: true,
      default: "",
    },
    promoterLanguage: {
      type: [String],
      default: [],
    },
    promoterQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    /* Snapshot of the rate used, so a later change to the configured
       promoter charge cannot silently re-price a submitted request. */
    promoterChargePerDay: {
      type: Number,
      default: 0,
      min: 0,
    },
    promoterCost: {
      type: Number,
      default: 0,
      min: 0,
    },

    /* lineTotal above is the full line; these break it down */
    rentalCost: {
      type: Number,
      default: 0,
      min: 0,
    },
    rtoCost: {
      type: Number,
      default: 0,
      min: 0,
    },

    /* Resolved upload URLs — same shape admin orders store */
    campaignImages: {
      type: [String],
      default: [],
    },
    campaignVideos: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

const clientRequestSchema = new mongoose.Schema(
  {
    clientOrderId: {
      type: String,
      unique: true,
      required: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: false,
      trim: true,
      lowercase: true,
      validate: {
        validator(value) {
          if (!value) return true;
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        },
        message: (props) => `${props.value} is not a valid email address!`,
      },
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator(value) {
          return String(value || "").replace(/\D/g, "").length === 10;
        },
        message: (props) => `${props.value} is not a valid 10-digit phone number!`,
      },
    },
    /* The customer who placed this request.
       ref was "User", but public sign-in issues its token for a ClientUser
       (Models/ClientLoginModel) — two different collections. The id stored
       here has always been a ClientUser id, so every populate("userId") was
       silently resolving to null, and any ownership check built on it would
       have passed for everyone. Pointing it at the right model is what makes
       "is this booking yours?" answerable at all. */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClientUser",
      required: true,
    },

    /* ── Agency / organization billing identity ──────────────────────────
       Set when the request comes from a GST-verified agency. `name`/`phone`/
       `email` above stay the contact person; these describe who is billed.
       Admin order-creation reads them so an agency booking never has to be
       re-typed or re-verified there. */
    customerCategory: {
      type: String,
      enum: ["individual", "organization"],
      default: "individual",
    },
    gstDetailId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GstDetail",
      default: null,
    },
    gstNumber: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },
    companyName: {
      type: String,
      trim: true,
      default: "",
    },
    panNumber: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },

    campaignType: {
      type: String,
      trim: true,
      default: "Roadshow Campaign",
    },
    location: {
      type: String,
      trim: true,
      default: "",
    },
    route: {
      type: String,
      trim: true,
      default: "",
    },
    addOns: {
      type: [String],
      default: [],
    },
    vehicleTypes: {
      type: [vehicleTypeQuantitySchema],
      required: true,
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "At least one vehicle type is required",
      },
    },
    subtotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    gstPercentage: {
      type: Number,
      default: 0,
      min: 0,
    },
    gstAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    estimatedTotal: {
      type: Number,
      default: 0,
      min: 0,
    },

    /* ── Tax breakdown ────────────────────────────────────────────────────
       `gstAmount` above remains the single source of truth for the total
       tax and is unchanged. These three only record how that same total
       was presented: CGST + SGST for an intra-state supply, IGST for an
       inter-state one, derived from the customer's GSTIN state code.
       cgst + sgst + igst always equals gstAmount. */
    cgstAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    sgstAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    igstAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    /* Sum of every line's promoterCost, for reporting without re-summing */
    promoterTotal: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: Number,
      enum: [0, 1, 2], // 0 - todo, 1 - inprogress, 2 - completed
      default: 0,
    },

    /* ── The order this request became ────────────────────────────────────
       A public booking now lands in the orders collection too, so it enters
       the same operations pipeline an admin-created order does instead of
       waiting to be retyped. These two fields are the link back.

       Both stay null when the order could not be raised (no packageId on
       the lines, or a package that has since been deleted) — the request
       itself is still saved, and admin can create the order by hand from
       the client-request screen exactly as before. */
    orderRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    orderId: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ClientRequestOrder', clientRequestSchema);