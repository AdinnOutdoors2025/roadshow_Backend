
const Vehicle = require("../../Models/entryVehicles");


const fs = require("fs");



// @desc    Create a new vehicle entry
// @route   POST /entryVehicles
const createVehicle = async (req, res) => {
  try {
    const { vehicleNumber, model, speaker, speakerNos, generator, generatorNos } = req.body;
 
    // Validate required fields
    if (!vehicleNumber || !model) {
      // Clean up uploaded files if validation fails
      if (req.files && req.files.length > 0) {
        req.files.forEach((file) => fs.unlinkSync(file.path));
      }
      return res.status(400).json({
        status: "error",
        message: "Vehicle number and model are required",
      });
    }
 
    // Validate vehicle number format
    const regex = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}$/i;
    if (!regex.test(vehicleNumber)) {
      if (req.files && req.files.length > 0) {
        req.files.forEach((file) => fs.unlinkSync(file.path));
      }
      return res.status(400).json({
        status: "error",
        message: "Invalid vehicle number format",
      });
    }
 
    // Check if model already exists
    const existingModel = await Vehicle.findOne({ model });
 
    let imagePaths = [];
 
    if (existingModel) {
      // Model exists → reuse its images
      imagePaths = existingModel.images || [];
 
      // Delete newly uploaded files (not needed)
      if (req.files && req.files.length > 0) {
        req.files.forEach((file) => fs.unlinkSync(file.path));
      }
    } else {
      // New model → save uploaded image paths
      imagePaths = req.files.map(
        (file) =>
          `public/uploads/${model.trim().replace(/\s+/g, "_")}/${file.filename}`
      );
    }
 
    const newVehicle = new Vehicle({
      vehicleNumber,
      model,
      images: imagePaths,
      speaker,
      speakerNos: speakerNos || null,
      generator,
      generatorNos: generatorNos || null,
    });
 
    await newVehicle.save();
 
    res.status(201).json({
      status: "success",
      message: existingModel
        ? "Vehicle added (images inherited from existing model)"
        : "Vehicle created successfully with images",
      data: newVehicle,
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};



// @desc    Update a vehicle by ID
// @route   PUT updateVehicle/:id
const updateVehicle = async (req, res) => {
  try {
    const { vehicleNumber, model, speaker, speakerNos, generator, generatorNos } = req.body;
    const vehicleId = req.params.id;
 
    if (!vehicleNumber || !model) {
      return res.status(400).json({
        status: "error",
        message: "Vehicle number and model are required",
      });
    }
 
    // Check if the same model exists in OTHER records
    const existingModel = await Vehicle.findOne({
      model,
      _id: { $ne: vehicleId },
    });
 
    let imagePaths = [];
 
    if (req.files && req.files.length > 0) {
      // New images uploaded → update all vehicles with this model
      imagePaths = req.files.map(
        (file) =>
          `public/uploads/${model.trim().replace(/\s+/g, "_")}/${file.filename}`
      );
      await Vehicle.updateMany({ model }, { $set: { images: imagePaths } });
    } else if (existingModel) {
      // No new images → inherit from existing model
      imagePaths = existingModel.images || [];
    }
 
    const updatedVehicle = await Vehicle.findByIdAndUpdate(
      vehicleId,
      {
        vehicleNumber,
        model,
        images: imagePaths,
        speaker,
        speakerNos: speakerNos || null,
        generator,
        generatorNos: generatorNos || null,
      },
      { new: true }
    );
 
    if (!updatedVehicle) {
      return res.status(404).json({ status: false, message: "Vehicle not found" });
    }
 
    res.json({
      status: true,
      message:
        req.files && req.files.length > 0
          ? "Vehicle and model images updated successfully"
          : existingModel
          ? "Vehicle updated (images inherited from existing model)"
          : "Vehicle updated successfully",
      vehicle: updatedVehicle,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// @desc    Get all vehicles
// @route   GET /getVehicles
const getVehicles = async (req, res) => {
  try {
    const vehicles = await Vehicle.find().sort({ createdAt: -1 });
    res.json({ status: true, data: vehicles });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// @desc    Delete a vehicle by ID
// @route   DELETE deleteVehicle/:id
const deleteVehicle = async (req, res) => {
  try {
    const deleted = await Vehicle.findByIdAndDelete(req.params.id);
 
    if (!deleted) {
      return res.status(404).json({ status: false, message: "Vehicle not found" });
    }
 
    res.json({ status: true, message: "Deleted successfully" });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

module.exports = {
  createVehicle,
  getVehicles,
  updateVehicle,
  deleteVehicle,
};
