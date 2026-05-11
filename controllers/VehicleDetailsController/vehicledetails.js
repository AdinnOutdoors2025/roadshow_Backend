// //CONTROLLERS.JS
// const Vehicle = require("../../Models/vehicleDetails");
// const mongoose = require("mongoose");
// const path = require("path");

// // Helper function to parse registration numbers from various formats
// const parseRegistrationNumbers = (registrationNumbersInput) => {
//   if (!registrationNumbersInput) {
//     return [];
//   }
  
//   // If it's already an array
//   if (Array.isArray(registrationNumbersInput)) {
//     return registrationNumbersInput.filter(reg => reg && reg.trim() !== "");
//   }
  
//   // If it's a string
//   if (typeof registrationNumbersInput === 'string') {
//     // Check if it has commas (multiple registration numbers)
//     if (registrationNumbersInput.includes(',')) {
//       // Split by comma and clean each item
//       return registrationNumbersInput.split(',').map(reg => reg.trim()).filter(reg => reg);
//     } else {
//       // Single registration number
//       return [registrationNumbersInput.trim()];
//     }
//   }
  
//   return [];
// };

// // Helper function to validate and clean a single registration number
// const validateAndCleanRegNumber = (regNumber) => {
//   if (!regNumber || typeof regNumber !== 'string') {
//     return { isValid: false, cleaned: regNumber, error: "Invalid registration number" };
//   }
  
//   // Remove all spaces and convert to uppercase
//   let cleaned = regNumber.replace(/\s/g, "").toUpperCase();
  
//   // Remove any special characters
//   cleaned = cleaned.replace(/[^A-Z0-9]/g, "");
  
//   // Check if it matches the pattern: 2 letters, 2 numbers, 2 letters, 4 numbers
//   const pattern = /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/;
  
//   if (pattern.test(cleaned)) {
//     return { isValid: true, cleaned };
//   }
  
//   return { isValid: false, cleaned: regNumber, error: `Invalid format: ${regNumber}` };
// };

// // Helper function to generate unique vehicle ID
// const generateVehicleId = async (vehicleType) => {
//   const prefix = vehicleType.substring(0, 3).toUpperCase().replace(/\s/g, "");
//   const count = await Vehicle.countDocuments({ "basicInfo.vehicleType": vehicleType });
//   const sequence = String(count + 1).padStart(4, "0");
//   return `${prefix}-${sequence}`;
// };

// // Helper function to parse form data from various formats
// const parseFormData = (req) => {
//   console.log("Parsing request data...");
//   console.log("Content-Type:", req.headers['content-type']);
  
//   // If request body already has nested structure (JSON)
//   if (req.body.basicInfo && typeof req.body.basicInfo === "object") {
//     console.log("Detected nested JSON structure");
//     return {
//       basicInfo: req.body.basicInfo,
//       techSpecs: req.body.techSpecs || {},
//       vehicleDetails: req.body.vehicleDetails || {},
//       pricing: req.body.pricing || {},
//       driverDetails: req.body.driverDetails || {},
//       statusAvailability: req.body.statusAvailability || {},
//       maintenanceInfo: req.body.maintenanceInfo || {},
//       mediaFiles: req.files || {}
//     };
//   }
  
//   // If form-data with flat structure
//   console.log("Detected flat form-data structure");
//   const result = {
//     basicInfo: {},
//     techSpecs: {},
//     vehicleDetails: {},
//     pricing: {},
//     driverDetails: {},
//     statusAvailability: {},
//     maintenanceInfo: {},
//     mediaFiles: req.files || {}
//   };
  
//   // Parse flat form-data into nested structure
//   for (let key in req.body) {
//     const match = key.match(/^(\w+)\[(\w+)\]$/);
//     if (match) {
//       const [, section, field] = match;
//       if (result[section]) {
//         result[section][field] = req.body[key];
//       }
//     } else {
//       // Handle non-section fields
//       result.basicInfo[key] = req.body[key];
//     }
//   }
  
//   return result;
// };

// // // Create new vehicle(s)
// // const createVehicle = async (req, res) => {
// //   try {
// //     console.log("=== CREATE VEHICLE REQUEST ===");
// //     console.log("Request body:", JSON.stringify(req.body, null, 2));
    
// //     // Parse the request data
// //     const parsedData = parseFormData(req);
    
// //     const { basicInfo, techSpecs, vehicleDetails, pricing, driverDetails, statusAvailability, maintenanceInfo } = parsedData;
    
// //     // Parse registration numbers (handle string or array)
// //     let registrationNumbers = parseRegistrationNumbers(basicInfo.registrationNumbers);
    
// //     console.log("Raw registration numbers input:", basicInfo.registrationNumbers);
// //     console.log("Parsed registration numbers:", registrationNumbers);
    
// //     // Validate and clean registration numbers
// //     const validRegNumbers = [];
// //     const invalidRegNumbers = [];
    
// //     for (const reg of registrationNumbers) {
// //       if (reg && reg.trim()) {
// //         const { isValid, cleaned, error } = validateAndCleanRegNumber(reg);
// //         if (isValid) {
// //           validRegNumbers.push(cleaned);
// //         } else {
// //           invalidRegNumbers.push({ original: reg, error });
// //         }
// //       }
// //     }
    
// //     console.log("Valid registration numbers:", validRegNumbers);
// //     console.log("Invalid registration numbers:", invalidRegNumbers);
    
// //     // Check if we have any valid registration numbers
// //     if (validRegNumbers.length === 0) {
// //       return res.status(400).json({
// //         success: false,
// //         message: "Invalid registration number format",
// //         error: `Please provide valid registration numbers. Format: XX NN XX NNNN (e.g., TN01AB1234 or TN 01 AB 1234)`,
// //         received: registrationNumbers,
// //         invalid: invalidRegNumbers
// //       });
// //     }
    
// //     // Validate required fields
// //     if (!basicInfo.vehicleName || basicInfo.vehicleName.trim() === "") {
// //       return res.status(400).json({
// //         success: false,
// //         message: "Vehicle name is required",
// //       });
// //     }
    
