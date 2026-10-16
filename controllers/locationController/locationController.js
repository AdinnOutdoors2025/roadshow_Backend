
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

    // Prevent duplicates — case-insensitive and trim-insensitive, so
    // "madurai"/"MADURAI"/" Madurai " are all blocked when "Madurai" already
    // exists for this state (does not affect the same city name in a
    // different state, since currentCities is scoped to this state only).
    const normalizedNewCity = cityTrimmed.toLowerCase();
    const isDuplicate = currentCities.some(
      (existingCity) => String(existingCity).trim().toLowerCase() === normalizedNewCity
    );
    if (isDuplicate) {
      return errorResponse(res, `City '${cityTrimmed}' already exists in ${state}.`, null, 409);
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


exports.removeCityFromState = async (req, res) => {
  try {
    const { state } = req.params;
    const { city } = req.body;

    if (!city || !city.trim()) {
      return errorResponse(res, 'City name is required', null, 400);
    }

    const cityTrimmed = city.trim();

    const locationDoc = await Location.findOne({});
    if (!locationDoc) {
      return errorResponse(res, 'Location data not found', null, 404);
    }

    const currentCities = locationDoc[state];
    if (!currentCities || !Array.isArray(currentCities)) {
      return errorResponse(res, 'State not found', null, 404);
    }

    // Case-insensitive, trim-insensitive match — same normalization as
    // addCityToState's duplicate check, scoped to this state only.
    const normalizedCity = cityTrimmed.toLowerCase();
    const matchedCity = currentCities.find(
      (existingCity) => String(existingCity).trim().toLowerCase() === normalizedCity
    );

    if (!matchedCity) {
      return errorResponse(res, `City '${cityTrimmed}' was not found in ${state}.`, null, 404);
    }

    await Location.updateOne(
      { _id: locationDoc._id },
      { $pull: { [state]: matchedCity } }
    );

    return successResponse(res, 'City removed successfully', { state, city: matchedCity });
  } catch (err) {
    return errorResponse(res, 'Failed to remove city', err.message, 500);
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