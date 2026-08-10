
require("dotenv").config();
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const FormData = require("form-data");
const Order = require("../../Models/AdminorderModel/Adminorder");
const vehicletypes = require("../../Models/VehicleTypeSchema");
const { successResponse, errorResponse } = require("../../Utils/response");
const { findDateConflictsForOrder } = require("../../Utils/dateConflictChecker");

const STORAGE_TYPE = process.env.STORAGE_TYPE || "local";
const CDN_BASE_URL =
  process.env.DO_SPACES_CDN_BASE ||
  "https://adinn-space.sgp1.digitaloceanspaces.com";

const SALES_STAGE_ORDER = [
  "enquiry",
  "proposalPriceQuote",
  "closedWon",
  "projectCodeCreation",
  "salesFinalClosedWon",
  "closedLost",
];

const getFilePath = (file) => {
  if (!file) return "";
  if (STORAGE_TYPE === "space") {
    return file.location || "";
  }
  return `/uploads/${path.basename(file.path)}`;
};

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const DOC_MAX_BYTES = 10 * 1024 * 1024;

const IMAGE_MIMES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const DOC_MIMES = ["application/pdf"];

const validateFile = (file, label) => {
  if (!file) return null;

  const isImage = IMAGE_MIMES.includes(file.mimetype);
  const isDoc = DOC_MIMES.includes(file.mimetype);

  const maxBytes = isImage ? IMAGE_MAX_BYTES : DOC_MAX_BYTES;
  const maxLabel = isImage ? "5 MB" : "10 MB";
  const typeLabel = isImage ? "Image" : "PDF document";

  const fileSize = file.size || (file.buffer ? file.buffer.length : 0);

  if (fileSize > maxBytes) {
    return `${label} ${typeLabel} size exceeds ${maxLabel} limit (uploaded: ${(fileSize / (1024 * 1024)).toFixed(2)} MB)`;
  }
  return null;
};


// exports.getSalesPipeline = async (req, res) => {
//   try {
//     const orders = await Order.find({ pipelineStatus: "todo" })
//       .sort({ createdAt: -1 })
//       .lean();

//     const grouped = {};
//     SALES_STAGE_ORDER.forEach((s) => (grouped[s] = []));

//     orders.forEach((o) => {
//       const stage = o.salesPipelineStatus || "enquiry";
//       if (grouped[stage]) {
//         grouped[stage].push(o);
//       } else {
//         grouped["enquiry"].push(o);
//       }
//     });

//     return successResponse(res, "Sales pipeline fetched", {
//       grouped,
//       stages: SALES_STAGE_ORDER,
//     });
//   } catch (error) {
//     return errorResponse(res, error.message);
//   }
// };