// //     if (!basicInfo.city || basicInfo.city.trim() === "") {
// //       return res.status(400).json({
// //         success: false,
// //         message: "City is required",
// //       });
// //     }
    
// //     // Convert boolean strings
// //     if (basicInfo.gpsEnabled === "true") basicInfo.gpsEnabled = true;
// //     if (basicInfo.gpsEnabled === "false") basicInfo.gpsEnabled = false;
// //     if (basicInfo.status === "true") basicInfo.status = true;
// //     if (basicInfo.status === "false") basicInfo.status = false;
    
// //     // Convert numeric values
// //     const numericFields = ["avgKmPerDay", "extraKmPrice", "avgBookingHrs", "extraHrPrice", "rtoCharges", "costPerDay", "kmCost"];
// //     numericFields.forEach(field => {
// //       if (vehicleDetails[field]) vehicleDetails[field] = Number(vehicleDetails[field]);
// //       if (pricing[field]) pricing[field] = Number(pricing[field]);
// //     });
    
// //     // Check for existing vehicles with same name and city
// //     const existingVehicles = await Vehicle.find({
// //       "basicInfo.vehicleName": basicInfo.vehicleName,
// //       "basicInfo.city": basicInfo.city
// //     });
    
// //     console.log("Existing vehicles found:", existingVehicles.length);
    
// //     if (existingVehicles.length > 0) {
// //       const existingVehicle = existingVehicles[0];
      
// //       // Check for duplicate registration numbers
// //       const existingRegNumbers = [];
// //       existingVehicles.forEach(v => {
// //         if (v.basicInfo && v.basicInfo.registrationNumbers) {
// //           existingRegNumbers.push(...v.basicInfo.registrationNumbers);
// //         }
// //       });
      
// //       const duplicateRegs = validRegNumbers.filter(reg => existingRegNumbers.includes(reg));
      
// //       if (duplicateRegs.length > 0) {
// //         return res.status(400).json({
// //           success: false,
// //           message: `Registration numbers already exist: ${duplicateRegs.join(", ")}`,
// //           duplicates: duplicateRegs,
// //         });
// //       }
      
// //       // Add to existing group
// //       const updatedVehicle = await Vehicle.findByIdAndUpdate(
// //         existingVehicle._id,
// //         {
// //           $inc: { "basicInfo.vehicleCount": validRegNumbers.length },
// //           $push: { "basicInfo.registrationNumbers": { $each: validRegNumbers } },
// //           $set: {
// //             techSpecs,
// //             vehicleDetails,
// //             pricing,
// //             driverDetails,
// //             statusAvailability,
// //             maintenanceInfo
// //           }
// //         },
// //         { new: true }
// //       );
      
// //       return res.status(200).json({
// //         success: true,
// //         message: `${validRegNumbers.length} new vehicle(s) added to existing group. Total: ${updatedVehicle.basicInfo.vehicleCount} vehicles`,
// //         data: updatedVehicle,
// //       });
// //     }
    
// //     // Generate vehicle ID if not provided
// //     if (!basicInfo.vehicleId || basicInfo.vehicleId === "") {
// //       basicInfo.vehicleId = await generateVehicleId(basicInfo.vehicleType);
// //     }
    
// //     // Create new vehicle group
// //     const newVehicleData = {
// //       basicInfo: {
// //         ...basicInfo,
// //         registrationNumbers: validRegNumbers,
// //         vehicleCount: validRegNumbers.length,
// //       },
// //       techSpecs,
// //       vehicleDetails,
// //       pricing,
// //       driverDetails,
// //       statusAvailability,
// //       maintenanceInfo
// //     };
    
// //     console.log("Creating new vehicle with data:", JSON.stringify(newVehicleData, null, 2));
    
// //     const newVehicle = new Vehicle(newVehicleData);
// //     const savedVehicle = await newVehicle.save();
    
// //     return res.status(201).json({
// //       success: true,
// //       message: `${savedVehicle.basicInfo.vehicleCount} new vehicle(s) created successfully`,
// //       data: savedVehicle,
// //     });
    
// //   } catch (error) {
// //     console.error("Create Vehicle Error:", error);
// //     res.status(500).json({
// //       success: false,
// //       message: "Error Creating Vehicle",
// //       error: error.message,
// //       stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
// //     });
// //   }
// // };


// // Create new vehicle(s)
// const createVehicle = async (req, res) => {
//   try {
//     console.log("=== CREATE VEHICLE REQUEST ===");
    
//     // Parse the data from form-data
//     let basicInfo, techSpecs, vehicleDetails, pricing, driverDetails, statusAvailability, maintenanceInfo;
    
//     // Check if data is sent as JSON string in 'data' field
//     if (req.body.data) {
//       const parsedData = JSON.parse(req.body.data);
//       basicInfo = parsedData.basicInfo;
//       techSpecs = parsedData.techSpecs;
//       vehicleDetails = parsedData.vehicleDetails;
//       pricing = parsedData.pricing;
//       driverDetails = parsedData.driverDetails;
//       statusAvailability = parsedData.statusAvailability;
//       maintenanceInfo = parsedData.maintenanceInfo;
//     } else {
//       // Parse flat form-data structure
//       basicInfo = {};
//       techSpecs = {};
//       vehicleDetails = {};
//       pricing = {};
//       driverDetails = {};
//       statusAvailability = {};
//       maintenanceInfo = {};
      
//       for (let key in req.body) {
//         const match = key.match(/^(\w+)\[(\w+)\]$/);
//         if (match) {
//           const [, section, field] = match;
//           if (section === 'basicInfo') basicInfo[field] = req.body[key];
//           else if (section === 'techSpecs') techSpecs[field] = req.body[key];
//           else if (section === 'vehicleDetails') vehicleDetails[field] = req.body[key];
//           else if (section === 'pricing') pricing[field] = req.body[key];
//           else if (section === 'driverDetails') driverDetails[field] = req.body[key];
//           else if (section === 'statusAvailability') statusAvailability[field] = req.body[key];
//           else if (section === 'maintenanceInfo') maintenanceInfo[field] = req.body[key];
//         } else {
//           basicInfo[key] = req.body[key];
//         }
//       }
//     }
    
