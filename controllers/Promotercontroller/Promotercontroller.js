const Promoter = require('../../Models/Promotermodel/Promotermodel');
const { successResponse, errorResponse } = require('../../Utils/response');


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
        const { name, phone, email, language, gender, promoterCharge, status } = req.body;

        if (!name || !phone || !email || !gender || promoterCharge === undefined) {
            return errorResponse(res, 'Required fields missing', null, 400);
        }

        if (!language || !Array.isArray(language) || language.length === 0) {
            return errorResponse(res, 'At least one language is required', null, 400);
        }

      
        const existingEmail = await Promoter.findOne({
            email: email.toLowerCase().trim(),
        });

        if (existingEmail) {
            return errorResponse(
                res,
                'A promoter with this email already exists',
                null,
                409
            );
        }

    
        const existingPhone = await Promoter.findOne({
            phone: phone.trim(),
        });

        if (existingPhone) {
            return errorResponse(
                res,
                'A promoter with this phone number already exists',
                null,
                409
            );
        }

        const promoter = new Promoter({
            name,
            phone,
            email,
            language,
            gender,
            promoterCharge,
            status,
        });

        await promoter.save();

        return successResponse(
            res,
            'Promoter created successfully',
            promoter,
            201
        );
    } catch (err) {
        return errorResponse(res, 'Failed to create promoter', err.message, 400);
    }
};

exports.updatePromoter = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, phone, email, language, gender, promoterCharge, status } = req.body;

        if (!name || !phone || !email || !gender || promoterCharge === undefined) {
            return errorResponse(res, 'Required fields missing', null, 400);
        }
        if (!language || !Array.isArray(language) || language.length === 0) {
            return errorResponse(res, 'At least one language is required', null, 400);
        }

      
        const existing = await Promoter.findOne({ email: email.toLowerCase().trim(), _id: { $ne: id } });
        if (existing) {
            return errorResponse(res, 'A promoter with this email already exists', null, 409);
        }

        const existingPhone = await Promoter.findOne({ phone: phone.trim(), _id: { $ne: id } });
        if (existingPhone) {
            return errorResponse(res, 'A promoter with this phone number already exists', null, 409);
        }

        const promoter = await Promoter.findByIdAndUpdate(
            id,
            { name, phone, email, language, gender, promoterCharge, status },
            { new: true, runValidators: true }
        );
        if (!promoter) return errorResponse(res, 'Promoter not found', null, 404);
        return successResponse(res, 'Promoter updated successfully', promoter);
    } catch (err) {
        return errorResponse(res, 'Failed to update promoter', err.message, 400);
    }
};


exports.deletePromoter = async (req, res) => {
    try {
        const promoter = await Promoter.findByIdAndDelete(req.params.id);
        if (!promoter) return errorResponse(res, 'Promoter not found', null, 404);
        return successResponse(res, 'Promoter deleted successfully', null);
    } catch (err) {
        return errorResponse(res, 'Failed to delete promoter', err.message, 500);
    }
};


exports.togglePromoterStatus = async (req, res) => {
    try {
        const promoter = await Promoter.findById(req.params.id);
        if (!promoter) return errorResponse(res, 'Promoter not found', null, 404);
        promoter.status = promoter.status === 'active' ? 'inactive' : 'active';
        await promoter.save();
        return successResponse(res, `Promoter ${promoter.status === 'active' ? 'Activated' : 'Deactivated'}`, promoter);
    } catch (err) {
        return errorResponse(res, 'Failed to toggle promoter status', err.message, 500);
    }
};