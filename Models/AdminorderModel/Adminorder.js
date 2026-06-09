


const mongoose = require("mongoose");

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


const projectExecutionDocSchema = new mongoose.Schema(
  {
    document: { type: String, default: "" },
    notes: { type: String, default: "" },
    uploadedBy: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);


const todoDocSchema = new mongoose.Schema(
  {
    document: { type: String, default: "" },     
    notes: { type: String, default: "" },         
    uploadedBy: { type: String, default: "" },    
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }  
);


const projectCodeSchema = new mongoose.Schema(
  {
    projectCode: { type: String, required: true },
    estimationCode: { type: String, required: true },
    savedBy: { type: String, default: "" },
    savedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const onRoadCommentSchema = new mongoose.Schema(
  {
    document: { type: String, default: "" },
    notes: { type: String, default: "" },
    uploadedBy: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);


const onRoadHistorySchema = new mongoose.Schema({
  action: { type: String, enum: ["created", "edited"], default: "created" },
  changedFields: { type: Object, default: {} }, 
  driverName: String,
  driverPhone: String,
  driverAlternatePhone: String,
  vehicleRegistrationNumber: String,
  changedBy: { type: String, default: "" },
  changedAt: { type: Date, default: Date.now },
}, { _id: true });


const projectMailLogSchema = new mongoose.Schema(
  {
    sentTo: { type: String, default: "" },
    sentCc: { type: String, default: "" },
    subject: { type: String, default: "" },
    sentBy: { type: String, default: "" },
    sentAt: { type: Date, default: Date.now },
    isResend: { type: Boolean, default: false },
  },
  { _id: true }
);

const enquiryDocSchema = new mongoose.Schema(
  {
    document: { type: String, default: "" },
    notes: { type: String, default: "" },
    uploadedBy: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);



// ── Sales Pipeline Schemas (kept as-is) ───────────────────────────────────
const needAnalysisDocSchema = new mongoose.Schema(
  {
    analysisDocument: { type: String, default: "" },
    notes: { type: String, default: "" },
    uploadedBy: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);



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
    notes: { type: String, default: "" },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, unique: true },
    userId: { type: String, required: false },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    gstVerifyDetails: { type: [gstVerifyDetailSchema], default: [] },

    // 0 = individual, 1 = organization
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

    // ── Admin Pipeline ────────────────────────────────────────────
    // SIMPLIFIED: todo → projectCodeCreation → projectExecution → onRoad → ...
    pipelineStatus: {
      type: String,
      enum: [
        "todo",
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
      default: "todo",
    },

    handlerName: String,
    todoUploadedBy: { type: String, default: "" },
    reasonDescription: String,

    pipelineLogs: [
      {
        fromStage: String,
        toStage: String,
        movedBy: String,
        movedAt: { type: Date, default: Date.now },
        handlerName: String,
        notes: { type: String, default: "" },
      },
    ],

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


    projectExecutionArray: { type: [projectExecutionDocSchema], default: [] },
    todoArray: { type: [todoDocSchema], default: [] }, 

    onRoadExecutionArray: [
      {
        document: { type: String, default: "" },
        notes: { type: String, default: "" },
        gatepassPhoto: { type: String, required: false, default: "" },
        vehicleFrontPhoto: { type: String, default: "" },
        vehicleBackPhoto: { type: String, default: "" },
        vehicleLeftPhoto: { type: String, default: "" },
        vehicleRightPhoto: { type: String, default: "" },
        driverName: { type: String, required: true, default: "" },
        driverPhone: { type: String, required: true, default: "" },
        driverAlternatePhone: { type: String, default: "" },
        vehicleRegistrationNumber: { type: String, required: true, default: "" },
        uploadedBy: { type: String, default: "" },
        uploadedAt: { type: Date, default: Date.now },
      }
    ],

    onRoadHistory: { type: [onRoadHistorySchema], default: [] },

    // ── Project Code ──────────────────────────────────────────────

    onRoadCommentsArray: { type: [onRoadCommentSchema], default: [] },
    projectCodeArray: { type: [projectCodeSchema], default: [] },
    projectMailLogs: { type: [projectMailLogSchema], default: [] },

    // ── Sales Pipeline (unchanged) ────────────────────────────────
    salesPipelineStatus: {
      type: String,
      enum: [
        "enquiry",
        "needAnalysis",
        "proposalPriceQuote",
        "negotiationReview",
        "closedWon",
        "projectCodeCreation",
        "closedLost",
      ],
      default: "enquiry",
    },
    enquiryName: { type: String, default: "" },
    salesHandlerName: { type: String, default: "" },
    salesNegotiationFinalAmount: { type: Number, default: null },
    enquiryArray: { type: [enquiryDocSchema], default: [] },
    needAnalysisArray: { type: [needAnalysisDocSchema], default: [] },
    proposalArray: { type: [proposalDocSchema], default: [] },
    salesNegotiationArray: { type: [salesNegotiationDocSchema], default: [] },
    closedWonArray: { type: [closedWonDocSchema], default: [] },
    closedLostArray: { type: [closedLostDocSchema], default: [] },
    salesPipelineLogs: { type: [salesPipelineLogSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);