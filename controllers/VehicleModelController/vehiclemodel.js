const VehicleModel = require("../../Models/VehicleModel");
const vehicleDetails = require("../../Models/vehicleDetails");
const Cart = require("../../Models/Cartmodel/cart");

// Save Vehicle Model
const saveVehicleModel = async (req, res) => {
  try {
    const { modelName } = req.body;

    if (!modelName || modelName.trim() === "") {
      return res.status(400).json({
        status: false,
        message: "Model name is required",
      });
    }

    const existing = await VehicleModel.findOne({
      modelName: modelName,
    });

    if (existing) {
      return res.status(400).json({
        status: false,
        message: "Model already exists",
      });
    }

    const newModel = new VehicleModel({
      modelName: modelName,
    });

    await newModel.save();

    res.status(201).json({
      status: true,
      message: "Model saved successfully",
      data: newModel,
    });
  } catch (error) {
    console.log("Model not saved", error);
    res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

// Get Vehicle Models
const getVehicleModels = async (req, res) => {
  try {
    const models = await VehicleModel.find().sort({ createdAt: -1 });

    res.json({
      status: true,
      data: models,
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

const deleteVehicleModel = async (req, res) => {
  try {
    const { id } = req.params;
    const { confirm } = req.query; 

    const model = await VehicleModel.findById(id);
    if (!model) {
      return res.status(404).json({
        status: false,
        message: "Model not found",
      });
    }

    const modelName = model.modelName;


    const vehicleCount = await vehicleDetails.countDocuments({ model: modelName });
    const cartCount = await Cart.countDocuments({ "items.vehicleModel": modelName });

  
    if (!confirm || confirm !== "true") {
      return res.status(200).json({
        status: "warning",
        message: `Deleting "${modelName}" will also delete ${vehicleCount} vehicle record(s) and ${cartCount} cart record(s). Are you sure?`,
        data: {
          modelName,
          vehicleCount,
          cartCount,
        },
      });
    }

  
    await vehicleDetails.deleteMany({ model: modelName });

    await Cart.updateMany(
      {},
      { $pull: { items: { vehicleModel: modelName } } }
    );

    await VehicleModel.findByIdAndDelete(id);

    return res.status(200).json({
      status: true,
      message: `"${modelName}" and all related ${vehicleCount} vehicle record(s) and ${cartCount} cart record(s) deleted successfully`,
    });

  } catch (error) {
    console.log("Delete error", error);
    res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

module.exports = {
  saveVehicleModel,
  getVehicleModels,
  deleteVehicleModel,
};