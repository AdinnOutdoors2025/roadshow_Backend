const path = require("path");
const mongoose = require("mongoose");
const ClientRequest = require("../../Models/ClientRequestModel/Clientrequestmodel");
const GstDetail = require("../../Models/GstDetailsModel/gstdetails");

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const getIndiaDateRange = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  const year = values.year;
  const month = values.month;
  const day = values.day;
  const prefix = `${year}${month}${day}`;
  const start = new Date(`${year}-${month}-${day}T00:00:00+05:30`);
  const end = new Date(start.getTime() + MILLISECONDS_PER_DAY);

  return { prefix, start, end };
};

async function generateClientOrderId() {
  const { prefix, start, end } = getIndiaDateRange();

  const count = await ClientRequest.countDocuments({
    createdAt: { $gte: start, $lt: end },
  });

  return `${prefix}CRO#${count + 1}`;
}

const calculateTotalDays = (fromDate, toDate) => {
  const from = new Date(fromDate);
  const to = new Date(toDate);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error("A valid fromDate and toDate are required");
  }

  const fromUtc = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate()
  );
  const toUtc = Date.UTC(
    to.getUTCFullYear(),
    to.getUTCMonth(),
    to.getUTCDate()
  );

  if (fromUtc > toUtc) {
    throw new Error("fromDate cannot be after toDate");
  }

  return Math.floor((toUtc - fromUtc) / MILLISECONDS_PER_DAY) + 1;
};

const toNonNegativeNumber = (value) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const toStringArray = (value) =>
  Array.isArray(value)
    ? value
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

/**
 * Resolve a stored upload to a URL.
 *
 * Mirrors getFileUrl in the admin order controller: Spaces uploads carry an
 * absolute `location`, local disk uploads are served from /uploads.
 */
const getFileUrl = (file) => {
  if (!file) return null;
  if (file.location) return file.location;

  return `/uploads/${path.basename(file.path)}`;
};

/**
 * Campaign media for one vehicle line, keyed by position.
 *
 * The client posts `campaignImages_<index>` / `campaignVideos_<index>`, the
 * same convention admin order creation uses. Requests with no files at all
 * (the JSON path) get empty arrays and behave exactly as before.
 */
const collectMediaForIndex = (files, index) => {
  const uploaded = Array.isArray(files) ? files : [];

  return {
    campaignImages: uploaded
      .filter((file) => file.fieldname === `campaignImages_${index}`)
      .map(getFileUrl)
      .filter(Boolean),

    campaignVideos: uploaded
      .filter((file) => file.fieldname === `campaignVideos_${index}`)
      .map(getFileUrl)
      .filter(Boolean),
  };
};

/**
 * Normalizes the vehicle lines.
 *
 * Everything above the "campaign details" comment is unchanged from the
 * original implementation. The block below it is additive: each field falls
 * back to a neutral default, so a caller that sends none of them produces
 * exactly the same document it produced before.
 */
