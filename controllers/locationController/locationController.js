
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


exports.getAllLocations = async (req, res) => {
  try {
    const locations = await Location.find({});
   
    return successResponse(res, 'Locations fetched successfully', { locations });
  } catch (err) {
    return errorResponse(res, 'Failed to fetch locations', err.message, 500);
  }
};