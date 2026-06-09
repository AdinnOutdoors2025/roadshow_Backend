
require("dotenv").config();
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const FormData = require("form-data");
const Order = require("../../Models/AdminorderModel/Adminorder");
const vehicletypes = require("../../Models/VehicleTypeSchema");
const { successResponse, errorResponse } = require("../../Utils/response");

const STORAGE_TYPE = process.env.STORAGE_TYPE || "local";
const CDN_BASE_URL =
  process.env.DO_SPACES_CDN_BASE ||
  "https://adinn-space.sgp1.digitaloceanspaces.com";

const SALES_STAGE_ORDER = [
  "enquiry",
  "needAnalysis",
  "proposalPriceQuote",
  "negotiationReview",
  "closedWon",
  "projectCodeCreation",
  "closedLost",
];

const getFilePath = (file) => {
  if (!file) return "";
  if (STORAGE_TYPE === "space") {
    return file.location || "";
  }
  return `/uploads/${path.basename(file.path)}`;
};


exports.getSalesPipeline = async (req, res) => {
  try {
    const orders = await Order.find({ pipelineStatus: "todo" })
      .sort({ createdAt: -1 })
      .lean();

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

   
    const LOCKED_BACK_STAGES = ["enquiry", "needAnalysis"];
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
    const isStaffAdmin = Number(req.user.isAdmin) === 0;
    // const movedBy = order.salesHandlerName || "Admin";
    const movedBy = req.user?.username || order.salesHandlerName || "Admin";
    const uploadedFiles = req.files || [];


    if (salesPipelineStatus === "needAnalysis" && oldStage === "enquiry") {
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
      if (!poFile)
        return errorResponse(
          res,
          "Sales PO document is required to close won",
          null,
          400
        );
      order.closedWonArray.push({
        salesPoDocument: getFilePath(poFile),
        salesPoNotes: (salesPoNotes || "").trim(),
        uploadedBy: order.salesHandlerName,
        uploadedAt: new Date(),
      });
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
        uploadedBy: order.salesHandlerName,
        uploadedAt: new Date(),
      });
    }

    order.salesPipelineStatus = salesPipelineStatus;
    order.salesPipelineLogs.push({
      fromStage: oldStage,
      toStage: salesPipelineStatus,
      movedBy,
      handlerName: order.salesHandlerName || "",
      movedAt: new Date(),
    });

    await order.save();
    return successResponse(res, "Sales pipeline updated successfully", {
      order,
    });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};

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
      const poFile = uploadedFiles.find(
        (f) => f.fieldname === "salesPoDocument"
      );
      if (!poFile) return errorResponse(res, "PO document required", null, 400);
      order.closedWonArray.push({
        salesPoDocument: getFilePath(poFile),
        salesPoNotes: (salesPoNotes || "").trim(),
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




exports.sendProjectMail = async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to, cc, additionalNotes, subject } = req.body;

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const isResend = order.projectMailLogs && order.projectMailLogs.length > 0;


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
      fromLocation: item.fromLocation || "",
      toLocation: item.toLocation || "",
      state: item.state || "",
      city: item.city || "",
      quantity: item.quantity || 1,
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

    const scalarFields = {
      mailtype: "roadshowprojector",
      subject:
        subject ||
        `Project Code Creation Request - ${order.orderId} - ${order.name}`,
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
      : to.split(",").map((e) => e.trim()).filter(Boolean);


    const ccArr = cc
      ? Array.isArray(cc)
        ? cc.flatMap((e) => e.split(",").map((x) => x.trim())).filter(Boolean)
        : cc.split(",").map((e) => e.trim()).filter(Boolean)
      : [];
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


    if (
      mailResponse.data?.status !== "success"
    ) {
      return errorResponse(
        res,
        mailResponse.data?.message || "Mail sending failed",
        null,
        500
      );
    }



    const sentBy =
      req.user?.username || order.salesHandlerName || "Admin";

    order.projectMailLogs.push({
      sentTo: toArr.join(", "),
      sentCc: ccArr.join(", "),
      subject:
        subject ||
        `Project Code Creation Request - ${order.orderId} - ${order.name}`,
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

    const savedBy = req.user?.username || order.salesHandlerName || "Admin";

    order.projectCodeArray.push({
      projectCode:    projectCode.trim(),
      estimationCode: estimationCode.trim(),
      savedBy,
      savedAt: new Date(),
    });

    order.salesPipelineLogs.push({
      fromStage:   order.salesPipelineStatus,
      toStage:     order.salesPipelineStatus,
      movedBy:     savedBy,
      handlerName: order.salesHandlerName || "",
      movedAt:     new Date(),
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