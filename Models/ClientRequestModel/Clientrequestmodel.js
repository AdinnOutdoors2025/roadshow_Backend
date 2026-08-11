

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
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
    status: {
      type: Number,
      enum: [0, 1, 2], // 0 - todo, 1 - inprogress, 2 - completed
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ClientRequestOrder', clientRequestSchema);