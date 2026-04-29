
const vehicleData = require("../../Models/VehicleMainSchema");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const { v2: cloudinary } = require("cloudinary");
cloudinary.config({
  cloud_name: "dysuigknj",
  api_key: "133679639417399",
  api_secret: "i4fzWaXH_32kQYkwWb3U-pLxKd4",
  secure: true, 
});


// @desc    Get all vehicles
// @route   GET /vehicles
const getAllVehicles = async (req, res) => {
  try {
    const data = await vehicleData.find();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// @desc    Get single vehicle by ID
// @route   GET /vehicles/:id
const getVehicleById = async (req, res) => {
  try {
    const data = await vehicleData.findById(req.params.id);
 
    if (!data) {
      return res.status(404).json({ message: "Product not found" });
    }
 
    const vehicle = data.toObject();
 
    // Ensure complete image URL
    if (
      vehicle.vehicleDetails.image &&
      !vehicle.vehicleDetails.image.startsWith("http")
    ) {
      vehicle.vehicleDetails.image = `${req.protocol}://${req.get("host")}${vehicle.vehicleDetails.image}`;
    }
 
    res.json(vehicle);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get similar vehicles
// @route   GET /vehicles/similar/:vehicleId

const getSimilarVehicles = async (req, res) => {
  try {
    const currentVehicle = await vehicleData.findOne({
      "vehicleDetails.vehicleID": req.params.vehicleId,
    });
 
    if (
      !currentVehicle ||
      !currentVehicle.similarVehicles ||
      currentVehicle.similarVehicles.length === 0
    ) {
      return res.status(404).json({ message: "No similar vehicles found" });
    }
 
    const vehicleIDs = currentVehicle.similarVehicles.map((v) => v.VehicleID);
 
    const similarVehicles = await vehicleData.find({
      "vehicleDetails.vehicleID": { $in: vehicleIDs },
    });
 
    res.json(similarVehicles);
  } catch (err) {
    console.error("Error fetching similar vehicles:", err);
    res.status(500).json({ message: "Error fetching similar vehicles" });
  }
};

// @desc    Create new vehicle
// @route   POST /vehicles
const createVehicle = async (req, res) => {
  try {
    console.log("Creating vehicle with data:", req.body);
 
    const vehicle = new vehicleData(req.body);
    const saved = await vehicle.save();
 
    console.log("Product saved to MongoDB:", saved);
    res.status(201).json(saved);
  } catch (err) {
    console.error("Error saving product to MongoDB:", err);
    res.status(500).json({
      message: err.message,
      details: err.errors,
    });
  }
};

// @desc    Update vehicle (full update)
// @route   PUT /vehicles/:id
const updateVehicle = async (req, res) => {
  try {
    const updated = await vehicleData.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
 
    if (!updated) {
      return res.status(404).json({ message: "Vehicle not found" });
    }
 
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Partial update vehicle (e.g. visibility)
// @route   PATCH /vehicles/:id
const patchVehicle = async (req, res) => {
  try {
    const updateFields = {};
 
    if (req.body["vehicleDetails.visible"] !== undefined) {
      updateFields["vehicleDetails.visible"] =
        req.body["vehicleDetails.visible"];
    }
 
    const updatedVehicle = await vehicleData.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );
 
    if (!updatedVehicle) {
      return res.status(404).json({ message: "Vehicle not found" });
    }
 
    res.json(updatedVehicle);
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ message: "Failed to update vehicle" });
  }
};

// @desc    Remove a similar vehicle reference
// @route   PATCH /vehicles/:id/remove-similar
const removeSimilarVehicle = async (req, res) => {
  try {
    const { prodCode } = req.body;
 
    const updatedProduct = await vehicleData.findByIdAndUpdate(
      req.params.id,
      { $pull: { similarProducts: { ProdCode: prodCode } } },
      { new: true }
    );
 
    res.json(updatedProduct);
  } catch (err) {
    console.error("Remove similar error:", err);
    res.status(500).json({ message: "Failed to remove similar product" });
  }
};

// @desc    Delete vehicle
// @route   DELETE /vehicles/:id
const deleteVehicle = async (req, res) => {
  try {
    const vehicle = await vehicleData.findById(req.params.id);
 
    if (!vehicle) {
      return res.status(404).json({ message: "Product not found" });
    }
 
    // Delete main image from Cloudinary
    if (vehicle.vehicleDetails.imagePublicId) {
      await cloudinary.uploader.destroy(vehicle.vehicleDetails.imagePublicId);
    }
 
    // Delete additional files from Cloudinary
    if (
      vehicle.vehicleDetails.additionalFiles &&
      vehicle.vehicleDetails.additionalFiles.length > 0
    ) {
      for (const file of vehicle.vehicleDetails.additionalFiles) {
        if (file.public_id) {
          await cloudinary.uploader.destroy(file.public_id, {
            resource_type: file.type === "video" ? "video" : "image",
          });
        }
      }
    }
 
    await vehicleData.findByIdAndDelete(req.params.id);
    res.json({ message: "Product deleted successfully" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ message: err.message });
  }
};


module.exports = {
  getAllVehicles,
  getVehicleById,
  getSimilarVehicles,
  createVehicle,
  updateVehicle,
  patchVehicle,
  removeSimilarVehicle,
  deleteVehicle,
};
