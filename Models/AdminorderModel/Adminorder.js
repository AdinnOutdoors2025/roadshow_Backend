

const mongoose = require("mongoose");

// ── Existing sub-schemas (unchanged) ────────────────────────────────────────

const additionalChargeSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    mode: { type: String, enum: ["+", "-"], required: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const gstVerifyDetailSchema = new mongoose.Schema(
  {
    gstDetailId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GstDetail",
      required: true,
    },
    gst_number: { type: String, required: true },
    business_name: { type: String, default: "" },
    verifiedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const bookingItemSchema = new mongoose.Schema({
  packageId: { type: mongoose.Schema.Types.ObjectId, ref: "Package" },
  vehicleType: String,
  vehicleModel: String,
  vehicleImage: String,
  bookingFor: String,
  campaignType: String,
  otherCampaignType: String,
  gstNumber: { type: String, default: "" },
  campaignTypeRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CampaignType",
    default: null,
  },
  fromDate: Date,
  toDate: Date,
  totalDays: Number,
  extraKm: { type: Number, default: 0 },
  extraHours: { type: Number, default: 0 },
  extraHourCost: { type: Number, default: 0 },
  extraDays: { type: Number, default: 0 },
  state: String,
  city: String,
  fromLocation: String,
  toLocation: String,
  quantity: Number,
  needPromoter: { type: Boolean, default: false },
  promoterType: String,
  otherPromoterType: String,
  promoterGender: { type: String, default: "" },
  promoterLanguage: { type: [String], default: [] },
  promoterQuantity: { type: Number, default: 0 },
  perDayRentalCost: { type: Number, default: 0 },
  driverCharges: { type: Number, default: 0 },
  promoterChargePerDay: { type: Number, default: 0 },
  rtoCharges: { type: Number, default: 0 },
  additionalHourCharges: { type: Number, default: 0 },
  dailyKmcharges: { type: Number, default: 0 },
  campaignImages: [String],
  campaignVideos: [String],
  dailyKmLimit: Number,
  rentalCost: Number,
  driverCost: Number,
  promoterCost: Number,
  rtoCost: Number,
  extraKmCost: { type: Number, default: 0 },
  additionalNet: { type: Number, default: 0 },
  subtotal: Number,
  gstAmount: Number,
  totalAmount: Number,
  additionalFields: { type: [additionalChargeSchema], default: [] },
});

const poDocumentLogSchema = new mongoose.Schema(
  {
    poDocument: { type: String, required: true },
    poDate: { type: Date, required: true },
    poNotes: { type: String, default: "" },
    uploadedBy: { type: String },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const paymentStageFirstSchema = new mongoose.Schema(
  {
    advancePayment: { type: Number, required: true },
    paymentProofDocument: { type: String, required: true },
    paymentDate: { type: Date, required: true },
    paymentVerification: { type: String, required: true },
    paymentNotes: { type: String, default: "" },
    uploadedBy: { type: String },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

// ── NEW: Sales pipeline sub-schemas (flat) ───────────────────────────────────

const needAnalysisDocSchema = new mongoose.Schema(
  {
    analysisDocument: { type: String, default: "" },
    notes: { type: String, default: "" },
    uploadedBy: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const projectCodeCreationSchema = new mongoose.Schema({
  projectCode: { type: String, default: "" },
  estimationCode: { type: String, default: "" },
  uploadedBy: { type: String, default: "" },
  uploadedAt: { type: Date, default: Date.now },
}, { _id: true });

const proposalDocSchema = new mongoose.Schema(
  {
    proposalDocument: { type: String, default: "" },
    notes: { type: String, default: "" },
    uploadedBy: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const salesNegotiationDocSchema = new mongoose.Schema(
  {
    document: { type: String, default: "" },
    notes: { type: String, default: "" },
    amount: { type: Number, default: 0 },
    uploadedBy: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const closedWonDocSchema = new mongoose.Schema(
  {
    salesPoDocument: { type: String, required: true },
    salesPoNotes: { type: String, default: "" },
    uploadedBy: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const closedLostDocSchema = new mongoose.Schema(
  {
    reason: { type: String, required: true },
    document: { type: String, default: "" },
    uploadedBy: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const salesPipelineLogSchema = new mongoose.Schema(
  {
    fromStage: { type: String, default: null },
    toStage: { type: String, required: true },
    movedBy: { type: String, default: "" },
    handlerName: { type: String, default: "" },
    movedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// ── Main Order Schema ────────────────────────────────────────────────────────

const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, unique: true },

    userId: { type: String, required: false },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    gstVerifyDetails: { type: [gstVerifyDetailSchema], default: [] },
    customerType: { type: Number, enum: [0, 1], default: 1 },
    address: String,
    email: String,
    companyName: String,
    clientName: String,
    designation: String,
    gstNumber: String,
    customerCategory: {
      type: String,
      enum: ["individual", "organization"],
      default: "individual",
    },

    isAdminCreated: { type: Boolean, default: false },
    bookingItems: [bookingItemSchema],

    grandGst: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true },
    orderStatus: {
      type: String,
      enum: ["Pending", "Confirmed", "Cancelled"],
      default: "Pending",
    },

    // ── Admin pipeline ────────────────────────────────────────────────────
    pipelineStatus: {
      type: String,
      enum: [
        "newOrder",
        "inProgress",
        "customerConfirmation",
        "waitingForPO",
        "paymentStage1",
        "projectCodeCreation",
        "projectExecution",
        "onRoad",
        "campaignRunning",
        "vehicleUnavailable",
        "clientClosure",
        "invoiceGeneration",
        "paymentStage2",
        "closedWon",
        "closedLost",
      ],
      default: "newOrder",
    },

    handlerName: String,
    reasonDescription: String,

    pipelineLogs: [
      {
        fromStage: String,
        toStage: String,
        movedBy: String,
        movedAt: { type: Date, default: Date.now },
        handlerName: String,
      },
    ],

    poDocumentLogs: { type: [poDocumentLogSchema], default: [] },
    paymentStageFirst: { type: [paymentStageFirstSchema], default: [] },

    negotiationLogs: [
      {
        fromStage: String,
        toStage: String,
        movedBy: String,
        movedAt: { type: Date, default: Date.now },
        discountAmount: Number,
        discountNotes: { type: String, default: "" },
      },
    ],

    grandNegotiationTotal: { type: Number, default: null },

    // ── Sales pipeline (flat fields — no nested object) ───────────────────
    salesPipelineStatus: {
      type: String,
      enum: [
        "enquiry",
        "needAnalysis",
        "proposalPriceQuote",
        "negotiationReview",
        "closedWon",
        "closedLost",
      ],
      default: "enquiry",
    },

    salesHandlerName: { type: String, default: "" },

    salesNegotiationFinalAmount: { type: Number, default: null },

    needAnalysisArray:     { type: [needAnalysisDocSchema],     default: [] },
    proposalArray:         { type: [proposalDocSchema],          default: [] },
    salesNegotiationArray: { type: [salesNegotiationDocSchema],  default: [] },
    closedWonArray:        { type: [closedWonDocSchema],         default: [] },
    projectCodeCreationArray: { type: [projectCodeCreationSchema], default: [] },
    closedLostArray:       { type: [closedLostDocSchema],        default: [] },
    salesPipelineLogs:     { type: [salesPipelineLogSchema],     default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);