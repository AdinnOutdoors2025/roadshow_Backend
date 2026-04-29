
const VehicleModelElection = require("../../Models/VehicleModelElection");
const VehiclesAvailabilityElection = require("../../Models/VehiclesAvailabilityElection");

// Save Vehicles Availability Election
const saveVehiclesAvailabilityElection = async (req, res) => {
  try {
    const {
      modelId,
      modelName,
      location,
      availableCount,
      unavailableCount,
      remainingCount,
      statusReason,
    } = req.body;

    if (!modelId || !modelName) {
      return res.status(400).json({
        success: false,
        message: "Model ID and Model Name are required",
      });
    }

    const modelExists = await VehicleModelElection.findById(modelId);
    if (!modelExists) {
      return res.status(404).json({
        success: false,
        message: "Model not found in election models",
      });
    }

    const existing = await VehiclesAvailabilityElection.findOne({
      modelId,
      location: { $regex: `^${location.trim()}$`, $options: "i" },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Availability record already exists for this model and location",
      });
    }

    const newAvailability = new VehiclesAvailabilityElection({
      modelId,
      modelName: modelName.trim(),
      location: location.trim(),
      availableCount: parseInt(availableCount) || 0,
      unavailableCount: parseInt(unavailableCount) || 0,
      remainingCount: parseInt(remainingCount) || 0,
      statusReason: statusReason || "",
    });

    await newAvailability.save();

    const populated = await VehiclesAvailabilityElection.findById(newAvailability._id)
      .populate("modelId", "modelName");

    res.json({
      success: true,
      message: "Saved successfully",
      data: populated,
    });
  } catch (error) {
    console.error("Error saving availability:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Update Vehicles Availability Election
const updateVehiclesAvailabilityElection = async (req, res) => {
  try {
    const {
      modelId,
      modelName,
      location,
      availableCount,
      unavailableCount,
      remainingCount,
      statusReason,
    } = req.body;

    const availability = await VehiclesAvailabilityElection.findById(req.params.id);

    if (!availability) {
      return res.status(404).json({
        success: false,
        message: "Record not found",
      });
    }

    if (modelId) {
      const modelExists = await VehicleModelElection.findById(modelId);
      if (!modelExists) {
        return res.status(404).json({
          success: false,
          message: "Model not found in election models",
        });
      }
    }

    if (modelId && location) {
      const duplicate = await VehiclesAvailabilityElection.findOne({
        _id: { $ne: req.params.id },
        modelId,
        location: { $regex: `^${location.trim()}$`, $options: "i" },
      });

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: "Availability record already exists for this model and location",
        });
      }
    }

    const updated = await VehiclesAvailabilityElection.findByIdAndUpdate(
      req.params.id,
      {
        modelId: modelId || availability.modelId,
        modelName: modelName?.trim() || availability.modelName,
        location: location?.trim() || availability.location,
        availableCount:
          availableCount !== undefined
            ? parseInt(availableCount)
            : availability.availableCount,
        unavailableCount:
          unavailableCount !== undefined
            ? parseInt(unavailableCount)
            : availability.unavailableCount,
        remainingCount:
          remainingCount !== undefined
            ? parseInt(remainingCount)
            : availability.remainingCount,
        statusReason:
          statusReason !== undefined
            ? statusReason
            : availability.statusReason,
      },
      { new: true, runValidators: true }
    ).populate("modelId", "modelName");

    res.json({
      success: true,
      message: "Updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Error updating availability:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Get Vehicles Availability Election
const getVehiclesAvailabilityElection = async (req, res) => {
  try {
    const data = await VehiclesAvailabilityElection.find()
      .populate("modelId", "modelName")
      .sort({ createdAt: -1 });

    const formatted = data.map((item) => ({
      _id: item._id,
      modelId: item.modelId,
      modelName: item.modelName,
      location: item.location,
      availableCount: item.availableCount,
      unavailableCount: item.unavailableCount,
      remainingCount: item.remainingCount,
      statusReason: item.statusReason,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    res.json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    console.error("Error fetching availability:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Delete Vehicles Availability Election
const deleteVehiclesAvailabilityElection = async (req, res) => {
  try {
    const deleted = await VehiclesAvailabilityElection.findByIdAndDelete(
      req.params.id
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Record not found",
      });
    }

    res.json({
      success: true,
      message: "Deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting availability:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

module.exports = {
  saveVehiclesAvailabilityElection,
  updateVehiclesAvailabilityElection,
  getVehiclesAvailabilityElection,
  deleteVehiclesAvailabilityElection,
};