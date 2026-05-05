
const Package = require('../../Models/PackageManagementModel/packagemanagement');
const { successResponse, errorResponse } = require('../../Utils/response');

exports.addPackage = async (req, res) => {
  try {
    const { vehicleType, vehicleModel } = req.body;
    
   
    const existingPackage = await Package.findOne({ 
      vehicleType, 
      vehicleModel 
    });
    
    if (existingPackage) {
    
      const updatedPackage = await Package.findByIdAndUpdate(
        existingPackage._id, 
        req.body, 
        { new: true }
      );
      return successResponse(res, 'Package updated successfully (existing record found)', updatedPackage, 200);
    }
    
   
    const newPackage = new Package(req.body);
    await newPackage.save();
    return successResponse(res, 'Package created successfully', newPackage, 201);
  } catch (err) {
    return errorResponse(res, 'Failed to create package', err.message, 400);
  }
};

exports.getPackages = async (req, res) => {
  try {
    const packages = await Package.find();
    return successResponse(res, 'Packages fetched successfully', packages);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch packages', err.message, 500);
  }
};

exports.getPackageById = async (req, res) => {
  try {
    const pkg = await Package.findById(req.params.id);
    if (!pkg) return errorResponse(res, 'Package not found', null, 404);
    return successResponse(res, 'Package fetched successfully', pkg);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch package', err.message, 500);
  }
};

exports.updatePackage = async (req, res) => {
  try {
    const pkg = await Package.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!pkg) return errorResponse(res, 'Package not found', null, 404);
    return successResponse(res, 'Package updated successfully', pkg);
  } catch (err) {
    return errorResponse(res, 'Failed to update package', err.message, 400);
  }
};

exports.deletePackage = async (req, res) => {
  try {
    const pkg = await Package.findByIdAndDelete(req.params.id);
    if (!pkg) return errorResponse(res, 'Package not found', null, 404);
    return successResponse(res, 'Package deleted successfully', null);
  } catch (err) {
    return errorResponse(res, 'Failed to delete package', err.message, 500);
  }
};

exports.toggleActiveStatus = async (req, res) => {
  try {
    const pkg = await Package.findById(req.params.id);
    if (!pkg) return errorResponse(res, 'Package not found', null, 404);
    pkg.isActive = !pkg.isActive;
    if (pkg.isActive) {
      pkg.inactiveReason = '';
    } else {
      pkg.inactiveReason = req.body.reason || '';
    }
    await pkg.save();
    return successResponse(res, `Package ${pkg.isActive ? 'Activated' : 'Deactivated'}`, pkg);
  } catch (err) {
    return errorResponse(res, 'Failed to toggle package status', err.message, 500);
  }
};


exports.getVehicleOptions = async (req, res) => {
  try {
    const types = await Package.distinct('vehicleType');
    const models = await Package.distinct('vehicleModel');
    return successResponse(res, 'Vehicle options fetched', { types, models });
  } catch (err) {
    return errorResponse(res, 'Failed to fetch vehicle options', err.message, 500);
  }
};


exports.checkPackageExists = async (req, res) => {
  try {
    const { vehicleType, vehicleModel } = req.query;
    
    if (!vehicleType || !vehicleModel) {
      return errorResponse(res, 'Vehicle type and model are required', null, 400);
    }
    
    const existingPackage = await Package.findOne({ vehicleType, vehicleModel });
    
    return successResponse(res, 'Check completed', { 
      exists: !!existingPackage,
      package: existingPackage || null
    });
  } catch (err) {
    return errorResponse(res, 'Failed to check package', err.message, 500);
  }
};