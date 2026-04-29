const VehicleModelElection = require("../../Models/VehicleModelElection");
const VehiclesAvailabilityElection = require("../../Models/VehiclesAvailabilityElection");

// Save Vehicle Model Election
const saveVehicleModelElection = async (req, res) => {
  try {
    const { modelName } = req.body;

    if (!modelName || modelName.trim() === "") {
      return res.status(400).json({
        status: false,
        message: "Model name is required",
      });
    }

    const existing = await VehicleModelElection.findOne({
      modelName: { $regex: `^${modelName.trim()}$`, $options: "i" },
    });

    if (existing) {
      return res.status(400).json({
        status: false,
        message: "Model already exists",
      });
    }

    const newModel = new VehicleModelElection({
      modelName: modelName.trim().toUpperCase(),
    });

    await newModel.save();

    res.status(201).json({
      status: true,
      message: "Model saved successfully",
      data: newModel,
    });
  } catch (error) {
    console.error("Error saving model:", error);
    res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

// Get Vehicle Models Election
const getVehicleModelsElection = async (req, res) => {
  try {
    const models = await VehicleModelElection.find().sort({ createdAt: -1 });

    res.json({
      status: true,
      data: models,
    });
  } catch (error) {
    console.error("Error fetching models:", error);
    res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

// Update Vehicle Model Election
const updateVehicleModelElection = async (req, res) => {
  try {
    const { modelName } = req.body;
    const { id } = req.params;

    if (!modelName || modelName.trim() === "") {
      return res.status(400).json({
        status: false,
        message: "Model name is required",
      });
    }

    const existingModel = await VehicleModelElection.findById(id);
    if (!existingModel) {
      return res.status(404).json({
        status: false,
        message: "Model not found",
      });
    }

    const duplicate = await VehicleModelElection.findOne({
      _id: { $ne: id },
      modelName: { $regex: `^${modelName.trim()}$`, $options: "i" },
    });

    if (duplicate) {
      return res.status(400).json({
        status: false,
        message: "Model name already exists",
      });
    }

    const updatedModelName = modelName.trim().toUpperCase();

    const updatedModel = await VehicleModelElection.findByIdAndUpdate(
      id,
      { modelName: updatedModelName },
      { new: true }
    );

    await VehiclesAvailabilityElection.updateMany(
      { modelId: id },
      { modelName: updatedModelName }
    );

    res.json({
      status: true,
      message: "Model updated successfully",
      data: updatedModel,
    });
  } catch (error) {
    console.error("Error updating model:", error);
    res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

// Delete Vehicle Model Election
const deleteVehicleModelElection = async (req, res) => {
  try {
    const { id } = req.params;

    const model = await VehicleModelElection.findById(id);
    if (!model) {
      return res.status(404).json({
        status: false,
        message: "Model not found",
      });
    }

    await VehiclesAvailabilityElection.deleteMany({ modelId: id });

    await VehicleModelElection.findByIdAndDelete(id);

    res.json({
      status: true,
      message: "Model and associated availability records deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting model:", error);
    res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

module.exports = {
  saveVehicleModelElection,
  getVehicleModelsElection,
  updateVehicleModelElection,
  deleteVehicleModelElection,
};