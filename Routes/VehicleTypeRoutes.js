// module.exports = router;
const express = require("express");
const router = express.Router();
const VehicleType = require("../Models/VehicleTypeSchema");

// Get all vehicle types (only active ones)
router.get("/vehicle-types", async (req, res) => {
  try {
    const vehicleTypes = await VehicleType.find().sort({ typeName: 1 });
    res.status(200).json({
      success: true,
      data: vehicleTypes
    });
  } catch (error) {
    console.error("Error fetching vehicle types:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching vehicle types",
      error: error.message
    });
  }
});

// Create new vehicle type
router.post("/vehicle-types", async (req, res) => {
  try {
    const { typeName } = req.body;
    
    if (!typeName || typeName.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Vehicle type name is required"
      });
    }
    
    // Check if already exists
    const existingType = await VehicleType.findOne({ typeName: typeName.trim() });
    if (existingType) {
      return res.status(400).json({
        success: false,
        message: "Vehicle type already exists"
      });
    }
    
    const vehicleType = new VehicleType({ typeName: typeName.trim() });
    await vehicleType.save();
    
    res.status(201).json({
      success: true,
      message: "Vehicle type created successfully",
      data: vehicleType
    });
  } catch (error) {
    console.error("Error creating vehicle type:", error);
    res.status(500).json({
      success: false,
      message: "Error creating vehicle type",
      error: error.message
    });
  }
});

// Update vehicle type
router.put("/vehicle-types/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { typeName } = req.body;
    
    if (!typeName || typeName.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Vehicle type name is required"
      });
    }
    
    const vehicleType = await VehicleType.findByIdAndUpdate(
      id,
      { typeName: typeName.trim() },
      { new: true, runValidators: true }
    );
    
    if (!vehicleType) {
      return res.status(404).json({
        success: false,
        message: "Vehicle type not found"
      });
    }
    
    res.status(200).json({
      success: true,
      message: "Vehicle type updated successfully",
      data: vehicleType
    });
  } catch (error) {
    console.error("Error updating vehicle type:", error);
    res.status(500).json({
      success: false,
      message: "Error updating vehicle type",
      error: error.message
    });
  }
});

// Delete vehicle type - HARD DELETE
router.delete("/vehicle-types/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const vehicleType = await VehicleType.findByIdAndDelete(id);
    
    if (!vehicleType) {
      return res.status(404).json({
        success: false,
        message: "Vehicle type not found"
      });
    }
    
    res.status(200).json({
      success: true,
      message: "Vehicle type deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting vehicle type:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting vehicle type",
      error: error.message
    });
  }
});

module.exports = router;