//     console.log("Basic Info:", basicInfo);
    
//     // Get registration numbers
//     let registrationNumbers = [];
//     if (basicInfo.registrationNumbers) {
//       if (Array.isArray(basicInfo.registrationNumbers)) {
//         registrationNumbers = basicInfo.registrationNumbers;
//       } else if (typeof basicInfo.registrationNumbers === 'string') {
//         registrationNumbers = [basicInfo.registrationNumbers];
//       }
//     }
    
//     // Validate registration numbers
//     const validRegNumbers = [];
//     const invalidRegNumbers = [];
    
//     for (const reg of registrationNumbers) {
//       if (reg && reg.trim()) {
//         const clean = reg.replace(/\s/g, "").toUpperCase();
//         const pattern = /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/;
//         if (pattern.test(clean)) {
//           validRegNumbers.push(clean);
//         } else {
//           invalidRegNumbers.push({ original: reg, error: "Invalid format" });
//         }
//       }
//     }
    
//     if (validRegNumbers.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "At least one valid registration number is required",
//         invalid: invalidRegNumbers
//       });
//     }
    
//     // Convert boolean values
//     basicInfo.gpsEnabled = basicInfo.gpsEnabled === true || basicInfo.gpsEnabled === "true";
//     basicInfo.status = basicInfo.status === true || basicInfo.status === "true";
    
//     // Process uploaded files
//     const mediaFiles = {};
//     if (req.files) {
//       if (req.files.frontViewImage) mediaFiles.frontViewImage = req.files.frontViewImage[0].path;
//       if (req.files.leftSideImage) mediaFiles.leftSideImage = req.files.leftSideImage[0].path;
//       if (req.files.rightSideImage) mediaFiles.rightSideImage = req.files.rightSideImage[0].path;
//       if (req.files.rearViewImage) mediaFiles.rearViewImage = req.files.rearViewImage[0].path;
//       if (req.files.interiorImage) mediaFiles.interiorImage = req.files.interiorImage[0].path;
//       if (req.files.demoVideo) mediaFiles.demoVideo = req.files.demoVideo[0].path;
//     }
    
//     // Generate vehicle ID if not provided
//     if (!basicInfo.vehicleId || basicInfo.vehicleId === "") {
//       const prefix = (basicInfo.vehicleType || "VEH").substring(0, 3).toUpperCase();
//       const count = await Vehicle.countDocuments();
//       const sequence = String(count + 1).padStart(4, "0");
//       basicInfo.vehicleId = `${prefix}-${sequence}`;
//     }
    
//     // Create new vehicle
//     const vehicleData = {
//       basicInfo: {
//         ...basicInfo,
//         registrationNumbers: validRegNumbers,
//         vehicleCount: validRegNumbers.length
//       },
//       techSpecs: techSpecs || {},
//       vehicleDetails: vehicleDetails || {},
//       pricing: pricing || {},
//       driverDetails: driverDetails || {},
//       statusAvailability: statusAvailability || {},
//       maintenanceInfo: maintenanceInfo || {},
//       mediaFiles: mediaFiles
//     };
    
//     const vehicle = new Vehicle(vehicleData);
//     const savedVehicle = await vehicle.save();
    
//     res.status(201).json({
//       success: true,
//       message: `${validRegNumbers.length} vehicle(s) created successfully`,
//       data: savedVehicle
//     });
    
//   } catch (error) {
//     console.error("Create Vehicle Error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error Creating Vehicle",
//       error: error.message
//     });
//   }
// };



// // Get all vehicles
// const getNewVehicles = async (req, res) => {
//   try {
//     const { page = 1, limit = 50, search, vehicleType, city, status } = req.query;
    
//     let query = {};
    
//     if (search) {
//       query.$or = [
//         { "basicInfo.vehicleName": { $regex: search, $options: "i" } },
//         { "basicInfo.registrationNumbers": { $in: [new RegExp(search, "i")] } },
//         { "basicInfo.vehicleId": { $regex: search, $options: "i" } },
//       ];
//     }
    
//     if (vehicleType) query["basicInfo.vehicleType"] = vehicleType;
//     if (city) query["basicInfo.city"] = city;
//     if (status !== undefined) query["basicInfo.status"] = status === "true";
    
//     const skip = (parseInt(page) - 1) * parseInt(limit);
    
//     const [vehicles, total] = await Promise.all([
//       Vehicle.find(query)
//         .sort({ createdAt: -1 })
//         .skip(skip)
//         .limit(parseInt(limit)),
//       Vehicle.countDocuments(query),
//     ]);
    
//     res.status(200).json({
//       success: true,
//       count: vehicles.length,
//       total,
//       page: parseInt(page),
//       totalPages: Math.ceil(total / parseInt(limit)),
//       data: vehicles,
//     });
    
//   } catch (error) {
//     console.error("Get Vehicles Error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error Fetching Vehicles",
//       error: error.message,
//     });
//   }
// };

// // Get single vehicle by ID
// const getVehicleById = async (req, res) => {
//   try {
//     const { id } = req.params;
    
//     if (!mongoose.Types.ObjectId.isValid(id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid Vehicle ID",
//       });
//     }
    
//     const vehicle = await Vehicle.findById(id);
    
//     if (!vehicle) {
//       return res.status(404).json({
//         success: false,
//         message: "Vehicle not found",
//       });
//     }
    
//     res.status(200).json({
//       success: true,
//       data: vehicle,
//     });
    
//   } catch (error) {
//     console.error("Get Vehicle Error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error Fetching Vehicle",
//       error: error.message,
//     });
//   }
// };

// // Update vehicle
// const updateVehicle = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const parsedData = parseFormData(req);
//     const { basicInfo, techSpecs, vehicleDetails, pricing, driverDetails, statusAvailability, maintenanceInfo } = parsedData;
    
