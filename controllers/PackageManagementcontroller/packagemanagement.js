const Package = require('../../Models/PackageManagementModel/packagemanagement');
const VehicleType = require('../../Models/VehicleTypeSchema');
const { successResponse, errorResponse } = require('../../Utils/response');
const mongoose = require('mongoose');

// Helper to convert string ID to ObjectId
const toObjectId = (id) => {
  if (!id) return null;
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
};

exports.addPackage = async (req, res) => {
  try {
    const { vehicleType, vehicleModel, ...rest } = req.body;
    
    // Validate vehicleType ID
    if (!mongoose.Types.ObjectId.isValid(vehicleType)) {
      return errorResponse(res, 'Invalid vehicle type ID', null, 400);
    }
    
    const existingPackage = await Package.findOne({ 
      vehicleType: toObjectId(vehicleType), 
      vehicleModel 
    });
    
    if (existingPackage) {
      const updatedPackage = await Package.findByIdAndUpdate(
        existingPackage._id, 
        { vehicleType: toObjectId(vehicleType), vehicleModel, ...rest }, 
        { new: true }
      ).populate('vehicleType', 'typeName');
      return successResponse(res, 'Package updated successfully (existing record found)', updatedPackage, 200);
    }
    
    const newPackage = new Package({ vehicleType: toObjectId(vehicleType), vehicleModel, ...rest });
    await newPackage.save();
    await newPackage.populate('vehicleType', 'typeName');
    return successResponse(res, 'Package created successfully', newPackage, 201);
  } catch (err) {
    return errorResponse(res, 'Failed to create package', err.message, 400);
  }
};

exports.getPackages = async (req, res) => {
  try {
    const packages = await Package.find().populate('vehicleType', 'typeName');
    return successResponse(res, 'Packages fetched successfully', packages);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch packages', err.message, 500);
  }
};

exports.getPackageById = async (req, res) => {
  try {
    const pkg = await Package.findById(req.params.id).populate('vehicleType', 'typeName');
    if (!pkg) return errorResponse(res, 'Package not found', null, 404);
    return successResponse(res, 'Package fetched successfully', pkg);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch package', err.message, 500);
  }
};

exports.updatePackage = async (req, res) => {
  try {
    const { id } = req.params;
    const { vehicleType, vehicleModel, ...rest } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(vehicleType)) {
      return errorResponse(res, 'Invalid vehicle type ID', null, 400);
    }
    
    const pkg = await Package.findByIdAndUpdate(
      id, 
      { vehicleType: toObjectId(vehicleType), vehicleModel, ...rest }, 
      { new: true, runValidators: true }
    ).populate('vehicleType', 'typeName');
    
    if (!pkg) return errorResponse(res, 'Package not found', null, 404);
    return successResponse(res, 'Package updated successfully', pkg);
  } catch (err) {
    console.error('Update error:', err);
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
    pkg.inactiveReason = pkg.isActive ? '' : (req.body.reason || '');
    await pkg.save();
    await pkg.populate('vehicleType', 'typeName');
    return successResponse(res, `Package ${pkg.isActive ? 'Activated' : 'Deactivated'}`, pkg);
  } catch (err) {
    return errorResponse(res, 'Failed to toggle package status', err.message, 500);
  }
};

exports.getVehicleOptions = async (req, res) => {
  try {
    // Return list of vehicle types with _id and typeName
    const types = await VehicleType.find({ isActive: true }, '_id typeName');
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
    
    if (!mongoose.Types.ObjectId.isValid(vehicleType)) {
      return errorResponse(res, 'Invalid vehicle type ID', null, 400);
    }
    
    const existingPackage = await Package.findOne({ 
      vehicleType: toObjectId(vehicleType), 
      vehicleModel 
    }).populate('vehicleType', 'typeName');
    
    return successResponse(res, 'Check completed', { 
      exists: !!existingPackage,
      package: existingPackage || null
    });
  } catch (err) {
    return errorResponse(res, 'Failed to check package', err.message, 500);
  }
};