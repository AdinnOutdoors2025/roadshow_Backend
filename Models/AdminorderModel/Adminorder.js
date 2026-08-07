

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
    business_pan: { type: String, default: "" },
    verifiedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const clientClosureCommentSchema = new mongoose.Schema(
  {
    document: { type: String, default: "" }, notes: { type: String, default: "" },
    uploadedBy: { type: String, default: "" }, uploadedAt: { type: Date, default: Date.now }
  },
  { _id: true }
);


const bookingItemSchema = new mongoose.Schema({
  packageId: { type: mongoose.Schema.Types.ObjectId, ref: "Package" },
  vehicleType: String,
  vehicleModel: String,
  vehicleImage: String,
  bookingFor: String,
  campaignType: String,
  campaignName: { type: String, default: "" },
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

  purchasedExtraKmFromDate: { type: Date, default: null },
  purchasedExtraKmToDate: { type: Date, default: null },
  state: String,
  city: String,
  fromLocation: String,
  toLocation: String,
  campaignLocation: { type: String, default: "" },
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


const extraKmHistorySchema = new mongoose.Schema({
  vehicleIndex: { type: Number, required: true },
  entryId: { type: mongoose.Schema.Types.ObjectId, default: null },
  driverName: { type: String, default: "" },
  driverPhone: { type: String, default: "" },
  vehicleRegistrationNumber: { type: String, default: "" },
  extraKm: { type: Number, default: 0 },
  extraHours: { type: Number, default: 0 },
  fromDate: { type: Date, required: true },
  toDate: { type: Date, required: true },
  perKmChargeRate: { type: Number, default: 0 },
  additionalHourChargeRate: { type: Number, default: 0 },
  extraKmCost: { type: Number, default: 0 },
  extraHourCost: { type: Number, default: 0 },
  totalCost: { type: Number, default: 0 },
  addedBy: { type: String, default: "" },
  addedAt: { type: Date, default: Date.now },
  distributionMethod: { type: String, enum: ["daily", "split"], default: "daily" },
}, { _id: true });


const dailyHoursLogSchema = new mongoose.Schema({
  vehicleIndex: { type: Number, required: true },
  entryId: { type: mongoose.Schema.Types.ObjectId, default: null },
  driverName: { type: String, default: "" },
  driverPhone: { type: String, default: "" },
  vehicleRegistrationNumber: { type: String, default: "" },
  day: { type: String, required: true }, // YYYY-MM-DD
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  campaignHours: { type: Number, default: 8 },
  runningHours: { type: Number, default: 0 },
  absentHours: { type: Number, default: 0 },
  isAbsentDay: { type: Boolean, default: false },
  absentDayResolution: { type: String, enum: ["extend", "close", null], default: null },
  billingMode: { type: String, enum: ["full", "partial", "absent"], default: "full" },
  remarks: { type: String, default: "" },
  loggedBy: { type: String, default: "" },
  loggedAt: { type: Date, default: Date.now },
}, { _id: true });


const campaignCompensationSchema = new mongoose.Schema({
  vehicleIndex: { type: Number, required: true },
  entryId: { type: mongoose.Schema.Types.ObjectId, default: null }, // null = applies to every entry of this vehicleIndex
  vehicleRegistrationNumber: { type: String, default: "" },
  compensationType: { type: String, enum: ["hours", "days"], required: true },
  compensationValue: { type: Number, required: true, min: 0 }, // hours granted per day, or extra days granted
  fromDate: { type: Date, required: true },
  toDate: { type: Date, required: true },
  reason: { type: String, default: "" },
  addedBy: { type: String, default: "" },
  addedAt: { type: Date, default: Date.now },
}, { _id: true });


const onRoadExtraKmSchema = new mongoose.Schema({
  vehicleIndex: { type: Number, required: true },
  entryId: { type: mongoose.Schema.Types.ObjectId, required: true },
  driverName: { type: String, default: "" },
  driverPhone: { type: String, default: "" },
  vehicleRegistrationNumber: { type: String, default: "" },
  extraKm: { type: Number, default: 0 },
  extraHours: { type: Number, default: 0 },
  fromDate: { type: Date, required: true },
  toDate: { type: Date, required: true },
  perKmChargeRate: { type: Number, default: 0 },
  additionalHourChargeRate: { type: Number, default: 0 },
  extraKmCost: { type: Number, default: 0 },
  extraHourCost: { type: Number, default: 0 },
  totalCost: { type: Number, default: 0 },
  addedBy: { type: String, default: "" },
  addedAt: { type: Date, default: Date.now },
}, { _id: true });



const orderFieldChangeSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },      // e.g. "Customer Name"
    oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const vehicleChangeSchema = new mongoose.Schema(
  {
    vehicleIndex: { type: Number, required: true },
    action: { type: String, enum: ["modified", "added", "removed"], default: "modified" },
    vehicleLabel: { type: String, default: "" },   // ← NEW: e.g. "2 Sided LED Models · Thoubal"
    vehicleTypeId: { type: String, default: "" },
    changes: { type: [orderFieldChangeSchema], default: [] },
  },
  { _id: false }
);

const orderEditHistorySchema = new mongoose.Schema(
  {
    editedBy: { type: String, default: "" },
    editedAt: { type: Date, default: Date.now },
    customerChanges: { type: [orderFieldChangeSchema], default: [] },
    vehicleChanges: { type: [vehicleChangeSchema], default: [] },
  },
  { _id: true }
);

const projectExecutionDocSchema = new mongoose.Schema(
  {
    document: { type: String, default: "" },
    notes: { type: String, default: "" },
    uploadedBy: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);


const poCommentSchema = new mongoose.Schema(
  {
    document: { type: String, default: "" },
    notes: { type: String, default: "" },
    uploadedBy: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);


const poDocumentEditSchema = new mongoose.Schema(
  {
    document: { type: String, required: true },
    previousDocument: { type: String, default: "" },
    reason: { type: String, required: true },
    editedBy: { type: String, default: "" },
    editedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const handlerAssignmentSchema = new mongoose.Schema(
  {
    previousHandler: { type: String, default: "" },
    newHandler: { type: String, required: true },
    isTemporary: { type: Boolean, default: false },
    leaveStartDate: { type: Date, default: null },
    leaveEndDate: { type: Date, default: null },
    reason: { type: String, default: "" },
    status: {
      type: String,
      enum: ["active", "reverted", "madePermanent"],
      default: "active",
    },
    assignedBy: { type: String, default: "" },
    assignedAt: { type: Date, default: Date.now },
    revertedAt: { type: Date, default: null },
  },
  { _id: true }
);

const projectCodeCommentSchema = new mongoose.Schema(
  {
    document: { type: String, default: "" },
    notes: { type: String, default: "" },
    uploadedBy: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const salesFinalClosedWonCommentSchema = new mongoose.Schema(
  {
    document: { type: String, default: "" },
    notes: { type: String, default: "" },
    uploadedBy: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const closedLostCommentSchema = new mongoose.Schema(
  {
    document: { type: String, default: "" },
    notes: { type: String, default: "" },
    uploadedBy: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const driverLocationSchema = new mongoose.Schema(
  {
    vehicleRegistrationNumber: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    address: { type: String, default: "" },
    updatedBy: { type: String, default: "" },
    updatedAt: { type: Date, default: Date.now },
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

const onRoadUnavailableHistorySchema = new mongoose.Schema({
  vehicleIndex: { type: Number, required: true },
  entryId: { type: mongoose.Schema.Types.ObjectId, default: null }, // the old/unavailable on-road entry this record is about
  vehicleRegNo: { type: String, default: "" },
  driverName: { type: String, default: "" },
  driverPhone: { type: String, default: "" },
  reason: { type: String, default: "" },
  inventoryStatus: { type: String, enum: ["Unavailable", "Damaged", "Under Maintenance"], default: "Unavailable" },
  photo: { type: String, default: "" },
  status: { type: String, enum: ["unavailable", "available"], default: "unavailable" },
  // "unavailable" = plain mark-unavailable report; "replaced" = a replacement vehicle was dispatched
  eventType: { type: String, enum: ["unavailable", "replaced"], default: "unavailable" },

  // ── Replacement linkage (only set when eventType === "replaced") ──
  replacementEntryId: { type: mongoose.Schema.Types.ObjectId, default: null },
  replacementVehicleRegNo: { type: String, default: "" },
  replacementDriverName: { type: String, default: "" },
  replacementDriverPhone: { type: String, default: "" },
  replacedAt: { type: Date, default: null },

  reportedBy: { type: String, default: "" },
  reportedAt: { type: Date, default: Date.now },
  resolvedBy: { type: String, default: "" },
  resolvedAt: { type: Date, default: null },
  resolveDescription: { type: String, default: "" },
  resolvePhoto: { type: String, default: "" },
}, { _id: true });



const onRoadIssueSchema = new mongoose.Schema({
  vehicleIndex: { type: Number, required: true },
  entryId: { type: mongoose.Schema.Types.ObjectId, default: null },
  driverName: { type: String, default: "" },
  vehicleRegNo: { type: String, default: "" },
  issueDescription: { type: String, required: true },
  issuePhoto: { type: String, default: "" },
  status: { type: String, enum: ["open", "resolved"], default: "open" },
  resolveDescription: { type: String, default: "" },
  resolvePhoto: { type: String, default: "" },
  reportedBy: { type: String, default: "" },
  reportedAt: { type: Date, default: Date.now },
  resolvedBy: { type: String, default: "" },
  resolvedAt: { type: Date, default: null },
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


const onRoadDriverHistorySchema = new mongoose.Schema({
  vehicleIndex: { type: Number, required: true },
  entryId: { type: mongoose.Schema.Types.ObjectId, default: null },
  action: { type: String, enum: ["created", "updated", "removed"], default: "created" }, // ← "removed" added
  driverName: { type: String, default: "" },
  driverPhone: { type: String, default: "" },
  vehicleRegistrationNumber: { type: String, default: "" },
  gatepassPhoto: { type: String, default: "" },
  changedBy: { type: String, default: "" },
  changedAt: { type: Date, default: Date.now },
  changedFields: { type: Object, default: {} },
  reason: { type: String, default: "" },
}, { _id: true });

const clientFeedbackSchema = new mongoose.Schema({
  bookingItemId: { type: mongoose.Schema.Types.ObjectId, default: null }, // ADD THIS
  comments: { type: String, default: "" },
  rating: { type: String, enum: ["Good", "Average", "Poor"], default: null },
  createdBy: { type: String, default: "" },
  createdDate: { type: Date, default: Date.now },
}, { _id: true });



const focHistoryEntrySchema = new mongoose.Schema(
  {
    action: { type: String, enum: ["created", "updated", "approved"], required: true },
    changedFields: { type: Object, default: {} },
    changedBy: { type: String, default: "" },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const focChatMessageSchema = new mongoose.Schema(
  {
    senderUsername: { type: String, required: true },
    senderRole: { type: String, enum: ["admin", "sales", "operation", "staffAdmin"], required: true },
    message: { type: String, default: "" },
    attachment: { type: String, default: "" },
    sentAt: { type: Date, default: Date.now },
  },
  { _id: true }
);


const campaignClosureSchema = new mongoose.Schema({
  bookingItemId: { type: mongoose.Schema.Types.ObjectId, default: null },
  type: { type: String, enum: ["closed", "foc", "paid"], required: true },
  reason: { type: String, default: "" },
  document: { type: String, default: "" },
  fromDate: { type: Date, default: null },
  toDate: { type: Date, default: null },
  createdBy: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, enum: ["pending", "approved"], default: "pending" },
  approvedBy: { type: String, default: "" },
  approvedAt: { type: Date, default: null },
  focHistory: { type: [focHistoryEntrySchema], default: [] },


  isAdminCreated: { type: Boolean, default: false },
  focChatMessages: { type: [focChatMessageSchema], default: [] },
  focPurpose: { type: String, enum: ["absent-day", "compensation-days", "compensation-hours", null], default: null },
  compensationVehicleIndex: { type: Number, default: null },
  compensationEntryId: { type: mongoose.Schema.Types.ObjectId, default: null },
  compensationDaysValue: { type: Number, default: null },
  compensationHoursValue: { type: Number, default: null },
}, { _id: true });



const enquiryDocSchema = new mongoose.Schema(
  {
    document: { type: String, default: "" },
    notes: { type: String, default: "" },
    uploadedBy: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);


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


const orderClosedWonSchema = new mongoose.Schema(
  {
    comments: { type: String, required: false },
    document: { type: String, default: "" },
    uploadedBy: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const orderClosedLostSchema = new mongoose.Schema(
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
    logType: { type: String, enum: ["stage", "edit"], default: "stage" },
  },
  { _id: false }
);

const invoiceLineItemSchema = new mongoose.Schema(
  {
    groupLabel: { type: String, default: "" },
    description: { type: String, default: "" },
    hsnSac: { type: String, default: "" },
    qty: { type: Number, default: 1 },
    rate: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
  },
  { _id: false }
);

const invoiceDataSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, default: "" },
    invoiceDate: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    poNumber: { type: String, default: "" },
    projectName: { type: String, default: "" },
    placeOfSupply: { type: String, default: "" },
    billToName: { type: String, default: "" },
    billToAddress: { type: String, default: "" },
    billToGstin: { type: String, default: "" },
    billToPan: { type: String, default: "" },
    lineItems: { type: [invoiceLineItemSchema], default: [] },
    discountLabel: { type: String, default: "Discount" },
    discountMode: { type: String, enum: ["add", "decrease"], default: "decrease" },
    discountType: { type: String, enum: ["percent", "amount"], default: "percent" },
    discountValue: { type: Number, default: 0 },
    cgstPercent: { type: Number, default: 9 },
    sgstPercent: { type: Number, default: 9 },
    igstPercent: { type: Number, default: 18 },
    rounding: { type: Number, default: 0 },
    signatureMode: { type: String, enum: ["signed", "unsigned"], default: "signed" },
    generatedBy: { type: String, default: "" },
    generatedAt: { type: Date, default: null },
  },
  { _id: false }
);

const invoiceHistoryChangeSchema = new mongoose.Schema(
  {
    section: { type: String, default: "" },
    field: { type: String, default: "" },
    oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const invoiceLineItemFieldChangeSchema = new mongoose.Schema(
  {
    field: { type: String, default: "" },
    oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const invoiceLineItemChangeSchema = new mongoose.Schema(
  {
    groupLabel: { type: String, default: "" },
    action: { type: String, enum: ["added", "removed", "edited"], default: "edited" },
    description: { type: String, default: "" },
    hsnSac: { type: String, default: "" },
    qty: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    fieldChanges: { type: [invoiceLineItemFieldChangeSchema], default: [] },
  },
  { _id: false }
);

const invoiceHistorySchema = new mongoose.Schema(
  {
    action: { type: String, enum: ["created", "updated"], default: "updated" },
    changes: { type: [invoiceHistoryChangeSchema], default: [] },
    lineItemChanges: { type: [invoiceLineItemChangeSchema], default: [] },
    editedBy: { type: String, default: "" },
    editedAt: { type: Date, default: Date.now },
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
    panNumber: { type: String, default: "" },
    invoiceData: { type: invoiceDataSchema, default: null },
    invoiceHistory: { type: [invoiceHistorySchema], default: [] },
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
    opsHandlerAssignmentHistory: { type: [handlerAssignmentSchema], default: [] },
    originalHandlerName: { type: String, default: "" },
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

    driverLocationArray: { type: [driverLocationSchema], default: [] },

   onRoadExecutionArray: [
  {
    vehicleIndex: { type: Number, required: true },
    driverName: { type: String, required: true, default: "" },
    driverPhone: { type: String, required: true, default: "" },
    vehicleRegistrationNumber: { type: String, required: true, default: "" },
    gatepassPhoto: { type: String, default: "" },
    onRoadStatus: { type: Number, enum: [0, 1], default: 0 },
    uploadedBy: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
    unavailableStatus: { type: Boolean, default: false },
    unavailableReason: { type: String, default: "" },
    inventoryStatus: { type: String, enum: ["Unavailable", "Damaged", "Under Maintenance"], default: "Unavailable" },

    // ── NEW: for release/remove feature ──
    entryStatus: { type: String, enum: ["active", "removed"], default: "active" },
    removedAt: { type: Date, default: null },
    removedBy: { type: String, default: "" },
    removalReason: { type: String, default: "" },
     removalStatus: { type: String, default: "" },
  }
],

orderEditHistory: { type: [orderEditHistorySchema], default: [] },
    onRoadUnavailableHistory: { type: [onRoadUnavailableHistorySchema], default: [] },
    
    onRoadHistory: { type: [onRoadHistorySchema], default: [] },
    onRoadIssues: { type: [onRoadIssueSchema], default: [] },
    onRoadDriverHistory: { type: [onRoadDriverHistorySchema], default: [] },
    extraKmDetailsArray: { type: [extraKmHistorySchema], default: [] },
    onRoadExtraKm: { type: [onRoadExtraKmSchema], default: [] },
    dailyHoursLogArray: { type: [dailyHoursLogSchema], default: [] },
    campaignCompensationArray: { type: [campaignCompensationSchema], default: [] },
    clientFeedbackHistory: { type: [clientFeedbackSchema], default: [] },
    campaignClosureArray: { type: [campaignClosureSchema], default: [] },

    // ── Project Code ──────────────────────────────────────────────
    clientClosureCommentsArray: { type: [clientClosureCommentSchema], default: [] },
    closedWonCommentsArray: { type: [clientClosureCommentSchema], default: [] },
    closedLostCommentsArray: { type: [clientClosureCommentSchema], default: [] },
    onRoadCommentsArray: { type: [onRoadCommentSchema], default: [] },
    projectCodeArray: { type: [projectCodeSchema], default: [] },
    projectMailLogs: { type: [projectMailLogSchema], default: [] },
    poCommentsArray: { type: [poCommentSchema], default: [] },
    poDocumentEditHistory: { type: [poDocumentEditSchema], default: [] },
    handlerAssignmentHistory: { type: [handlerAssignmentSchema], default: [] },
    originalSalesHandlerName: { type: String, default: "" },
    projectCodeCommentsArray: { type: [projectCodeCommentSchema], default: [] },
    salesFinalClosedWonArray: { type: [salesFinalClosedWonCommentSchema], default: [] },
    closedLostCommentsArray: { type: [closedLostCommentSchema], default: [] },
    orderClosedWonArray: { type: [orderClosedWonSchema], default: [] },
    orderClosedLostArray: { type: [orderClosedLostSchema], default: [] },
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
        "salesFinalClosedWon",
        "invoiceGeneration",
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