//     if (!mongoose.Types.ObjectId.isValid(id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid Vehicle ID",
//       });
//     }
    
//     const existingVehicle = await Vehicle.findById(id);
//     if (!existingVehicle) {
//       return res.status(404).json({
//         success: false,
//         message: "Vehicle Not Found",
//       });
//     }
    
//     const updatedVehicle = await Vehicle.findByIdAndUpdate(
//       id,
//       {
//         $set: {
//           basicInfo,
//           techSpecs,
//           vehicleDetails,
//           pricing,
//           driverDetails,
//           statusAvailability,
//           maintenanceInfo
//         }
//       },
//       { new: true, runValidators: true }
//     );
    
//     return res.status(200).json({
//       success: true,
//       message: "Vehicle Updated Successfully",
//       data: updatedVehicle,
//     });
    
//   } catch (error) {
//     console.error("Update Vehicle Error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error Updating Vehicle",
//       error: error.message,
//     });
//   }
// };

// // Delete vehicle
// const deleteVehicle = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { registrationNumber } = req.body;
    
//     if (!mongoose.Types.ObjectId.isValid(id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid Vehicle ID",
//       });
//     }
    
//     const vehicle = await Vehicle.findById(id);
//     if (!vehicle) {
//       return res.status(404).json({
//         success: false,
//         message: "Vehicle not found",
//       });
//     }
    
//     if (registrationNumber && vehicle.basicInfo?.registrationNumbers?.length > 1) {
//       const updatedNumbers = vehicle.basicInfo.registrationNumbers.filter(num => num !== registrationNumber);
      
//       const updatedVehicle = await Vehicle.findByIdAndUpdate(
//         id,
//         {
//           $set: {
//             "basicInfo.registrationNumbers": updatedNumbers,
//             "basicInfo.vehicleCount": updatedNumbers.length,
//           },
//         },
//         { new: true }
//       );
      
//       return res.status(200).json({
//         success: true,
//         message: `Vehicle ${registrationNumber} removed from group`,
//         data: updatedVehicle,
//       });
//     }
    
//     await Vehicle.findByIdAndDelete(id);
    
//     return res.status(200).json({
//       success: true,
//       message: "Vehicle group deleted successfully",
//     });
    
//   } catch (error) {
//     console.error("Delete Vehicle Error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error Deleting Vehicle",
//       error: error.message,
//     });
//   }
// };

// // Get vehicle statistics
// const getVehicleStatistics = async (req, res) => {
//   try {
//     const [totalVehicles, activeVehicles, byType, byCity] = await Promise.all([
//       Vehicle.countDocuments(),
//       Vehicle.countDocuments({ "basicInfo.status": true }),
//       Vehicle.aggregate([
//         { $group: { _id: "$basicInfo.vehicleType", count: { $sum: "$basicInfo.vehicleCount" } } },
//         { $sort: { count: -1 } },
//       ]),
//       Vehicle.aggregate([
//         { $group: { _id: "$basicInfo.city", count: { $sum: 1 } } },
//         { $sort: { count: -1 } },
//         { $limit: 5 },
//       ]),
//     ]);
    
//     res.status(200).json({
//       success: true,
//       data: {
//         totalVehicles,
//         activeVehicles,
//         inactiveVehicles: totalVehicles - activeVehicles,
//         vehiclesByType: byType,
//         topCities: byCity,
//       },
//     });
    
//   } catch (error) {
//     console.error("Get Statistics Error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error Fetching Statistics",
//       error: error.message,
//     });
//   }
// };

// module.exports = {
//   createVehicle,
//   getNewVehicles,
//   getVehicleById,
//   updateVehicle,
//   deleteVehicle,
//   getVehicleStatistics,
// };




// controllers/VehicleDetailsController/vehicledetails.js

const Vehicle = require("../../Models/vehicleDetails");
const mongoose = require("mongoose");

// Generate unique vehicle ID (ddmmyyyy001 format)
// const generateVehicleId = () => {
//   const now = new Date();
//   const day = String(now.getDate()).padStart(2, '0');
//   const month = String(now.getMonth() + 1).padStart(2, '0');
//   const year = String(now.getFullYear()).slice(-2);
//   const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
//   return `${day}${month}${year}${random}`;
// };


const generateVehicleId = async () => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  
  // Check for existing IDs to avoid duplicates
  let vehicleId;
  let isUnique = false;
  let attempt = 0;
  
  while (!isUnique && attempt < 10) {
    const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    vehicleId = `${day}${month}${year}${random}`;
    
    const existing = await Vehicle.findOne({
      "registrationVehicles.vehicleId": vehicleId
    });
    
    if (!existing) {
      isUnique = true;
    }
    attempt++;
  }
  
  return vehicleId;
};


// Helper function to clean registration number (remove spaces)
const cleanRegistrationNumber = (regNumber) => {
  if (!regNumber) return "";
  return regNumber.replace(/\s/g, "").toUpperCase();
};

// Helper function to format registration number with spaces
const formatRegistrationNumber = (regNumber) => {
  const clean = cleanRegistrationNumber(regNumber);
  if (clean.length !== 10) return regNumber;
  return `${clean.slice(0,2)} ${clean.slice(2,4)} ${clean.slice(4,6)} ${clean.slice(6,10)}`;
};

// Helper function to validate registration number
const isValidRegistrationNumber = (regNumber) => {
  const clean = cleanRegistrationNumber(regNumber);
  if (clean.length !== 10) return false;
  return /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/.test(clean);
};

