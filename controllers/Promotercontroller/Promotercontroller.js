const Promoter = require('../../Models/Promotermodel/Promotermodel');
const Location = require('../../Models/Location/location');
const { successResponse, errorResponse } = require('../../Utils/response');
const { isTargetState } = require('../../Utils/locationChargeResolver');

/**
 * The 5 allowed states, as real names — read dynamically from the same
 * Location collection the order-creation State dropdown already uses
 * (filtered down to Tamil Nadu/Kerala/Andhra Pradesh/Telangana/Karnataka),
 * not a static list baked into this controller.
 */
const getAllowedStates = async () => {
  const doc = await Location.findOne({});
  if (!doc) return [];
  const raw = doc.toObject ? doc.toObject() : doc;
  return Object.keys(raw).filter(
    (key) => key !== '_id' && key !== 'cities' && key !== '__v' && isTargetState(key)
  );
};

exports.getPromoters = async (req, res) => {
    try {
        const promoters = await Promoter.find().sort({ createdAt: -1 });
        return successResponse(res, 'Promoters fetched successfully', { data: promoters });
    } catch (err) {
        return errorResponse(res, 'Failed to fetch promoters', err.message, 500);
    }
};


exports.getPromoterById = async (req, res) => {
    try {
        const promoter = await Promoter.findById(req.params.id);
        if (!promoter) return errorResponse(res, 'Promoter not found', null, 404);
        return successResponse(res, 'Promoter fetched successfully', promoter);
    } catch (err) {
        return errorResponse(res, 'Failed to fetch promoter', err.message, 500);
    }
};


exports.addPromoter = async (req, res) => {
    try {
        const { state, promoterCharge } = req.body;

        const allowedStates = await getAllowedStates();
        if (!state || !allowedStates.includes(state)) {
            return errorResponse(res, 'A valid state is required', null, 400);
        }
        if (promoterCharge === undefined || promoterCharge === null || isNaN(Number(promoterCharge)) || Number(promoterCharge) < 0) {
            return errorResponse(res, 'Promoter charge is required', null, 400);
        }

        const existing = await Promoter.findOne({ state });
        if (existing) {
            return errorResponse(
                res,
                `A promoter charge for "${state}" already exists — edit it instead`,
                null,
                409
            );
        }

        const promoter = new Promoter({ state, promoterCharge: Number(promoterCharge) });
        await promoter.save();

        return successResponse(res, 'Promoter charge created successfully', promoter, 201);
    } catch (err) {
        return errorResponse(res, 'Failed to create promoter charge', err.message, 400);
    }
};

exports.updatePromoter = async (req, res) => {
    try {
        const { id } = req.params;
        const { promoterCharge } = req.body;

        // State is immutable once set — only the charge amount can change.
        if (promoterCharge === undefined || promoterCharge === null || isNaN(Number(promoterCharge)) || Number(promoterCharge) < 0) {
            return errorResponse(res, 'Promoter charge is required', null, 400);
        }

        const promoter = await Promoter.findByIdAndUpdate(
            id,
            { promoterCharge: Number(promoterCharge) },
            { new: true, runValidators: true }
        );
        if (!promoter) return errorResponse(res, 'Promoter not found', null, 404);
        return successResponse(res, 'Promoter charge updated successfully', promoter);
    } catch (err) {
        return errorResponse(res, 'Failed to update promoter charge', err.message, 400);
    }
};


exports.deletePromoter = async (req, res) => {
    try {
        const promoter = await Promoter.findByIdAndDelete(req.params.id);
        if (!promoter) return errorResponse(res, 'Promoter not found', null, 404);
        return successResponse(res, 'Promoter charge deleted successfully', null);
    } catch (err) {
        return errorResponse(res, 'Failed to delete promoter charge', err.message, 500);
    }
};


exports.getAllowedPromoterStates = async (req, res) => {
    try {
        const allowedStates = await getAllowedStates();
        return successResponse(res, 'Allowed states fetched successfully', allowedStates);
    } catch (err) {
        return errorResponse(res, 'Failed to fetch allowed states', err.message, 500);
    }
};
