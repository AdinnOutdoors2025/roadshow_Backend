const Vehicle = require("../../Models/entryVehicles");
const VehiclesAvailability = require("../../Models/vehiclesAvailability");

// Save Vehicles Availability
const saveVehiclesAvailability = async (req, res) => {
  try {
    const {
      vehicleId,
      vehicleNumber,
      model,
      location,
      isAvailable,
      statusReason,
    } = req.body;

    const cleanModel = model.trim();

    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }

    const existingModelVehicle = await Vehicle.findOne({
      _id: { $ne: vehicleId },
      model: { $regex: `^${cleanModel}$`, $options: "i" },
      images: { $exists: true, $not: { $size: 0 } },
    });

    const updateData = {
      vehicleId,
      vehicleNumber,
      model: cleanModel,
      location,
      isAvailable,
      statusReason: isAvailable ? "" : statusReason,
    };

    if (existingModelVehicle && existingModelVehicle.images.length > 0) {
      updateData.images = existingModelVehicle.images;
    }

    const updatedRecord = await VehiclesAvailability.findOneAndUpdate(
      { vehicleId },
      updateData,
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );

    res.json({ success: true, data: updatedRecord });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
};

// Update Vehicles Availability
const updateVehiclesAvailability = async (req, res) => {
  try {
    const {
      vehicleId,
      vehicleNumber,
      model,
      location,
      isAvailable,
      statusReason,
      images,
    } = req.body;

    const cleanModel = model.trim();

    const existingAvailability = await VehiclesAvailability.findById(
      req.params.id
    );

    if (!existingAvailability) {
      return res.status(404).json({
        success: false,
        message: "Record not found",
      });
    }

    const existingModelVehicle = await Vehicle.findOne({
      _id: { $ne: vehicleId },
      model: { $regex: `^${cleanModel}$`, $options: "i" },
      images: { $exists: true, $not: { $size: 0 } },
    });

    const updateData = {
      vehicleId,
      vehicleNumber,
      model: cleanModel,
      location,
      isAvailable,
      statusReason: isAvailable ? "" : statusReason,
    };

    if (images && images.length > 0) {
      updateData.images = images;
    } else if (existingModelVehicle && existingModelVehicle.images.length > 0) {
      updateData.images = existingModelVehicle.images;
    } else if (existingAvailability.images?.length > 0) {
      updateData.images = existingAvailability.images;
    }

    const updated = await VehiclesAvailability.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    );

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
};

// Get Vehicles Availability
const getVehiclesAvailability = async (req, res) => {
  try {
    const data = await VehiclesAvailability.find().populate(
      "vehicleId",
      "vehicleNumber model images speaker speakerNos generator generatorNos"
    );

    const formatted = data.map((item) => ({
      _id: item._id,
      vehicleNumber: item.vehicleId?.vehicleNumber,
      model: item.vehicleId?.model,
      location: item.location,
      isAvailable: item.isAvailable,
      statusReason: item.statusReason,
      images: item.vehicleId?.images || [],
      speaker: item.vehicleId?.speaker || "",
      speakerNos: item.vehicleId?.speakerNos ?? null,
      generator: item.vehicleId?.generator || "",
      generatorNos: item.vehicleId?.generatorNos ?? null,
    }));

    res.json({ success: true, data: formatted });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
};

// Delete
const deleteVehiclesAvailability = async (req, res) => {
  try {
    await VehiclesAvailability.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false });
  }
};

module.exports = {
  saveVehiclesAvailability,
  updateVehiclesAvailability,
  getVehiclesAvailability,
  deleteVehiclesAvailability,
};