// Create new vehicle(s)
const createVehicle = async (req, res) => {
  try {
    console.log("=== CREATE VEHICLE REQUEST ===");
    
    let parsedData;
    if (req.body.data) {
      parsedData = JSON.parse(req.body.data);
    } else {
      parsedData = req.body;
    }
    
    const { 
      basicInfo, 
      techSpecs, 
      pricing, 
      registrationVehicles,
      mediaFiles,
      vehicleDescription
    } = parsedData;
    
    // Validate basic info
    if (!basicInfo?.vehicleType) {
      return res.status(400).json({
        success: false,
        message: "Vehicle type is required"
      });
    }
    
    // Validate registration vehicles
    if (!registrationVehicles || registrationVehicles.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one registration vehicle is required"
      });
    }
    
    // Process media files from request
    const processedMediaFiles = {};
    const mediaFields = ['frontViewImage', 'leftSideImage', 'rightSideImage', 'rearViewImage', 'interiorImage', 'demoVideo'];
    
    mediaFields.forEach(field => {
      if (req.files && req.files[field] && req.files[field][0]) {
        // Get file path or URL based on storage type
        const file = req.files[field][0];
        if (file.path) {
          processedMediaFiles[field] = file.path;
        } else if (file.filename) {
          // For Cloudinary
          processedMediaFiles[field] = file.path || file.url;
        }
      } else if (mediaFiles && mediaFiles[field]) {
        processedMediaFiles[field] = mediaFiles[field];
      } else {
        processedMediaFiles[field] = "";
      }
    });
    
    // Process each registration vehicle
    const processedVehicles = [];
    const duplicateRegNumbers = [];
    const invalidRegNumbers = [];
    
    for (const regVehicle of registrationVehicles) {
      const cleanReg = cleanRegistrationNumber(regVehicle.registrationNumber);
      
      // Validate registration number format
      if (!isValidRegistrationNumber(cleanReg)) {
        invalidRegNumbers.push(regVehicle.registrationNumber);
        continue;
      }
      
      // Check for duplicate in existing database
      const existingVehicle = await Vehicle.findOne({
        "registrationVehicles.registrationNumber": cleanReg
      });
      
      if (existingVehicle) {
        duplicateRegNumbers.push(cleanReg);
        continue;
      }
      
      // Generate vehicle ID for this registration (consistent and unique)
      const vehicleId = await generateVehicleId();
      
      // Process status availability
      let statusAvailability = {
        currentStatus: regVehicle.currentStatus || "Available",
        availableFrom: null,
        remarks: ""
      };
      
      if (regVehicle.currentStatus === "Unavailable") {
        statusAvailability = {
          currentStatus: "Unavailable",
          availableFrom: regVehicle.availableFrom || null,
          remarks: regVehicle.remarks || ""
        };
      }
      
      // Create registration vehicle object with formatted registration number (store without spaces)
      processedVehicles.push({
        registrationNumber: cleanReg, // Store without spaces
        vehicleId: vehicleId,
        city: regVehicle.city,
        modelConfig: regVehicle.modelConfig,
        permitType: regVehicle.permitType,
        ownershipType: regVehicle.ownershipType,
        fuelType: regVehicle.fuelType,
        manufacturingYear: regVehicle.manufacturingYear || "",
        gpsEnabled: regVehicle.gpsEnabled !== undefined ? regVehicle.gpsEnabled : true,
        activeStatus: regVehicle.activeStatus !== undefined ? regVehicle.activeStatus : true,
        statusAvailability: statusAvailability,
        maintenance: {
          lastServiceDate: regVehicle.lastServiceDate || null,
          insuranceExpiryDate: regVehicle.insuranceExpiryDate || null,
          pollutionExpiryDate: regVehicle.pollutionExpiryDate || null
        },
        driverDetails: {
          driverName: regVehicle.driverName || "",
          driverPhone: regVehicle.driverPhone || "",
          backupDriver: regVehicle.backupDriver || "",
          backupDriverPhone: regVehicle.backupDriverPhone || "",
          driverCharges: regVehicle.driverCharges || 0
        }
      });
    }
    
    // Check for invalid registration numbers
    if (invalidRegNumbers.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid registration number format: ${invalidRegNumbers.join(", ")}`,
        invalid: invalidRegNumbers
      });
    }
    
    // Check for duplicates
    if (duplicateRegNumbers.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Registration numbers already exist: ${duplicateRegNumbers.join(", ")}`,
        duplicates: duplicateRegNumbers
      });
    }
    
    // Check if group already exists (same vehicle type)
    let existingGroup = await Vehicle.findOne({
      "basicInfo.vehicleType": basicInfo.vehicleType
    });
    
    if (existingGroup) {
      // Add to existing group
      existingGroup.registrationVehicles.push(...processedVehicles);
      existingGroup.totalVehicles = existingGroup.registrationVehicles.length;
      await existingGroup.save();
      
      return res.status(200).json({
        success: true,
        message: `${processedVehicles.length} vehicle(s) added to existing group. Total: ${existingGroup.totalVehicles} vehicles`,
        data: existingGroup
      });
    }
    
    // Create new group
    const vehicleData = {
      basicInfo: {
        customizedType: basicInfo.customizedType || "Non-Customized",
        vehicleType: basicInfo.vehicleType
      },
       vehicleDescription: vehicleDescription || "",
      techSpecs: techSpecs || {},
      pricing: pricing || {},
      mediaFiles: processedMediaFiles,
      registrationVehicles: processedVehicles,
      totalVehicles: processedVehicles.length
    };
    
    const vehicle = new Vehicle(vehicleData);
    const savedVehicle = await vehicle.save();
    
    res.status(201).json({
      success: true,
      message: `${processedVehicles.length} vehicle(s) created successfully`,
      data: savedVehicle
    });
    
  } catch (error) {
    console.error("Create Vehicle Error:", error);
    res.status(500).json({
      success: false,
      message: "Error Creating Vehicle",
      error: error.message
    });
  }
};