exports.getSalesPipeline = async (req, res) => {
  try {
    const orders = await Order.find({ pipelineStatus: "todo" })
      .sort({ createdAt: -1 })
      .lean();

 
    const allBookingSnapshots = await Order.find({})
      .select("_id bookingItems pipelineStatus salesPipelineStatus onRoadExecutionArray")
      .lean();

 
    const isOrderFinished = (o) =>
      o.pipelineStatus === "closedWon" ||
      o.pipelineStatus === "closedLost" ||
      o.salesPipelineStatus === "closedLost" ||
      o.salesPipelineStatus === "salesFinalClosedWon";

    const vehicleTypeMap = {};
    allBookingSnapshots.forEach((o) => {
      if (isOrderFinished(o)) return;
      (o.bookingItems || []).forEach((item, idx) => {
        if (!item.vehicleType || !item.fromDate || !item.toDate) return;
        const slotEntries = (o.onRoadExecutionArray || []).filter((e) => e.vehicleIndex === idx);
        const slotReleased = slotEntries.length > 0 && slotEntries.every((e) => e.entryStatus === "removed");
        if (slotReleased) return;
        const key = String(item.vehicleType);
        if (!vehicleTypeMap[key]) vehicleTypeMap[key] = [];
        vehicleTypeMap[key].push({
          orderId: String(o._id),
          fromDate: new Date(item.fromDate),
          toDate: new Date(item.toDate),
        });
      });
    });

    const conflictedOrderIds = new Set();
    allBookingSnapshots.forEach((o) => {
      if (isOrderFinished(o)) return;
      const oId = String(o._id);
      let hasConflict = false;
      (o.bookingItems || []).forEach((item) => {
        if (hasConflict || !item.vehicleType || !item.fromDate || !item.toDate) return;
        const bucket = vehicleTypeMap[String(item.vehicleType)] || [];
        const thisFrom = new Date(item.fromDate);
        const thisTo = new Date(item.toDate);
        const overlap = bucket.some(
          (b) => b.orderId !== oId && b.fromDate <= thisTo && b.toDate >= thisFrom
        );
        if (overlap) hasConflict = true;
      });
      if (hasConflict) conflictedOrderIds.add(oId);
    });
   

    const grouped = {};
    SALES_STAGE_ORDER.forEach((s) => (grouped[s] = []));

    orders.forEach((o) => {
      o.hasDateConflict = conflictedOrderIds.has(String(o._id));
      const stage = o.salesPipelineStatus || "enquiry";
      if (grouped[stage]) {
        grouped[stage].push(o);
      } else {
        grouped["enquiry"].push(o);
      }
    });

    return successResponse(res, "Sales pipeline fetched", {
      grouped,
      stages: SALES_STAGE_ORDER,
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.getSalesOrderById = async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return errorResponse(res, "Sales order not found", null, 404);
    return successResponse(res, "Sales order fetched", { order });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.getDateConflicts = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const conflicts = await findDateConflictsForOrder(order);
    return successResponse(res, "Date conflicts fetched", { conflicts });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};


exports.updateSalesPipeline = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      salesPipelineStatus,
      handlerName,
      notes,
      amount,
      reason,
      salesPoNotes,
      proposalNotes,
      analysisNotes,
      negotiationNotes,
    } = req.body;

    if (!SALES_STAGE_ORDER.includes(salesPipelineStatus))
      return errorResponse(res, "Invalid sales pipeline stage", null, 400);

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Sales order not found", null, 404);

    const oldStage = order.salesPipelineStatus;


    const LOCKED_BACK_STAGES = ["enquiry"];
    const oldIndex = SALES_STAGE_ORDER.indexOf(oldStage);
    const newIndex = SALES_STAGE_ORDER.indexOf(salesPipelineStatus);
    if (LOCKED_BACK_STAGES.includes(salesPipelineStatus) && newIndex < oldIndex) {
      return errorResponse(
        res,
        `Cannot move back to "${salesPipelineStatus}" stage once the order has progressed.`,
        null,
        400
      );
    }
    if (
      salesPipelineStatus === "salesFinalClosedWon" &&
      oldStage !== "projectCodeCreation"
    ) {
      return errorResponse(
        res,
        "Cannot move directly to Closed Won stage — please move through Project Code Creation stage first.",
        null,
        400
      );
    }

    const isStaffAdmin = Number(req.user.isAdmin) !== 1;
    // const movedBy = order.salesHandlerName || "Admin";
    const movedBy = req.user?.username || order.salesHandlerName || "Admin";
    const uploadedFiles = req.files || [];

    const fileFieldLabels = {
      analysisDocument: "Need Analysis",
      proposalDocument: "Proposal",
      negotiationDocument: "Negotiation",
      salesPoDocument: "Sales PO",
      closedLostDocument: "Closed Lost",
    };
    for (const file of uploadedFiles) {
      const label = fileFieldLabels[file.fieldname] || file.fieldname;
      const err = validateFile(file, label);
      if (err) return errorResponse(res, err, null, 400);
    }


    if (order.salesPipelineStatus === "projectCodeCreation") {
      if (salesPipelineStatus === "closedLost") {
        // Mail-sent count no longer blocks moving to Closed Lost.
      } else if (salesPipelineStatus === "salesFinalClosedWon") {
        const mailSent = (order.projectMailLogs || []).length > 0;
        const codeCreated = (order.projectCodeArray || []).length > 0;
        if (!mailSent || !codeCreated) {
          return errorResponse(
            res,
            "Please complete the Project Code Creation stage",
            null,
            400
          );
        }
      } else {
        return errorResponse(
          res,
          "Cannot move back from Project Code Creation stage.",
          null,
          400
        );
      }
    }

    if (order.salesPipelineStatus === "salesFinalClosedWon") {
      return errorResponse(
        res,
        "Closed Won is the final stage — this order cannot be moved further.",
        null,
        400
      );
    }


    if (salesPipelineStatus === "proposalPriceQuote" && oldStage === "enquiry") {
      if (isStaffAdmin) {
        order.salesHandlerName = req.user.username;
      } else {
        if (!handlerName?.trim())
          return errorResponse(res, "Handler name is required", null, 400);

        let finalHandler = handlerName.trim();
        if (finalHandler.startsWith("__superadmin__")) {
          finalHandler = finalHandler.replace("__superadmin__", "");
        }
        order.salesHandlerName = finalHandler;
      }
    }


    if (salesPipelineStatus === "needAnalysis" || oldStage === "needAnalysis") {
      const analysisFile = uploadedFiles.find(
        (f) => f.fieldname === "analysisDocument"
      );
      if (analysisFile || analysisNotes) {
        order.needAnalysisArray.push({
          analysisDocument: getFilePath(analysisFile),
          notes: (analysisNotes || "").trim(),
          uploadedBy: order.salesHandlerName,
          uploadedAt: new Date(),
        });
      }
    }


    if (
      salesPipelineStatus === "proposalPriceQuote" ||
      oldStage === "proposalPriceQuote"
    ) {
      const proposalFile = uploadedFiles.find(
        (f) => f.fieldname === "proposalDocument"
      );
      if (proposalFile || proposalNotes) {
        order.proposalArray.push({
          proposalDocument: getFilePath(proposalFile),
          notes: (proposalNotes || "").trim(),
          uploadedBy: order.salesHandlerName,
          uploadedAt: new Date(),
        });
      }
    }


    if (
      salesPipelineStatus === "negotiationReview" ||
      oldStage === "negotiationReview"
    ) {
      const negotiationFile = uploadedFiles.find(
        (f) => f.fieldname === "negotiationDocument"
      );
      const negotiationAmount = Number(amount) || 0;
      if (negotiationFile || negotiationAmount > 0 || negotiationNotes) {
        order.salesNegotiationArray.push({
          document: getFilePath(negotiationFile),
          notes: (negotiationNotes || "").trim(),
          amount: negotiationAmount,
          uploadedBy: order.salesHandlerName,
          uploadedAt: new Date(),
        });

        const totalNegotiated = order.salesNegotiationArray.reduce(
          (sum, n) => sum + (n.amount || 0),
          0
        );
        order.salesNegotiationFinalAmount = Math.max(
          order.grandTotal - totalNegotiated,
          0
        );
      }
    }


    if (salesPipelineStatus === "closedWon") {
      const poFile = uploadedFiles.find(
        (f) => f.fieldname === "salesPoDocument"
      );
      if (poFile || (salesPoNotes || "").trim()) {
        order.closedWonArray.push({
          salesPoDocument: poFile ? getFilePath(poFile) : "",
          salesPoNotes: (salesPoNotes || "").trim(),
          uploadedBy: order.salesHandlerName,
          uploadedAt: new Date(),
        });
      }
    }

    if (salesPipelineStatus === "closedLost") {
      if (!reason?.trim())
        return errorResponse(
          res,
          "Reason is required for closing lost",
          null,
          400
        );
      const lostFile = uploadedFiles.find(
        (f) => f.fieldname === "closedLostDocument"
      );
      order.closedLostArray.push({
        reason: reason.trim(),
        document: getFilePath(lostFile),
        uploadedBy: order.salesHandlerName || req.user.username,
        uploadedAt: new Date(),
      });
    }

    let projectMailResult = null;
    if (
      oldStage === "closedWon" &&
      salesPipelineStatus === "projectCodeCreation"
    ) {
      const { to, cc, subject, additionalNotes } = req.body;

      const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
      const isValidEmailField = (value) => {
        const emails = String(value || "").split(",").map((e) => e.trim()).filter(Boolean);
        if (emails.length === 0) return false;
        return emails.every(isValidEmail);
      };

      if (!to || !String(to).trim()) {
        return errorResponse(res, "To email is required to send the project creation mail.", null, 400);
      }
      if (!isValidEmailField(to)) {
        return errorResponse(res, "Enter a valid email address in the To field.", null, 400);
      }
      if (cc && String(cc).trim() && !isValidEmailField(cc)) {
        return errorResponse(res, "Enter a valid email address in the CC field.", null, 400);
      }

      try {
        projectMailResult = await sendProjectCreationMail({
          order,
          to,
          cc,
          subject,
          additionalNotes,
        });
      } catch (mailErr) {
        const mailMsg = mailErr?.response?.data?.message || mailErr.message;
        return errorResponse(res, `Failed to send project creation mail: ${mailMsg}`, null, 500);
      }
    }

    order.salesPipelineStatus = salesPipelineStatus;
    order.salesPipelineLogs.push({
      fromStage: oldStage,
      toStage: salesPipelineStatus,
      movedBy,
      handlerName: order.salesHandlerName || "",
      movedAt: new Date(),
    });

    if (projectMailResult) {
      const { toArr, ccArr, subject: finalSubject } = projectMailResult;
      order.projectMailLogs.push({
        sentTo: toArr.join(", "),
        sentCc: ccArr.join(", "),
        subject: finalSubject,
        sentBy: movedBy,
        sentAt: new Date(),
        isResend: false,
      });
      order.salesPipelineLogs.push({
        fromStage: salesPipelineStatus,
        toStage: salesPipelineStatus,
        movedBy,
        handlerName: order.salesHandlerName || "",
        movedAt: new Date(),
        notes: `Project mail sent to ${toArr.join(", ")}`,
      });
    }

    await order.save();
    return successResponse(res, "Sales pipeline updated successfully", { order });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};

// Builds the Zoho project-code creation mail payload and posts it to the
// mail service. Used both by the manual "Raise Project Creation Mail"
// button and by the automatic mail fired when an order moves from
// Order Confirmation (closedWon) to Project Code Creation.
async function sendProjectCreationMail({ order, to, cc, subject, additionalNotes }) {
  const subtotal = order.bookingItems.reduce(
    (s, i) => s + (i.totalAmount || 0),
    0
  );
  const totalNegotiated = order.salesNegotiationArray.reduce(
    (s, n) => s + (n.amount || 0),
    0
  );
  const taxable = subtotal;
  const gstAmt = Math.floor(taxable * 0.18);
  const finalAmt = taxable + gstAmt;

  const latestPoEntry =
    order.closedWonArray && order.closedWonArray.length > 0
      ? order.closedWonArray[order.closedWonArray.length - 1]
      : null;

  const poDocumentPath = latestPoEntry?.salesPoDocument || "";

  const vehicleTypeIds = [
    ...new Set(
      order.bookingItems
        .map((item) => item.vehicleType)
        .filter(Boolean)
    ),
  ];

  const vehicleTypeDocs = await vehicletypes.find({
    _id: { $in: vehicleTypeIds },
  });

  const vehicleTypeMap = {};
  vehicleTypeDocs.forEach((vt) => {
    vehicleTypeMap[vt._id.toString()] = vt.typeName;
  });

  const orders = order.bookingItems.map((item) => ({
    vehicleType: vehicleTypeMap[item.vehicleType?.toString()] || item.vehicleType || "",
    vehicleModel: item.vehicleModel || "",
    campaignType:
      item.campaignType === "Other"
        ? item.otherCampaignType || "Other"
        : item.campaignType || "",
    fromDate: item.fromDate
      ? new Date(item.fromDate).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      : "",
    toDate: item.toDate
      ? new Date(item.toDate).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      : "",
    startDate: item.fromDate || "",
    endDate: item.toDate || "",
    totalDays: item.totalDays || 0,
    campaignLocation: item.campaignLocation || "",
    fromLocation: item.campaignLocation || "",
    toLocation: item.toLocation || "",
    state: item.state || "",
    city: item.city || "",
    vehicleCount: item.quantity || 1,
    rental: item.rentalCost || 0,
    rtoCharges: item.rtoCost || 0,
    extraKm: item.extraKmCost || 0,
    extraKmCost: item.extraKmCost || 0,
    extraHours: item.extraHourCost || 0,
    extraHourCost: item.extraHourCost || 0,
    promotorCharges: item.promoterCost || 0,
    additionalCharges: item.additionalNet || 0,
    subtotal: item.subtotal || 0,
    totalAmount: item.totalAmount || 0,
    needPromoter: item.needPromoter || false,
    promoterType: item.promoterType || "",
    promoterGender: item.promoterGender || "",
    promoterLanguage: Array.isArray(item.promoterLanguage)
      ? item.promoterLanguage.join(", ")
      : item.promoterLanguage || "",
    promoterQuantity: item.promoterQuantity || 0,
  }));

  const form = new FormData();

  const finalSubject =
    subject || `Project Code Creation Request - ${order.orderId} - ${order.name}`;

  const scalarFields = {
    mailtype: "roadshowprojector",
    subject: finalSubject,
    customerType: order.customerType,
    userName: order.name,
    userEmail: order.email || "",
    userContactNumber: order.phone,
    orderId: order.orderId,
    orderDate: new Date(order.createdAt).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    gstNumber: order.gstNumber || "",
    companyName: order.companyName || "",
    designation: order.designation || "",
    salesHandlerName: order.salesHandlerName || "",
    additionalNotes: additionalNotes || "",
    subtotal,
    discount: totalNegotiated,
    taxable,
    gst: gstAmt,
    totalAmount: finalAmt,
  };

  Object.entries(scalarFields).forEach(([key, value]) => {
    form.append(key, String(value));
  });

  const toArr = Array.isArray(to)
    ? to.flatMap((e) => e.split(",").map((x) => x.trim())).filter(Boolean)
    : String(to || "").split(",").map((e) => e.trim()).filter(Boolean);

  const ccArr = cc
    ? Array.isArray(cc)
      ? cc.flatMap((e) => e.split(",").map((x) => x.trim())).filter(Boolean)
      : String(cc).split(",").map((e) => e.trim()).filter(Boolean)
    : [];

  if (toArr.length === 0) {
    throw new Error("Project creation mail requires at least one recipient");
  }

  toArr.forEach((email) => form.append("to[]", email));
  ccArr.forEach((email) => form.append("cc[]", email));

  form.append("orders", JSON.stringify(orders));

  if (poDocumentPath) {
    if (poDocumentPath.startsWith("http")) {
      const fileResponse = await axios.get(poDocumentPath, {
        responseType: "stream",
      });

      const fileName = path.basename(new URL(poDocumentPath).pathname);

      form.append("poDocument", fileResponse.data, {
        filename: fileName,
        contentType:
          fileResponse.headers["content-type"] ||
          "application/octet-stream",
      });
    } else {
      const absolutePath = path.join(
        __dirname,
        "../../public",
        poDocumentPath
      );
      if (fs.existsSync(absolutePath)) {
        form.append(
          "poDocument",
          fs.createReadStream(absolutePath),
          path.basename(absolutePath)
        );
      }
    }
  }

  const mailResponse = await axios.post(
    process.env.CODECREATION_API_URL,
    form,
    { headers: form.getHeaders() }
  );

  if (mailResponse.data?.status !== "success") {
    throw new Error(mailResponse.data?.message || "Mail sending failed");
  }

  return { toArr, ccArr, subject: finalSubject };
}

exports.uploadStageDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      stage,
      amount,
      salesPoNotes,
      proposalNotes,
      analysisNotes,
      negotiationNotes,
    } = req.body;

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Sales order not found", null, 404);

    const uploadedBy = order.salesHandlerName;
    const uploadedFiles = req.files || [];

 
    const stageFileLabels = {
      enquiryDocument: "Enquiry",
      analysisDocument: "Need Analysis",
      proposalDocument: "Proposal",
      negotiationDocument: "Negotiation",
      salesPoDocument: "Sales PO",
      poCommentDocument: "PO Comment",
      projectCodeCommentDocument: "Project Code Comment",
      salesFinalClosedWonDocument: "Closed Won Comment",
      closedLostCommentDocument: "Closed Lost Comment",
    };
    for (const file of uploadedFiles) {
      const label = stageFileLabels[file.fieldname] || file.fieldname;
      const err = validateFile(file, label);
      if (err) return errorResponse(res, err, null, 400);
    }


    if (stage === "enquiry") {
      const enquiryFile = uploadedFiles.find(
        (f) => f.fieldname === "enquiryDocument"
      );
      const enquiryNotes = req.body.enquiryNotes || "";
      const enquiryName = req.body.enquiryName || "";
      const docPath = getFilePath(enquiryFile);
      if (!docPath && !enquiryNotes)
        return errorResponse(res, "Provide document or notes", null, 400);

      if (enquiryName.trim()) {
        order.enquiryName = enquiryName.trim();
      }
      order.enquiryArray.push({
        document: docPath,
        notes: enquiryNotes.trim(),
        uploadedBy: enquiryName.trim() || "Guest",
        uploadedAt: new Date(),
      });
    }



    if (stage === "needAnalysis") {
      const analysisFile = uploadedFiles.find(
        (f) => f.fieldname === "analysisDocument"
      );
      const docPath = getFilePath(analysisFile);
      if (!docPath && !analysisNotes)
        return errorResponse(res, "Provide document or notes", null, 400);
      order.needAnalysisArray.push({
        analysisDocument: docPath,
        notes: (analysisNotes || "").trim(),
        uploadedBy,
        uploadedAt: new Date(),
      });
    }


    if (stage === "proposalPriceQuote") {
      const proposalFile = uploadedFiles.find(
        (f) => f.fieldname === "proposalDocument"
      );
      const docPath = getFilePath(proposalFile);
      if (!docPath && !proposalNotes)
        return errorResponse(res, "Provide document or notes", null, 400);
      order.proposalArray.push({
        proposalDocument: docPath,
        notes: (proposalNotes || "").trim(),
        uploadedBy,
        uploadedAt: new Date(),
      });
    }

    if (stage === "negotiationReview") {
      const negotiationFile = uploadedFiles.find(
        (f) => f.fieldname === "negotiationDocument"
      );
      const negotiationAmount = Number(amount) || 0;
      const docPath = getFilePath(negotiationFile);
      if (!docPath && negotiationAmount === 0 && !negotiationNotes)
        return errorResponse(
          res,
          "Provide document, amount, or notes",
          null,
          400
        );
      order.salesNegotiationArray.push({
        document: docPath,
        notes: (negotiationNotes || "").trim(),
        amount: negotiationAmount,
        uploadedBy,
        uploadedAt: new Date(),
      });
      const totalNegotiated = order.salesNegotiationArray.reduce(
        (sum, n) => sum + (n.amount || 0),
        0
      );
      order.salesNegotiationFinalAmount = Math.max(
        order.grandTotal - totalNegotiated,
        0
      );
    }

