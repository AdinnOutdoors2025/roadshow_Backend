
const Package = require('../../Models/PackageManagementModel/packagemanagement');
const { successResponse, errorResponse } = require('../../Utils/response');

exports.addPackage = async (req, res) => {
  try {
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
    await pkg.save();
    return successResponse(res, `Package ${pkg.isActive ? 'Activated' : 'Deactivated'}`, pkg);
  } catch (err) {
    return errorResponse(res, 'Failed to toggle package status', err.message, 500);
  }
};