// Get all vehicles
const getNewVehicles = async (req, res) => {
  try {
    const { page = 1, limit = 50, search, vehicleType, city, status } = req.query;
    
    let query = {};
    
    if (search) {
      const cleanSearch = cleanRegistrationNumber(search);
      query.$or = [
        { "registrationVehicles.registrationNumber": { $regex: cleanSearch, $options: "i" } },
        { "basicInfo.vehicleType": { $regex: search, $options: "i" } }
      ];
    }
    
    if (vehicleType) query["basicInfo.vehicleType"] = vehicleType;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [vehicles, total] = await Promise.all([
      Vehicle.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Vehicle.countDocuments(query),
    ]);
    
    // Filter by city and status if needed
    let filteredVehicles = vehicles;
    if (city) {
      filteredVehicles = vehicles.filter(v => 
        v.registrationVehicles.some(rv => rv.city === city)
      );
    }
    
    if (status !== undefined) {
      const statusBool = status === "true";
      filteredVehicles = vehicles.filter(v => 
        v.registrationVehicles.some(rv => rv.activeStatus === statusBool)
      );
    }
    
    res.status(200).json({
      success: true,
      count: filteredVehicles.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      data: filteredVehicles,
    });
    
  } catch (error) {
    console.error("Get Vehicles Error:", error);
    res.status(500).json({
      success: false,
      message: "Error Fetching Vehicles",
      error: error.message,
    });
  }
};

// Get single vehicle by ID
const getVehicleById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Vehicle ID",
      });
    }
    
    const vehicle = await Vehicle.findById(id);
    
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }
    
    res.status(200).json({
      success: true,
      data: vehicle,
    });
    
  } catch (error) {
    console.error("Get Vehicle Error:", error);
    res.status(500).json({
      success: false,
      message: "Error Fetching Vehicle",
      error: error.message,
    });
  }
};

// Get single registration vehicle by registration number (returns formatted number)
const getRegistrationVehicleByNumber = async (req, res) => {
  try {
    const { registrationNumber } = req.params;
    const cleanReg = cleanRegistrationNumber(registrationNumber);
    
    const vehicle = await Vehicle.findOne({
      "registrationVehicles.registrationNumber": cleanReg
    });
    
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }
    
    const regVehicle = vehicle.registrationVehicles.find(
      rv => rv.registrationNumber === cleanReg
    );
    
    // Return with formatted registration number
    const responseData = {
      ...vehicle.toObject(),
      currentRegistrationVehicle: {
        ...regVehicle,
        formattedRegistrationNumber: formatRegistrationNumber(regVehicle.registrationNumber)
      }
    };
    
    res.status(200).json({
      success: true,
      data: responseData,
    });
    
  } catch (error) {
    console.error("Get Registration Vehicle Error:", error);
    res.status(500).json({
      success: false,
      message: "Error Fetching Vehicle",
      error: error.message,
    });
  }
};

// Update vehicle group
const updateVehicle = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Vehicle ID",
      });
    }
    
    let updateData;
    if (req.body.data) {
      updateData = JSON.parse(req.body.data);
    } else {
      updateData = req.body;
    }
    
    // Process media files if any
    const mediaFields = ['frontViewImage', 'leftSideImage', 'rightSideImage', 'rearViewImage', 'interiorImage', 'demoVideo'];
    const mediaUpdates = {};
    
    mediaFields.forEach(field => {
      if (req.files && req.files[field] && req.files[field][0]) {
        const file = req.files[field][0];
        mediaUpdates[`mediaFiles.${field}`] = file.path || file.url;
      }
    });
    
    if (Object.keys(mediaUpdates).length > 0) {
      updateData = { ...updateData, ...mediaUpdates };
    }
    
    const updatedVehicle = await Vehicle.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
    
    if (!updatedVehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle Not Found",
      });
    }
    
    res.status(200).json({
      success: true,
      message: "Vehicle Updated Successfully",
      data: updatedVehicle,
    });
    
  } catch (error) {
    console.error("Update Vehicle Error:", error);
    res.status(500).json({
      success: false,
      message: "Error Updating Vehicle",
      error: error.message,
    });
  }
};

// Update specific registration vehicle
const updateRegistrationVehicle = async (req, res) => {
  try {
    const { id, registrationNumber } = req.params;
    const cleanReg = cleanRegistrationNumber(registrationNumber);
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Vehicle ID",
      });
    }
    
    const vehicle = await Vehicle.findById(id);
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }
    
    const regIndex = vehicle.registrationVehicles.findIndex(
      rv => rv.registrationNumber === cleanReg
    );
    
    if (regIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Registration vehicle not found",
      });
    }
    
    const updateData = req.body;
    
    // Update specific fields
    if (updateData.city) vehicle.registrationVehicles[regIndex].city = updateData.city;
    if (updateData.modelConfig) vehicle.registrationVehicles[regIndex].modelConfig = updateData.modelConfig;
    if (updateData.permitType) vehicle.registrationVehicles[regIndex].permitType = updateData.permitType;
    if (updateData.ownershipType) vehicle.registrationVehicles[regIndex].ownershipType = updateData.ownershipType;
    if (updateData.fuelType) vehicle.registrationVehicles[regIndex].fuelType = updateData.fuelType;
    if (updateData.manufacturingYear) vehicle.registrationVehicles[regIndex].manufacturingYear = updateData.manufacturingYear;
    if (updateData.gpsEnabled !== undefined) vehicle.registrationVehicles[regIndex].gpsEnabled = updateData.gpsEnabled;
    if (updateData.activeStatus !== undefined) vehicle.registrationVehicles[regIndex].activeStatus = updateData.activeStatus;
    
    // Update status availability
    if (updateData.currentStatus) {
      vehicle.registrationVehicles[regIndex].statusAvailability.currentStatus = updateData.currentStatus;
      if (updateData.currentStatus === "Unavailable") {
        vehicle.registrationVehicles[regIndex].statusAvailability.availableFrom = updateData.availableFrom || null;
        vehicle.registrationVehicles[regIndex].statusAvailability.remarks = updateData.remarks || "";
      } else {
        vehicle.registrationVehicles[regIndex].statusAvailability.availableFrom = null;
        vehicle.registrationVehicles[regIndex].statusAvailability.remarks = "";
      }
    }
    
    // Update maintenance
    if (updateData.lastServiceDate !== undefined) vehicle.registrationVehicles[regIndex].maintenance.lastServiceDate = updateData.lastServiceDate || null;
    if (updateData.insuranceExpiryDate !== undefined) vehicle.registrationVehicles[regIndex].maintenance.insuranceExpiryDate = updateData.insuranceExpiryDate || null;
    if (updateData.pollutionExpiryDate !== undefined) vehicle.registrationVehicles[regIndex].maintenance.pollutionExpiryDate = updateData.pollutionExpiryDate || null;
    
    // Update driver details
    if (updateData.driverName !== undefined) vehicle.registrationVehicles[regIndex].driverDetails.driverName = updateData.driverName || "";
    if (updateData.driverPhone !== undefined) vehicle.registrationVehicles[regIndex].driverDetails.driverPhone = updateData.driverPhone || "";
    if (updateData.backupDriver !== undefined) vehicle.registrationVehicles[regIndex].driverDetails.backupDriver = updateData.backupDriver || "";
    if (updateData.backupDriverPhone !== undefined) vehicle.registrationVehicles[regIndex].driverDetails.backupDriverPhone = updateData.backupDriverPhone || "";
    if (updateData.driverCharges !== undefined) vehicle.registrationVehicles[regIndex].driverDetails.driverCharges = updateData.driverCharges || 0;
    
    await vehicle.save();
    
    res.status(200).json({
      success: true,
      message: "Registration vehicle updated successfully",
      data: vehicle
    });
    
  } catch (error) {
    console.error("Update Registration Vehicle Error:", error);
    res.status(500).json({
      success: false,
      message: "Error Updating Registration Vehicle",
      error: error.message,
    });
  }
};