if (stage === "closedWon") {


  const poCommentFile = uploadedFiles.find(f => f.fieldname === "poCommentDocument");
  const poCommentNotes = req.body.poCommentNotes || "";
  if (poCommentFile || poCommentNotes) {
    order.poCommentsArray.push({
      document: getFilePath(poCommentFile),
      notes: poCommentNotes.trim(),
      uploadedBy,
      uploadedAt: new Date(),
    });
  }
}


    if (stage === "projectCodeCreation") {
      const pcFile = uploadedFiles.find(
        (f) => f.fieldname === "projectCodeCommentDocument"
      );
      const pcNotes = req.body.projectCodeCommentNotes || "";
      if (!getFilePath(pcFile) && !pcNotes)
        return errorResponse(res, "Provide document or notes", null, 400);
      order.projectCodeCommentsArray.push({
        document: getFilePath(pcFile),
        notes: pcNotes.trim(),
        uploadedBy,
        uploadedAt: new Date(),
      });
    }

    if (stage === "salesFinalClosedWon") {
      // Notes, document, and image are all optional here — no restriction.
      const fcwFile = uploadedFiles.find(
        (f) => f.fieldname === "salesFinalClosedWonDocument"
      );
      const fcwNotes = req.body.salesFinalClosedWonNotes || "";
      if (fcwFile || fcwNotes) {
        order.salesFinalClosedWonArray.push({
          document: getFilePath(fcwFile),
          notes: fcwNotes.trim(),
          uploadedBy,
          uploadedAt: new Date(),
        });
      }
    }

   if (stage === "closedLost") {
  const clFile = uploadedFiles.find(f => f.fieldname === "closedLostCommentDocument");
  const clNotes = req.body.closedLostCommentNotes || "";
  if (clFile || clNotes) {
    order.closedLostCommentsArray.push({
      document: getFilePath(clFile),
      notes: clNotes.trim(),
      uploadedBy: order.salesHandlerName || req.user.username,
      uploadedAt: new Date(),
    });
  }
}

    // if (stage === "closedWon") {
    //   const poFile = uploadedFiles.find(
    //     (f) => f.fieldname === "salesPoDocument"
    //   );
    //   if (!poFile) return errorResponse(res, "PO document required", null, 400);
    //   order.closedWonArray.push({
    //     salesPoDocument: getFilePath(poFile),
    //     salesPoNotes: (salesPoNotes || "").trim(),
    //     uploadedBy,
    //     uploadedAt: new Date(),
    //     reason: reason.trim(),
    //     document: getFilePath(lostFile),
    //     uploadedBy: order.salesHandlerName || req.user.username,
    //     uploadedAt: new Date(),
    //   });
    // }

    await order.save();
    return successResponse(res, "Document uploaded successfully", { order });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};