const normalizeVehicleTypes = (vehicleTypes, files) => {
  if (!Array.isArray(vehicleTypes) || vehicleTypes.length === 0) {
    throw new Error("vehicleTypes is required");
  }

  return vehicleTypes.map((vehicle, index) => {
    if (!vehicle.vehicleType) {
      throw new Error("Each vehicle requires vehicleType");
    }

    if (!vehicle.fromDate || !vehicle.toDate) {
      throw new Error("Each vehicle type must have fromDate and toDate");
    }

    const quantity = Number(vehicle.quantity);

    if (!Number.isFinite(quantity) || quantity < 1) {
      throw new Error("Each vehicle quantity must be at least 1");
    }

    const totalDays = calculateTotalDays(vehicle.fromDate, vehicle.toDate);

    /* Freshly uploaded media wins; otherwise keep whatever the caller
       already had (an update replaying stored URLs, for instance). */
    const media = collectMediaForIndex(files, index);

    const needPromoter = Boolean(vehicle.needPromoter);

    return {
      vehicleId: vehicle.vehicleId || undefined,
      vehicleType: vehicle.vehicleType,
      vehicleName: String(vehicle.vehicleName || "").trim(),
      quantity: Math.floor(quantity),
      campaignLocation: String(vehicle.campaignLocation || "").trim(),
      fromDate: vehicle.fromDate,
      toDate: vehicle.toDate,
      totalDays,
      pricePerDay: Number(vehicle.pricePerDay || 0),
      lineTotal: Number(vehicle.lineTotal || 0),

      /* ── Campaign details (additive) ─────────────────────────────────── */
      campaignType: String(vehicle.campaignType || "").trim(),
      otherCampaignType: String(vehicle.otherCampaignType || "").trim(),
      campaignName: String(vehicle.campaignName || "").trim(),

      needPromoter,
      /* The toggle being off zeroes the promoter block outright, so a
         client that sends stale values cannot smuggle a charge through. */
      promoterType: needPromoter
        ? String(vehicle.promoterType || "").trim()
        : "",
      otherPromoterType: needPromoter
        ? String(vehicle.otherPromoterType || "").trim()
        : "",
      promoterGender: needPromoter
        ? String(vehicle.promoterGender || "").trim()
        : "",
      promoterLanguage: needPromoter
        ? toStringArray(vehicle.promoterLanguage)
        : [],
      promoterQuantity: needPromoter
        ? Math.floor(toNonNegativeNumber(vehicle.promoterQuantity))
        : 0,
      promoterChargePerDay: needPromoter
        ? toNonNegativeNumber(vehicle.promoterChargePerDay)
        : 0,
      promoterCost: needPromoter
        ? toNonNegativeNumber(vehicle.promoterCost)
        : 0,

      rentalCost: toNonNegativeNumber(vehicle.rentalCost),
      rtoCost: toNonNegativeNumber(vehicle.rtoCost),

      campaignImages: media.campaignImages.length
        ? media.campaignImages
        : toStringArray(vehicle.campaignImages),

      campaignVideos: media.campaignVideos.length
        ? media.campaignVideos
        : toStringArray(vehicle.campaignVideos),
    };
  });
};

const populateClientRequest = (query) =>
  query
    .populate("userId", "name email phone")
    .populate("vehicleTypes.vehicleType", "name");

/**
 * Resolve the billing identity for a request.
 *
 * Company name, PAN and address are taken from the stored GST record, never
 * from the request body — the browser can claim a GST number, but only what
 * was actually verified gets persisted.
 */
const resolveBillingIdentity = async ({
  customerCategory,
  gstNumber,
  gstDetailId,
}) => {
  const isOrganization = customerCategory === "organization";

  if (!isOrganization) {
    return { customerCategory: "individual" };
  }

  let record = null;

  if (gstDetailId && mongoose.Types.ObjectId.isValid(gstDetailId)) {
    record = await GstDetail.findById(gstDetailId);
  }

  if (!record && gstNumber) {
    record = await GstDetail.findOne({
      gst_number: String(gstNumber).trim().toUpperCase(),
    });
  }

  if (!record) {
    throw new Error(
      "An organization request requires a verified GST number"
    );
  }

  if (record.status && record.status !== "Active") {
    throw new Error(
      `This GST registration is "${record.status}". An Active GSTIN is required.`
    );
  }

  return {
    customerCategory: "organization",
    gstDetailId: record._id,
    gstNumber: record.gst_number,
    companyName: record.business_name || "",
    panNumber: record.business_pan || "",
    address: record.business_address || "",
  };
};

/**
 * The request body, whether it arrived as JSON or multipart.
 *
 * Campaign media means the public flow now posts multipart/form-data, where
 * every value would otherwise be a string — so the whole body travels as one
 * JSON blob in a `payload` field. Requests without it (every existing caller,
 * including the admin panel and the previous review modal) fall straight
 * through to req.body untouched.
 */
const readRequestBody = (req) => {
  const payload = req.body?.payload;

  if (typeof payload !== "string") return req.body || {};

  try {
    return JSON.parse(payload);
  } catch {
    throw new Error("Invalid request payload");
  }
};