// Delete vehicle group
const deleteVehicle = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Vehicle ID",
      });
    }
    
    const vehicle = await Vehicle.findByIdAndDelete(id);
    
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }
    
    res.status(200).json({
      success: true,
      message: "Vehicle group deleted successfully",
    });
    
  } catch (error) {
    console.error("Delete Vehicle Error:", error);
    res.status(500).json({
      success: false,
      message: "Error Deleting Vehicle",
      error: error.message,
    });
  }
};

// Delete specific registration vehicle from group
const deleteRegistrationVehicle = async (req, res) => {
  try {
    const { id, registrationNumber } = req.params;
    const cleanReg = cleanRegistrationNumber(registrationNumber);
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Vehicle ID",
      });
    }
    
    const vehicle = await Vehicle.findById(id);
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }
    
    const regIndex = vehicle.registrationVehicles.findIndex(
      rv => rv.registrationNumber === cleanReg
    );
    
    if (regIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Registration vehicle not found",
      });
    }
    
    // Remove the registration vehicle
    vehicle.registrationVehicles.splice(regIndex, 1);
    vehicle.totalVehicles = vehicle.registrationVehicles.length;
    
    // If no vehicles left, delete the entire group
    if (vehicle.registrationVehicles.length === 0) {
      await Vehicle.findByIdAndDelete(id);
      return res.status(200).json({
        success: true,
        message: "Vehicle group deleted as no vehicles remain",
      });
    }
    
    await vehicle.save();
    
    res.status(200).json({
      success: true,
      message: `Vehicle ${formatRegistrationNumber(cleanReg)} removed successfully`,
      data: vehicle
    });
    
  } catch (error) {
    console.error("Delete Registration Vehicle Error:", error);
    res.status(500).json({
      success: false,
      message: "Error Deleting Registration Vehicle",
      error: error.message,
    });
  }
};

// Get vehicle statistics
const getVehicleStatistics = async (req, res) => {
  try {
    const vehicles = await Vehicle.find();
    
    let totalVehicles = 0;
    let activeVehicles = 0;
    const cityStats = {};
    const typeStats = {};
    
    for (const vehicle of vehicles) {
      for (const regVehicle of vehicle.registrationVehicles) {
        totalVehicles++;
        if (regVehicle.activeStatus) activeVehicles++;
        
        // City statistics
        if (regVehicle.city) {
          cityStats[regVehicle.city] = (cityStats[regVehicle.city] || 0) + 1;
        }
        
        // Type statistics
        if (vehicle.basicInfo.vehicleType) {
          typeStats[vehicle.basicInfo.vehicleType] = (typeStats[vehicle.basicInfo.vehicleType] || 0) + 1;
        }
      }
    }
    
    const topCities = Object.entries(cityStats)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    const vehiclesByType = Object.entries(typeStats)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
    
    res.status(200).json({
      success: true,
      data: {
        totalVehicles,
        activeVehicles,
        inactiveVehicles: totalVehicles - activeVehicles,
        topCities,
        vehiclesByType,
      },
    });
    
  } catch (error) {
    console.error("Get Statistics Error:", error);
    res.status(500).json({
      success: false,
      message: "Error Fetching Statistics",
      error: error.message,
    });
  }
};

// Check if registration number exists (for real-time validation)
const checkRegistrationExists = async (req, res) => {
  try {
    const { registrationNumber } = req.params;
    const cleanReg = cleanRegistrationNumber(registrationNumber);
    
    const existingVehicle = await Vehicle.findOne({
      "registrationVehicles.registrationNumber": cleanReg
    });
    
    res.status(200).json({
      success: true,
      exists: !!existingVehicle,
      registrationNumber: cleanReg
    });
    
  } catch (error) {
    console.error("Check Registration Error:", error);
    res.status(500).json({
      success: false,
      message: "Error checking registration number",
      error: error.message,
    });
  }
};


// Function to generate unique vehicle ID
const generateUniqueVehicleIdInternal = async () => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  
  let vehicleId;
  let isUnique = false;
  let attempts = 0;
  
  while (!isUnique && attempts < 20) {
    const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    vehicleId = `${day}${month}${year}${random}`;
    
    const existing = await Vehicle.findOne({
      "registrationVehicles.vehicleId": vehicleId
    });
    
    if (!existing) {
      isUnique = true;
    }
    attempts++;
  }
  
  return vehicleId;
};

// Add this endpoint handler
const generateUniqueVehicleId = async (req, res) => {
  try {
    const vehicleId = await generateUniqueVehicleIdInternal();
    res.status(200).json({
      success: true,
      vehicleId: vehicleId
    });
  } catch (error) {
    console.error("Error generating vehicle ID:", error);
    res.status(500).json({
      success: false,
      message: "Error generating vehicle ID",
      error: error.message
    });
  }
};

