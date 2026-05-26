

const DrivingDetails = require("../../Models/Driverdetailsmodel/Driverdetailsmodel");
const { successResponse, errorResponse } = require('../../Utils/response');


const mapApiToSchema = (data) => {

  const otherDocuments = Array.isArray(data.other_documents_files)
    ? data.other_documents_files.flatMap((obj) =>
      Object.entries(obj).map(([key, url]) => ({ key, url }))
    )
    : [];

  return {
    name: data.name,
    dob: data.dob,
    gender: data.gender,
    fatherName: data.fathername,
    country: data.country,
    drivingLicenseNo: data.driving_license_no ?? "",
    aadharNo: data.aadhar_no,
    aadharAddress: data.aadhar_address,
    aadharFilename: data.aadhar_filename,
    aadharImgFilename: data.aadhar_img_filename,
    aadharXml: data.aadhar_xml,
    aadharImg: data.adharimg,

    house: data.house,
    locality: data.locality,
    dist: data.dist,
    state: data.state,
    pincode: data.pincode,

    panNumber: data.pan_number,
    nameOnPan: data.name_on_pan,
    panImagePath: data.pan_image_path,

    otherDocuments,
    dateTime: data.date_time,
  };
};

// POST /api/driving-details
// Save DigiLocker API response to DB
const createDrivingDetails = async (req, res) => {
  try {
    let payload;

    if (req.body.success !== undefined) {
      const { data, status, success } = req.body;
      if (!success || status !== "success") {
        return errorResponse(res, 'Invalid DigiLocker response', null, 400);
      }
      payload = mapApiToSchema(data);
    } else {
      payload = req.body;
    }

    // Check for duplicate entries
    const duplicateChecks = [
      { field: 'drivingLicenseNo', name: 'Driving License Number' },
      { field: 'aadharNo', name: 'Aadhar Number' },
      { field: 'panNumber', name: 'PAN Number' }
    ];

    for (const check of duplicateChecks) {
      if (payload[check.field]) {
        const existing = await DrivingDetails.findOne({ 
          [check.field]: payload[check.field] 
        });
        if (existing) {
          return errorResponse(res, `${check.name} already exists`, null, 400);
        }
      }
    }

    const record = await DrivingDetails.create(payload);

    return successResponse(res, 'Driving details saved successfully', record, 201);
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return errorResponse(res, 'Validation Error', messages, 400);
    }
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const fieldNames = {
        drivingLicenseNo: 'Driving License Number',
        aadharNo: 'Aadhar Number',
        panNumber: 'PAN Number'
      };
      return errorResponse(res, `${fieldNames[field] || field} already exists`, null, 400);
    }
    
    return errorResponse(res, 'Server Error', error.message, 500);
  }
};

// GET /api/driving-details
// Get all records
const getAllDrivingDetails = async (req, res) => {
  try {
    const records = await DrivingDetails.find().sort({ createdAt: -1 });
    return successResponse(res, 'Driving details fetched successfully', records);
  } catch (error) {
    return errorResponse(res, 'Server Error', error.message, 500);
  }
};

// GET /api/driving-details/:id
// Get single record by ID
const getDrivingDetailsById = async (req, res) => {
  try {
    const record = await DrivingDetails.findById(req.params.id);
    if (!record) {
      return errorResponse(res, 'Driving detail not found', null, 404);
    }
    return successResponse(res, 'Driving detail fetched successfully', record);
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return errorResponse(res, 'Invalid ID format', null, 400);
    }
    return errorResponse(res, 'Server Error', error.message, 500);
  }
};

// PUT /api/driving-details/:id
// Update a record
const updateDrivingDetails = async (req, res) => {
  try {
  
    if (req.body.drivingLicenseNo) {
      const existingDL = await DrivingDetails.findOne({
        drivingLicenseNo: req.body.drivingLicenseNo,
        _id: { $ne: req.params.id }  
      });
      if (existingDL) {
        return errorResponse(res, 'Driving License Number already exists', null, 400);
      }
    }

  
    if (req.body.aadharNo) {
      const existingAadhar = await DrivingDetails.findOne({
        aadharNo: req.body.aadharNo,
        _id: { $ne: req.params.id }
      });
      if (existingAadhar) {
        return errorResponse(res, 'Aadhar Number already exists', null, 400);
      }
    }

   
    if (req.body.panNumber) {
      const existingPAN = await DrivingDetails.findOne({
        panNumber: req.body.panNumber,
        _id: { $ne: req.params.id }
      });
      if (existingPAN) {
        return errorResponse(res, 'PAN Number already exists', null, 400);
      }
    }

    const record = await DrivingDetails.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!record) {
      return errorResponse(res, 'Driving detail not found', null, 404);
    }
    
    return successResponse(res, 'Driving details updated successfully', record);
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return errorResponse(res, 'Validation Error', messages, 400);
    }
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const fieldNames = {
        drivingLicenseNo: 'Driving License Number',
        aadharNo: 'Aadhar Number',
        panNumber: 'PAN Number'
      };
      return errorResponse(res, `${fieldNames[field] || field} already exists`, null, 400);
    }
    
    if (error.kind === 'ObjectId') {
      return errorResponse(res, 'Invalid ID format', null, 400);
    }
    
    return errorResponse(res, 'Server Error', error.message, 500);
  }
};

// DELETE /api/driving-details/:id
// Delete a record
const deleteDrivingDetails = async (req, res) => {
  try {
    const record = await DrivingDetails.findByIdAndDelete(req.params.id);
    if (!record) {
      return errorResponse(res, 'Driving detail not found', null, 404);
    }
    return successResponse(res, 'Driving detail deleted successfully', null);
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return errorResponse(res, 'Invalid ID format', null, 400);
    }
    return errorResponse(res, 'Server Error', error.message, 500);
  }
};

module.exports = {
  createDrivingDetails,
  getAllDrivingDetails,
  getDrivingDetailsById,
  updateDrivingDetails,
  deleteDrivingDetails,
};