exports.createClientRequest = async (req, res) => {
  try {
    const body = readRequestBody(req);

    const {
      name,
      email,
      phone,
      userId,
      vehicleTypes,
      campaignType,
      location,
      route,
      addOns,
      subtotal,
      gstPercentage,
      gstAmount,
      estimatedTotal,
      customerCategory,
      gstNumber,
      gstDetailId,
      cgstAmount,
      sgstAmount,
      igstAmount,
      promoterTotal,
    } = body;

    // Validation
    if (!name || !phone || !userId) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid userId",
      });
    }

    const processedVehicleTypes = normalizeVehicleTypes(
      vehicleTypes,
      req.files
    );

    const billing = await resolveBillingIdentity({
      customerCategory,
      gstNumber,
      gstDetailId,
    });

    let clientRequest = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const clientOrderId = await generateClientOrderId();

      try {
        clientRequest = await ClientRequest.create({
          clientOrderId,
          name: String(name).trim(),
          email: String(email || "").trim().toLowerCase(),
          phone: String(phone).replace(/\D/g, ""),
          userId,
          campaignType:
            String(campaignType || "Roadshow Campaign").trim() ||
            "Roadshow Campaign",
          location: String(location || "").trim(),
          route: String(route || "").trim(),
          addOns: Array.isArray(addOns)
            ? addOns
                .filter((item) => typeof item === "string")
                .map((item) => item.trim())
                .filter(Boolean)
            : [],
          vehicleTypes: processedVehicleTypes,
          subtotal: Number(subtotal || 0),
          gstPercentage: Number(gstPercentage || 0),
          gstAmount: Number(gstAmount || 0),
          estimatedTotal: Number(estimatedTotal || 0),

          /* Presentation split of the same gstAmount above — see the model.
             Absent on requests from older callers, which keeps them at 0. */
          cgstAmount: toNonNegativeNumber(cgstAmount),
          sgstAmount: toNonNegativeNumber(sgstAmount),
          igstAmount: toNonNegativeNumber(igstAmount),

          /* Falls back to the sum of the lines when not sent explicitly */
          promoterTotal:
            toNonNegativeNumber(promoterTotal) ||
            processedVehicleTypes.reduce(
              (total, vehicle) => total + (vehicle.promoterCost || 0),
              0
            ),

          ...billing,
        });

        break;
      } catch (error) {
        if (error.code !== 11000 || attempt === 4) {
          throw error;
        }
      }
    }

    await clientRequest.populate([
      { path: "userId", select: "name email phone" },
      { path: "vehicleTypes.vehicleType", select: "name" },
    ]);

    return res.status(201).json({
      success: true,
      data: clientRequest.toObject(),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getAllClientRequests = async (req, res) => {
  try {
    const { status, userId, search } = req.query;
    const filter = {};

    if (status !== undefined) filter.status = Number(status);
    if (userId) filter.userId = userId;

    if (search) {
      const regex = new RegExp(search, "i");
      filter.$or = [
        { name: regex },
        { email: regex },
        { phone: regex },
        { clientOrderId: regex },
      ];
    }

    const requests = await populateClientRequest(
      ClientRequest.find(filter).sort({ createdAt: -1 })
    );

    return res.status(200).json({
      success: true,
      data: requests.map((request) => request.toObject()),
      count: requests.length,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get by ID
exports.getClientRequestById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid client request ID",
      });
    }

    const request = await populateClientRequest(
      ClientRequest.findById(req.params.id)
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Client request not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: request.toObject(),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update
exports.updateClientRequest = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid client request ID",
      });
    }

    const updateData = { ...readRequestBody(req) };
    delete updateData.clientOrderId;
    /* Never persisted — it is only the multipart envelope */
    delete updateData.payload;

    if (Array.isArray(updateData.vehicleTypes)) {
      updateData.vehicleTypes = normalizeVehicleTypes(
        updateData.vehicleTypes,
        req.files
      );
    }

    if (updateData.phone) {
      updateData.phone = String(updateData.phone).replace(/\D/g, "");
    }

    if (updateData.email) {
      updateData.email = String(updateData.email).trim().toLowerCase();
    }

    const updated = await ClientRequest.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      {
        new: true,
        runValidators: true
      }
    );
    
    if (!updated) {
      return res.status(404).json({ 
        success: false, 
        message: 'Client request not found' 
      });
    }

    await updated.populate([
      { path: "userId", select: "name email phone" },
      { path: "vehicleTypes.vehicleType", select: "name" },
    ]);

    return res.status(200).json({
      success: true,
      data: updated.toObject(),
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// Update status
exports.updateStatus = async (req, res) => {
  try {
    const status = Number(req.body.status);

    if (![0, 1, 2].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status value' 
      });
    }

    const updated = await ClientRequest.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ 
        success: false, 
        message: 'Client request not found' 
      });
    }

    return res.status(200).json({
      success: true,
      data: updated.toObject(),
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// Delete
exports.deleteClientRequest = async (req, res) => {
  try {
    const deleted = await ClientRequest.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ 
        success: false, 
        message: 'Client request not found' 
      });
    }
    res.status(200).json({ 
      success: true, 
      message: 'Deleted successfully' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};