// Add this function for single registration vehicle creation
const createRegistrationVehicle = async (req, res) => {
  try {
    const formData = req.body;
    const files = req.files;
    
    const cleanReg = cleanRegistrationNumber(formData.registrationNumber);
    
    if (!isValidRegistrationNumber(cleanReg)) {
      return res.status(400).json({
        success: false,
        message: "Invalid registration number format"
      });
    }
    
    const existingVehicle = await Vehicle.findOne({
      "registrationVehicles.registrationNumber": cleanReg
    });
    
    if (existingVehicle) {
      return res.status(400).json({
        success: false,
        message: "Registration number already exists"
      });
    }
    
    const vehicleId = await generateUniqueVehicleIdInternal();
    
    // Process media files
    const mediaFiles = {};
    const mediaFields = ['frontViewImage', 'leftSideImage', 'rightSideImage', 'rearViewImage', 'interiorImage', 'demoVideo'];
    
    mediaFields.forEach(field => {
      if (files && files[field] && files[field][0]) {
        mediaFiles[field] = files[field][0].path || files[field][0].url;
      } else if (formData[field]) {
        mediaFiles[field] = formData[field];
      } else {
        mediaFiles[field] = "";
      }
    });
    
    const registrationVehicle = {
      registrationNumber: cleanReg,
      vehicleId: vehicleId,
      city: formData.city,
      modelConfig: formData.modelConfig,
      permitType: formData.permitType,
      ownershipType: formData.ownershipType,
      fuelType: formData.fuelType,
      manufacturingYear: formData.manufacturingYear || "",
      gpsEnabled: formData.gpsEnabled === 'true',
      activeStatus: formData.activeStatus === 'true',
      statusAvailability: {
        currentStatus: formData.currentStatus || "Available",
        availableFrom: formData.currentStatus === "Unavailable" ? formData.availableFrom : null,
        remarks: formData.currentStatus === "Unavailable" ? formData.remarks : ""
      },
      maintenance: {
        lastServiceDate: formData.lastServiceDate || null,
        insuranceExpiryDate: formData.insuranceExpiryDate || null,
        pollutionExpiryDate: formData.pollutionExpiryDate || null
      },
      driverDetails: {
        driverName: formData.driverName || "",
        driverPhone: formData.driverPhone || "",
        backupDriver: formData.backupDriver || "",
        backupDriverPhone: formData.backupDriverPhone || "",
        driverCharges: formData.driverCharges || 0
      }
    };
    
    let vehicleGroup = await Vehicle.findOne({
      "basicInfo.vehicleType": formData.vehicleType || "Default"
    });
    
    if (!vehicleGroup) {
      vehicleGroup = new Vehicle({
        basicInfo: {
          customizedType: "Non-Customized",
          vehicleType: formData.vehicleType || "Default"
        },
        techSpecs: {},
        pricing: {},
        mediaFiles: mediaFiles,
        registrationVehicles: [registrationVehicle],
        totalVehicles: 1
      });
    } else {
      vehicleGroup.registrationVehicles.push(registrationVehicle);
      vehicleGroup.totalVehicles = vehicleGroup.registrationVehicles.length;
    }
    
    await vehicleGroup.save();
    
    res.status(201).json({
      success: true,
      message: "Vehicle created successfully",
      data: registrationVehicle
    });
    
  } catch (error) {
    console.error("Create Registration Vehicle Error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating vehicle",
      error: error.message
    });
  }
};

// Get vehicles by vehicle type ID
const getVehiclesByType = async (req, res) => {
  try {
    const { typeId } = req.params;
    
    if (!typeId) {
      return res.status(400).json({
        success: false,
        message: "Vehicle type ID is required"
      });
    }
    
    const vehicles = await Vehicle.find({
      "basicInfo.vehicleType": typeId
    }).sort({ createdAt: -1 });
    
    // Extract all registration vehicles from matching vehicle groups
    let allRegistrationVehicles = [];
    
    for (const vehicle of vehicles) {
      if (vehicle.registrationVehicles && vehicle.registrationVehicles.length > 0) {
        allRegistrationVehicles.push({
          groupId: vehicle._id,
          basicInfo: vehicle.basicInfo,
          techSpecs: vehicle.techSpecs,
          pricing: vehicle.pricing,
          mediaFiles: vehicle.mediaFiles,
          registrationVehicles: vehicle.registrationVehicles
        });
      }
    }
    
    res.status(200).json({
      success: true,
      count: allRegistrationVehicles.length,
      data: allRegistrationVehicles
    });
    
  } catch (error) {
    console.error("Get Vehicles By Type Error:", error);
    res.status(500).json({
      success: false,
      message: "Error Fetching Vehicles By Type",
      error: error.message
    });
  }
};
// Add this endpoint to get vehicle group by type
const getVehicleGroupByType = async (req, res) => {
  try {
    const { typeId } = req.params;
    
    if (!typeId) {
      return res.status(400).json({
        success: false,
        message: "Vehicle type ID is required"
      });
    }
    
    const vehicle = await Vehicle.findOne({
      "basicInfo.vehicleType": typeId
    });
    
    if (!vehicle) {
      return res.status(200).json({
        success: false,
        message: "No vehicle found for this type",
        data: null
      });
    }
    
    res.status(200).json({
      success: true,
      data: vehicle
    });
    
  } catch (error) {
    console.error("Get Vehicle Group By Type Error:", error);
    res.status(500).json({
      success: false,
      message: "Error Fetching Vehicle Group",
      error: error.message
    });
  }
};


module.exports = {
  createVehicle,
  getNewVehicles,
  getVehicleById,
  getRegistrationVehicleByNumber,
  updateVehicle,
  updateRegistrationVehicle,
  deleteVehicle,
  deleteRegistrationVehicle,
  getVehicleStatistics,
  checkRegistrationExists,
  generateUniqueVehicleId,
  createRegistrationVehicle,
  getVehiclesByType,
  getVehicleGroupByType
};