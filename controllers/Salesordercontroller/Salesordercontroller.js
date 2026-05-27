// controllers/SalesPipelineController/salesPipelineController.js
const path = require("path");
const Order = require("../../Models/AdminorderModel/Adminorder");
const { successResponse, errorResponse } = require("../../Utils/response");

// ── Stage order ─────────────────────────────────────────────────────────────
const SALES_STAGE_ORDER = [
  "enquiry",
  "needAnalysis",
  "proposalPriceQuote",
  "negotiationReview",
  "closedWon",
  "projectCodeCreation",
  "closedLost",
];



// ── GET /sales/pipeline ──────────────────────────────────────────────────────
exports.getSalesPipeline = async (req, res) => {
  try {

    const orders = await Order.find({ pipelineStatus: "newOrder" })
      .sort({ createdAt: -1 })
      .lean();

    // Group by stage
    const grouped = {};
    SALES_STAGE_ORDER.forEach((s) => (grouped[s] = []));

    orders.forEach((o) => {

      const stage = o.salesPipelineStatus || "enquiry";
      if (grouped[stage]) {
        grouped[stage].push(o);
      } else {
        grouped["enquiry"].push(o);
      }
    });


    // console.log('Stages count:', 
    //   Object.entries(grouped).map(([k,v]) => `${k}: ${v.length}`).join(', ')
    // );

    return successResponse(res, "Sales pipeline fetched", {
      grouped,
      stages: SALES_STAGE_ORDER,
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

// ── GET /sales/pipeline/:orderId ─────────────────────────────────────────────
exports.getSalesOrderById = async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return errorResponse(res, "Sales order not found", null, 404);
    return successResponse(res, "Sales order fetched", { order });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

// ── PATCH /sales/pipeline/:id ────────────────────────────────────────────────
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

    // ── Determine who is moving ──────────────────────────────────────────
    const isStaffAdmin = Number(req.user.isAdmin) === 0;
    // const movedBy = isStaffAdmin ? req.user.username : (handlerName || req.user.username || "Admin");
    const movedBy = req.user.username || "Admin";

    const uploadedFiles = req.files || [];


    // ── ENQUIRY → NEED ANALYSIS ──────────────────────────────────────────
    if (salesPipelineStatus === "needAnalysis" && oldStage === "enquiry") {

      if (isStaffAdmin) {
        order.salesHandlerName = req.user.username;
      } else {
        if (!handlerName?.trim()) {

          return errorResponse(res, "Handler name is required", null, 400);
        }

        let finalHandler = handlerName.trim();
        if (finalHandler.startsWith('__superadmin__')) {
          finalHandler = finalHandler.replace('__superadmin__', '');
        }

        order.salesHandlerName = finalHandler;
      }
    }

    // ── NEED ANALYSIS: save documents if uploaded ────────────────────────
    if (salesPipelineStatus === "needAnalysis" || oldStage === "needAnalysis") {
      const analysisFile = uploadedFiles.find((f) => f.fieldname === "analysisDocument");
      if (analysisFile || analysisNotes) {
        const docPath = analysisFile ? `/uploads/${path.basename(analysisFile.path)}` : "";
        order.needAnalysisArray.push({
          analysisDocument: docPath,
          notes: (analysisNotes || "").trim(),
          uploadedBy: order.salesHandlerName,
          uploadedAt: new Date(),
        });
      }
    }

    // ── PROPOSAL: save documents if uploaded ────────────────────────────
    if (salesPipelineStatus === "proposalPriceQuote" || oldStage === "proposalPriceQuote") {
      const proposalFile = uploadedFiles.find((f) => f.fieldname === "proposalDocument");
      if (proposalFile || proposalNotes) {
        const docPath = proposalFile ? `/uploads/${path.basename(proposalFile.path)}` : "";
        order.proposalArray.push({
          proposalDocument: docPath,
          notes: (proposalNotes || "").trim(),
          uploadedBy: order.salesHandlerName,
          uploadedAt: new Date(),
        });
      }
    }

    // ── NEGOTIATION: save amount + documents ─────────────────────────────
    if (salesPipelineStatus === "negotiationReview" || oldStage === "negotiationReview") {
      const negotiationFile = uploadedFiles.find((f) => f.fieldname === "negotiationDocument");
      const negotiationAmount = Number(amount) || 0;
      if (negotiationFile || negotiationAmount > 0 || negotiationNotes) {
        const docPath = negotiationFile ? `/uploads/${path.basename(negotiationFile.path)}` : "";
        order.salesNegotiationArray.push({
          document: docPath,
          notes: (negotiationNotes || "").trim(),
          amount: negotiationAmount,
          uploadedBy: order.salesHandlerName,
          uploadedAt: new Date(),
        });

        // Recalculate negotiation final amount
        const totalNegotiated = order.salesNegotiationArray.reduce(
          (sum, n) => sum + (n.amount || 0), 0
        );
        order.salesNegotiationFinalAmount = Math.max(order.grandTotal - totalNegotiated, 0);
      }
    }

    // ── CLOSED WON: require PO document ─────────────────────────────────
    if (salesPipelineStatus === "closedWon") {
      const poFile = uploadedFiles.find((f) => f.fieldname === "salesPoDocument");
      if (!poFile)
        return errorResponse(res, "Sales PO document is required to close won", null, 400);
      const docPath = `/uploads/${path.basename(poFile.path)}`;
      order.closedWonArray.push({
        salesPoDocument: docPath,
        salesPoNotes: (salesPoNotes || "").trim(),
        uploadedBy: order.salesHandlerName,
        uploadedAt: new Date(),
      });
    }

    // ── PROJECT CODE CREATION ────────────────────────────────────────────
    if (salesPipelineStatus === "projectCodeCreation") {
      const { projectCode, estimationCode } = req.body;
      if (!projectCode?.trim() || !estimationCode?.trim()) {
        return errorResponse(res, "Project Code and Estimation Code are required", null, 400);
      }
      order.projectCodeCreationArray.push({
        projectCode: projectCode.trim(),
        estimationCode: estimationCode.trim(),
        uploadedBy: order.salesHandlerName || movedBy,
        uploadedAt: new Date(),
      });
    }


    // ── CLOSED LOST: require reason ──────────────────────────────────────
    if (salesPipelineStatus === "closedLost") {
      if (!reason?.trim())
        return errorResponse(res, "Reason is required for closing lost", null, 400);
      const lostFile = uploadedFiles.find((f) => f.fieldname === "closedLostDocument");
      const docPath = lostFile ? `/uploads/${path.basename(lostFile.path)}` : "";
      order.closedLostArray.push({
        reason: reason.trim(),
        document: docPath,
        uploadedBy: order.salesHandlerName,
        uploadedAt: new Date(),
      });
    }

    // ── Update stage & log ───────────────────────────────────────────────
    order.salesPipelineStatus = salesPipelineStatus;
    order.salesPipelineLogs.push({
      fromStage: oldStage,
      toStage: salesPipelineStatus,
      movedBy,
      handlerName: order.salesHandlerName || "",
      movedAt: new Date(),
    });

    await order.save();

    return successResponse(res, "Sales pipeline updated successfully", { order });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};

// ── POST /sales/pipeline/:id/documents ── Upload docs without moving stage ──
exports.uploadStageDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { stage, notes, amount, reason, salesPoNotes, proposalNotes, analysisNotes, negotiationNotes } = req.body;

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Sales order not found", null, 404);

    const isStaffAdmin = Number(req.user.isAdmin) === 0;
    // const uploadedBy = isStaffAdmin ? req.user.username : (req.user.username || "Admin");
    const uploadedBy = order.salesHandlerName
    const uploadedFiles = req.files || [];

    if (stage === "needAnalysis") {
      const analysisFile = uploadedFiles.find((f) => f.fieldname === "analysisDocument");
      const docPath = analysisFile ? `/uploads/${path.basename(analysisFile.path)}` : "";
      if (!docPath && !analysisNotes) return errorResponse(res, "Provide document or notes", null, 400);
      order.needAnalysisArray.push({
        analysisDocument: docPath,
        notes: (analysisNotes || "").trim(),
        uploadedBy,
        uploadedAt: new Date(),
      });
    }

    if (stage === "proposalPriceQuote") {
      const proposalFile = uploadedFiles.find((f) => f.fieldname === "proposalDocument");
      const docPath = proposalFile ? `/uploads/${path.basename(proposalFile.path)}` : "";
      if (!docPath && !proposalNotes) return errorResponse(res, "Provide document or notes", null, 400);
      order.proposalArray.push({
        proposalDocument: docPath,
        notes: (proposalNotes || "").trim(),
        uploadedBy,
        uploadedAt: new Date(),
      });
    }

    if (stage === "negotiationReview") {
      const negotiationFile = uploadedFiles.find((f) => f.fieldname === "negotiationDocument");
      const negotiationAmount = Number(amount) || 0;
      const docPath = negotiationFile ? `/uploads/${path.basename(negotiationFile.path)}` : "";
      if (!docPath && negotiationAmount === 0 && !negotiationNotes)
        return errorResponse(res, "Provide document, amount, or notes", null, 400);
      order.salesNegotiationArray.push({
        document: docPath,
        notes: (negotiationNotes || "").trim(),
        amount: negotiationAmount,
        uploadedBy,
        uploadedAt: new Date(),
      });
      const totalNegotiated = order.salesNegotiationArray.reduce((sum, n) => sum + (n.amount || 0), 0);
      order.salesNegotiationFinalAmount = Math.max(order.grandTotal - totalNegotiated, 0);
    }
    // 1

    if (stage === "closedWon") {
      const poFile = uploadedFiles.find((f) => f.fieldname === "salesPoDocument");
      if (!poFile) return errorResponse(res, "PO document required", null, 400);
      const docPath = `/uploads/${path.basename(poFile.path)}`;
      order.closedWonArray.push({
        salesPoDocument: docPath,
        salesPoNotes: (salesPoNotes || "").trim(),
        uploadedBy,
        uploadedAt: new Date(),
      });
    }

    if (stage === "projectCodeCreation") {
  const { projectCode, estimationCode } = req.body;
  if (!projectCode?.trim() || !estimationCode?.trim()) {
    return errorResponse(res, "Project Code and Estimation Code are required", null, 400);
  }
  order.projectCodeCreationArray.push({
    projectCode: projectCode.trim(),
    estimationCode: estimationCode.trim(),
    uploadedBy,
    uploadedAt: new Date(),
  });
}

    await order.save();
    return successResponse(res, "Document uploaded successfully", { order });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};