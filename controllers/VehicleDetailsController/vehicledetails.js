const vehicleDetails = require("../../Models/vehicleDetails");



const createVehicle = async (req, res) => {
  try {
    const files = req.files || {};
    const { model, city, vehicleNumber } = req.body;

    // Same model + city 
    const existingVehicle = await vehicleDetails.findOne({ model, city });

    if (existingVehicle) {
      // ===== UPDATE =====
      const updatedVehicle = await vehicleDetails.findByIdAndUpdate(
        existingVehicle._id,
        {
          $inc: { vehicleCount: 1 },
          $push: { vehicleNumber: vehicleNumber },
        },
        { new: true }
      );

      return res.status(200).json({
        success: true,
        message: "Vehicle Updated Successfully (Same Model & City)",
        data: updatedVehicle,
      });
    }

    // ===== CREATE =====
    const vehicleData = {
      ...req.body,
      model,
      city,
      vehicleNumber: [vehicleNumber], // Array-ஆ save பண்ணு
      vehicleCount: 1,

      mainImage: files.mainImage?.map((f) => f.filename) || [],
      sideImages: files.sideImages?.map((f) => f.filename) || [],
      interiorImages: files.interiorImages?.map((f) => f.filename) || [],
      ledDisplayImage: files.ledDisplayImage?.map((f) => f.filename) || [],
      brandingSample: files.brandingSample?.map((f) => f.filename) || [],
      vehicleVideo: files.vehicleVideo?.map((f) => f.filename) || [],
    };

    const newVehicle = new vehicleDetails(vehicleData);
    const savedVehicle = await newVehicle.save();

    return res.status(201).json({
      success: true,
      message: "Vehicle Created Successfully",
      data: savedVehicle,
    });

  } catch (error) {
    console.error("Create Vehicle Error:", error);
    res.status(500).json({
      success: false,
      message: "Error Creating Vehicle",
      error: error.message,
    });
  }
};


const getNewVehicles = async (req, res) => {
  try {
    const vehicles = await vehicleDetails.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: vehicles.length,
      data: vehicles,
    });
  } catch (error) {
    console.error("Get Vehicles Error:", error);

    res.status(500).json({
      success: false,
      message: "Error Fetching Vehicles",
      error: error.message,
    });
  }
};

const updateVehicle = async (req, res) => {
  try {
    const { id } = req.params;
    const files = req.files || {};

    // ===== Validate ID =====
    const mongoose = require("mongoose");
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Vehicle ID",
      });
    }

    // ===== Existing vehicle check =====
    const existingVehicle = await vehicleDetails.findById(id);
    if (!existingVehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle Not Found",
      });
    }

    // ===== Build update object =====
    const updateData = { ...req.body };

    // Vehicle number handle
    if (req.body.vehicleNumber) {
      const nums = req.body.vehicleNumber
        .split(",")
        .map((n) => n.trim())
        .filter((n) => n);
      updateData.vehicleNumber = [...new Set(nums)];
      updateData.vehicleCount = updateData.vehicleNumber.length;
    }

    // Exclude system fields
    const excludeKeys = ["_id", "__v", "createdAt"];
    excludeKeys.forEach((key) => delete updateData[key]);

    // ===== Image fields handle =====
    const imageFields = [
      "mainImage",
      "sideImages",
      "interiorImages",
      "ledDisplayImage",
      "brandingSample",
      "vehicleVideo",
    ];

    imageFields.forEach((field) => {
      // Frontend sends existing image names
      if (req.body[field] !== undefined) {
        let existing = req.body[field];

        // Could be string or array
        if (typeof existing === "string") {
          existing = existing ? [existing] : [];
        } else if (Array.isArray(existing)) {
          existing = existing.filter((v) => v && v.trim());
        } else {
          existing = [];
        }

        updateData[field] = existing;
      } else {
        // If frontend didn't send, keep existing DB images
        updateData[field] = existingVehicle[field] || [];
      }

      // Append newly uploaded files
      if (files[field]?.length) {
        const newFiles = files[field].map((f) => f.filename);
        updateData[field] = [...(updateData[field] || []), ...newFiles];
      }
    });

    // ===== Update DB =====
    const updatedVehicle = await vehicleDetails.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: "Vehicle Updated Successfully",
      data: updatedVehicle,
    });

  } catch (error) {
    console.error("❌ Update Vehicle Error:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid Vehicle ID Format",
        error: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Error Updating Vehicle",
      error: error.message,
    });
  }
};
module.exports = {
  createVehicle,
  getNewVehicles,
  updateVehicle

};