exports.sendProjectMail = async (req, res) => {
  try {
    const { id } = req.params;
    const { to, cc, additionalNotes, subject } = req.body;

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const isResend = order.projectMailLogs && order.projectMailLogs.length > 0;

    let toArr, ccArr, finalSubject;
    try {
      ({ toArr, ccArr, subject: finalSubject } = await sendProjectCreationMail({
        order,
        to,
        cc,
        subject,
        additionalNotes,
      }));
    } catch (mailErr) {
      return errorResponse(
        res,
        mailErr?.response?.data?.message || mailErr.message,
        null,
        500
      );
    }

    const sentBy =
      req.user?.username || order.salesHandlerName || "Admin";

    order.projectMailLogs.push({
      sentTo: toArr.join(", "),
      sentCc: ccArr.join(", "),
      subject: finalSubject,
      sentBy,
      sentAt: new Date(),
      isResend,
    });

    order.salesPipelineLogs.push({
      fromStage: order.salesPipelineStatus,
      toStage: order.salesPipelineStatus,
      movedBy: sentBy,
      handlerName: order.salesHandlerName || "",
      movedAt: new Date(),
      notes: isResend
        ? `Project mail resent to ${toArr.join(", ")}`
        : `Project mail sent to ${toArr.join(", ")}`,
    });

    await order.save();

    return successResponse(res, "Project creation mail sent successfully", {
      isResend,
      mailLog: order.projectMailLogs[order.projectMailLogs.length - 1],
      totalSentCount: order.projectMailLogs.length,
    });
  } catch (error) {
    console.error(
      "sendProjectMail error:",
      error?.response?.data || error.message
    );
    return errorResponse(res, error.message, null, 500);
  }
};


