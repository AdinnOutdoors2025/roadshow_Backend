const VehicleOffer = require('../../Models/VehicleOffer/VehicleOffer');
const VehicleModel = require('../../Models/VehicleModel');


// GET all vehicle offers
const getAllOffers = async (req, res) => {
  try {
    const offers = await VehicleOffer.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: offers.length,
      data: offers,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET single vehicle offer by ID
const getOfferById = async (req, res) => {
  try {
    const offer = await VehicleOffer.findById(req.params.id);
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Offer not found' });
    }
    res.status(200).json({ success: true, data: offer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createOffer = async (req, res) => {
  try {
    const { model, fromdate, todate, percentage } = req.body;


    const normalizedModel = model.trim().toLowerCase();

  
    const vehicleModelExists = await VehicleModel.findOne({
      $expr: { $eq: [{ $toLower: "$modelName" }, normalizedModel] },
    });

    if (!vehicleModelExists) {
      return res.status(404).json({
        success: false,
        message: `Model name "${model}" not found in vehicle models`,
      });
    }

   
    const existingModel = await VehicleOffer.findOne({
      $expr: { $eq: [{ $toLower: "$model" }, normalizedModel] },
    });

    if (existingModel) {
      return res.status(400).json({
        success: false,
        message: `Model "${model}" already exists`,
      });
    }

   
    const today = new Date();
    const existingActiveOffer = await VehicleOffer.findOne({
      $expr: { $eq: [{ $toLower: "$model" }, normalizedModel] },
      fromdate: { $lte: today },
      todate: { $gte: today },
    });

    if (existingActiveOffer) {
      return res.status(400).json({
        success: false,
        message: `An active offer already exists for model "${model}"`,
        existingOffer: existingActiveOffer,
      });
    }

    
    const offer = await VehicleOffer.create({
      model: vehicleModelExists.modelName,
      fromdate,
      todate,
      percentage,
    });

    res.status(201).json({
      success: true,
      message: "Vehicle offer created successfully",
      data: {
        _id: offer._id,
        model: offer.model,
        fromdate: offer.fromdate,
        todate: offer.todate,
        percentage: offer.percentage,
        createdAt: offer.createdAt,
        updatedAt: offer.updatedAt,
      },
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// PUT update a vehicle offer by ID
const updateOffer = async (req, res) => {
  try {
    const { model, fromdate, todate, percentage } = req.body;
    const offer = await VehicleOffer.findByIdAndUpdate(
      req.params.id,
      { model, fromdate, todate, percentage },
      { new: true, runValidators: true }
    );
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Offer not found' });
    }
    res.status(200).json({
      success: true,
      message: 'Offer updated successfully',
      data: offer,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// DELETE a vehicle offer by ID
const deleteOffer = async (req, res) => {
  try {
    const offer = await VehicleOffer.findByIdAndDelete(req.params.id);
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Offer not found' });
    }
    res.status(200).json({ success: true, message: 'Offer deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getAllOffers,
  getOfferById,
  createOffer,
  updateOffer,
  deleteOffer,
};