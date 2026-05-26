
const Location = require('../../Models/Location/location');
const { successResponse, errorResponse } = require('../../Utils/response');


exports.getStates = async (req, res) => {
  try {
    const locations = await Location.find({}, { state: 1, _id: 0 });
    const states = locations.map(l => l.state);
    return successResponse(res, 'States fetched successfully', states);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch states', err.message, 500);
  }
};

exports.getCitiesByState = async (req, res) => {
  try {
    const { state } = req.params;
    const location = await Location.findOne({ state });
    if (!location) {
      return errorResponse(res, 'State not found', null, 404);
    }
    return successResponse(res, 'Cities fetched successfully', location.cities);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch cities', err.message, 500);
  }
};


exports.addCityToState = async (req, res) => {
  try {
    const { state } = req.params;
    const { city } = req.body;

    if (!city || !city.trim()) {
      return errorResponse(res, 'City name is required', null, 400);
    }

    const cityTrimmed = city.trim();

    // Find the single locations document
    const locationDoc = await Location.findOne({});
    if (!locationDoc) {
      return errorResponse(res, 'Location data not found', null, 404);
    }

    // Check if the state key exists on the document
    const currentCities = locationDoc[state];
    if (!currentCities || !Array.isArray(currentCities)) {
      return errorResponse(res, 'State not found', null, 404);
    }

    // Prevent duplicates
    if (currentCities.includes(cityTrimmed)) {
      return errorResponse(res, 'City already exists', null, 409);
    }

    // Push new city using $push
    await Location.updateOne(
      { _id: locationDoc._id },
      { $push: { [state]: cityTrimmed } }
    );

    return successResponse(res, 'City added successfully', { state, city: cityTrimmed });
  } catch (err) {
    return errorResponse(res, 'Failed to add city', err.message, 500);
  }
};


exports.getAllLocations = async (req, res) => {
  try {
    const locations = await Location.find({});
   
    return successResponse(res, 'Locations fetched successfully', { locations });
  } catch (err) {
    return errorResponse(res, 'Failed to fetch locations', err.message, 500);
  }
};