exports.saveProjectCode = async (req, res) => {
  try {
    const { id } = req.params;
    const { projectCode, estimationCode } = req.body;

    if (!projectCode?.trim())
      return errorResponse(res, "Project code is required", null, 400);
    if (!estimationCode?.trim())
      return errorResponse(res, "Estimation code is required", null, 400);

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const duplicateProjectCode = await Order.findOne({
      _id: { $ne: id },
      "projectCodeArray.projectCode": projectCode.trim(),
    });
    if (duplicateProjectCode)
      return errorResponse(res, "Project code already registered", null, 409);

    const duplicateEstimationCode = await Order.findOne({
      _id: { $ne: id },
      "projectCodeArray.estimationCode": estimationCode.trim(),
    });
    if (duplicateEstimationCode)
      return errorResponse(res, "Estimation code already registered", null, 409);

    const savedBy = req.user?.username || order.salesHandlerName || "Admin";

    order.projectCodeArray.push({
      projectCode: projectCode.trim(),
      estimationCode: estimationCode.trim(),
      savedBy,
      savedAt: new Date(),
    });

    order.salesPipelineLogs.push({
      fromStage: order.salesPipelineStatus,
      toStage: order.salesPipelineStatus,
      movedBy: savedBy,
      handlerName: order.salesHandlerName || "",
      movedAt: new Date(),
      notes: `Project Code: ${projectCode.trim()} | Estimation Code: ${estimationCode.trim()}`,
    });

    await order.save();

    return successResponse(res, "Project code saved successfully", {
      projectCodeArray: order.projectCodeArray,
    });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};


exports.saveEnquiryName = async (req, res) => {
  try {
    const { id } = req.params;
    const { enquiryName } = req.body;

    if (!enquiryName?.trim())
      return errorResponse(res, "Enquiry name is required", null, 400);

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    order.enquiryName = enquiryName.trim();
    await order.save();

    return successResponse(res, "Enquiry name saved", {
      enquiryName: order.enquiryName,
    });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};


// Reassign the sales/order handler — used for leave handovers (temporary)
// or permanent reassignment. Every change is logged in handlerAssignmentHistory.
exports.reassignHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { newHandler, isTemporary, leaveStartDate, leaveEndDate, reason } = req.body;

    if (!newHandler?.trim())
      return errorResponse(res, "New handler name is required", null, 400);
    if (!reason?.trim())
      return errorResponse(res, "Reason is required", null, 400);
    if (isTemporary && (!leaveStartDate || !leaveEndDate))
      return errorResponse(
        res,
        "Leave start and end dates are required for a temporary handover",
        null,
        400
      );

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const previousHandler = order.salesHandlerName || "";
    if (!order.originalSalesHandlerName) {
      order.originalSalesHandlerName = previousHandler;
    }

    order.handlerAssignmentHistory.push({
      previousHandler,
      newHandler: newHandler.trim(),
      isTemporary: !!isTemporary,
      leaveStartDate: isTemporary ? leaveStartDate : null,
      leaveEndDate: isTemporary ? leaveEndDate : null,
      reason: reason.trim(),
      status: "active",
      assignedBy: req.user?.username || "Admin",
      assignedAt: new Date(),
    });

    order.salesHandlerName = newHandler.trim();
    await order.save();

    return successResponse(res, "Handler reassigned successfully", {
      salesHandlerName: order.salesHandlerName,
      handlerAssignmentHistory: order.handlerAssignmentHistory,
    });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};



exports.resolveHandlerHandover = async (req, res) => {
  try {
    const { id, assignmentId } = req.params;
    const { makePermanent } = req.body;

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const assignment = order.handlerAssignmentHistory.id(assignmentId);
    if (!assignment)
      return errorResponse(res, "Handover record not found", null, 404);
    if (assignment.status !== "active")
      return errorResponse(res, "This handover has already been resolved", null, 400);

    if (makePermanent) {
      assignment.status = "madePermanent";
    } else {
      assignment.status = "reverted";
      assignment.revertedAt = new Date();
      order.salesHandlerName = assignment.previousHandler;
    }

    await order.save();

    return successResponse(res, "Handover resolved", {
      salesHandlerName: order.salesHandlerName,
      handlerAssignmentHistory: order.handlerAssignmentHistory,
    });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};


exports.updatePODocument = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    if (
      order.salesPipelineStatus === "projectCodeCreation" ||
      (order.projectCodeArray || []).length > 0
    ) {
      return errorResponse(
        res,
        "PO document can no longer be edited once Project Code has been created",
        null,
        400
      );
    }

    const { reason } = req.body;
    if (!reason?.trim())
      return errorResponse(res, "Reason for correction is required", null, 400);

    const poFile = (req.files || []).find((f) => f.fieldname === "poDocument");
    if (!poFile)
      return errorResponse(res, "PO document file is required", null, 400);

    const err = validateFile(poFile, "PO");
    if (err) return errorResponse(res, err, null, 400);

    if (order.closedWonArray.length === 0)
      return errorResponse(res, "No PO document exists yet to correct", null, 400);

    const latest = order.closedWonArray[order.closedWonArray.length - 1];
    const previousDocument = latest.salesPoDocument;

    const newDocPath = getFilePath(poFile);
    const editedBy = req.user?.username || order.salesHandlerName || "Admin";
    const editedAt = new Date();

    order.poDocumentEditHistory.push({
      document: newDocPath,
      previousDocument,
      reason: reason.trim(),
      editedBy,
      editedAt,
    });

    latest.salesPoDocument = newDocPath;

    await order.save();

    return successResponse(res, "PO document updated successfully", {
      closedWonArray: order.closedWonArray,
      poDocumentEditHistory: order.poDocumentEditHistory,
    });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};