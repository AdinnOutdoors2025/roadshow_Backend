// controllers/VehicleDetailsController/vehicledetails.js
const Vehicle = require("../../Models/vehicleDetails");
const mongoose = require("mongoose");

// Generate unique vehicle ID (ddmmyyyy001 format)
const generateVehicleId = async () => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = String(now.getFullYear()).slice(-2);

  let vehicleId;
  let isUnique = false;
  let attempt = 0;

  while (!isUnique && attempt < 10) {
    const random = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
    vehicleId = `${day}${month}${year}${random}`;

    const existing = await Vehicle.findOne({
      "registrationVehicles.vehicleId": vehicleId,
    });

    if (!existing) {
      isUnique = true;
    }
    attempt++;
  }

  if (!vehicleId || !isUnique) {
    vehicleId = `${day}${month}${year}${String(Date.now()).slice(-3)}`;
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
  return `${clean.slice(0, 2)} ${clean.slice(2, 4)} ${clean.slice(4, 6)} ${clean.slice(6, 10)}`;
};

// Helper function to validate registration number
const isValidRegistrationNumber = (regNumber) => {
  const clean = cleanRegistrationNumber(regNumber);
  if (clean.length !== 10) return false;
  return /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/.test(clean);
};

// Helper function to get file URL (handles both local and Spaces)
const getFileUrl = (file) => {
  if (!file) return "";
  if (typeof file === "string") return file;
  if (file.location) return file.location;
  if (file.path) {
    const baseUrl = process.env.NODE_ENV === "production" 
      ? process.env.PRODUCTION_BASE_URL 
      : process.env.LOCAL_BASE_URL || "http://localhost:3001";
    const relativePath = file.path.replace(process.cwd(), "").replace(/\\/g, "/");
    return `${baseUrl}${relativePath}`;
  }
  return "";
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
      vehicleDescription,
    } = parsedData;

    // Validate basic info
    if (!basicInfo?.vehicleType) {
      return res.status(400).json({
        success: false,
        message: "Vehicle type is required",
      });
    }

    // Validate registration vehicles
    if (!registrationVehicles || registrationVehicles.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one registration vehicle is required",
      });
    }

    // Process media files from request
    const processedMediaFiles = {};
    const mediaFields = [
      "frontViewImage",
      "leftSideImage",
      "rightSideImage",
      "rearViewImage",
      "interiorImage",
      "demoVideo",
    ];

    mediaFields.forEach((field) => {
      if (req.files && req.files[field] && req.files[field][0]) {
        const file = req.files[field][0];
        processedMediaFiles[field] = getFileUrl(file);
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
        "registrationVehicles.registrationNumber": cleanReg,
      });

      if (existingVehicle) {
        duplicateRegNumbers.push(cleanReg);
        continue;
      }

      // Generate vehicle ID for this registration
      const vehicleId = await generateVehicleId();

      // Resolve statusAvailability
      const currentStatus =
        regVehicle.statusAvailability?.currentStatus ||
        regVehicle.currentStatus ||
        "Available";

      let statusAvailability = {
        currentStatus,
        availableFrom: null,
        remarks: "",
      };

      if (currentStatus === "Unavailable") {
        statusAvailability = {
          currentStatus: "Unavailable",
          availableFrom:
            regVehicle.statusAvailability?.availableFrom ||
            regVehicle.availableFrom ||
            null,
          remarks:
            regVehicle.statusAvailability?.remarks || regVehicle.remarks || "",
        };
      }

      // Resolve maintenance
      const maintenance = {
        lastServiceDate:
          regVehicle.maintenance?.lastServiceDate ||
          regVehicle.lastServiceDate ||
          null,
        insuranceExpiryDate:
          regVehicle.maintenance?.insuranceExpiryDate ||
          regVehicle.insuranceExpiryDate ||
          null,
        pollutionExpiryDate:
          regVehicle.maintenance?.pollutionExpiryDate ||
          regVehicle.pollutionExpiryDate ||
          null,
      };

      // Resolve driverDetails
      const driverDetails = {
        driverName: regVehicle.driverDetails?.driverName || regVehicle.driverName || "",
        driverPhone: regVehicle.driverDetails?.driverPhone || regVehicle.driverPhone || "",
        backupDriver: regVehicle.driverDetails?.backupDriver || regVehicle.backupDriver || "",
        backupDriverPhone:
          regVehicle.driverDetails?.backupDriverPhone || regVehicle.backupDriverPhone || "",
        driverCharges: regVehicle.driverDetails?.driverCharges ?? regVehicle.driverCharges ?? 0,
      };

      processedVehicles.push({
        registrationNumber: cleanReg,
        vehicleId: vehicleId,
        city: regVehicle.city,
        modelConfig: regVehicle.modelConfig || "",
        permitType: regVehicle.permitType || "",
        ownershipType: regVehicle.ownershipType || "",
        fuelType: regVehicle.fuelType || "",
        manufacturingYear: regVehicle.manufacturingYear || "",
        gpsEnabled: regVehicle.gpsEnabled !== undefined ? regVehicle.gpsEnabled : true,
        activeStatus: regVehicle.activeStatus !== undefined ? regVehicle.activeStatus : true,
        statusAvailability,
        maintenance,
        driverDetails,
      });
    }

    // Check for invalid registration numbers
    if (invalidRegNumbers.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid registration number format: ${invalidRegNumbers.join(", ")}`,
        invalid: invalidRegNumbers,
      });
    }

    // Check for duplicates
    if (duplicateRegNumbers.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Registration numbers already exist: ${duplicateRegNumbers.join(", ")}`,
        duplicates: duplicateRegNumbers,
      });
    }

    // Build techSpecs with new field structure
    const updatedTechSpecs = {
      screenType: techSpecs?.screenType || "LED Only",
      numberOfScreens: techSpecs?.numberOfScreens || "",
      leftRightScreenWidth: techSpecs?.leftRightScreenWidth || techSpecs?.screenSizeWidth || "",
      leftRightScreenHeight: techSpecs?.leftRightScreenHeight || techSpecs?.screenSizeHeight || "",
      backScreenWidth: techSpecs?.backScreenWidth || "",
      backScreenHeight: techSpecs?.backScreenHeight || "",
      leftRightResolutionWidth: techSpecs?.leftRightResolutionWidth || "",
      leftRightResolutionHeight: techSpecs?.leftRightResolutionHeight || "",
      backResolutionWidth: techSpecs?.backResolutionWidth || "",
      backResolutionHeight: techSpecs?.backResolutionHeight || "",
      audioOutput: techSpecs?.audioOutput || "",
      brightness: techSpecs?.brightness || "",
      displayVersion: techSpecs?.displayVersion || "",
      soundQuality: techSpecs?.soundQuality || "",
      generatorCapacity: techSpecs?.generatorCapacity || "",
      additionalFeatures: techSpecs?.additionalFeatures || "",
    };

    // Check if group already exists (same vehicle type)
    let existingGroup = await Vehicle.findOne({
      "basicInfo.vehicleType": basicInfo.vehicleType,
    });

    if (existingGroup) {
      // Add to existing group
      existingGroup.registrationVehicles.push(...processedVehicles);
      existingGroup.totalVehicles = existingGroup.registrationVehicles.length;
      
      if (vehicleDescription !== undefined) {
        existingGroup.vehicleDescription = vehicleDescription;
      }
      
      // Update techSpecs if provided
      if (Object.keys(updatedTechSpecs).some(key => updatedTechSpecs[key])) {
        existingGroup.techSpecs = updatedTechSpecs;
      }
      
      // Update pricing if provided
      if (pricing) {
        existingGroup.pricing = {
          basePriceType: pricing.basePriceType || existingGroup.pricing.basePriceType,
          costPerDay: Number(pricing.costPerDay) || existingGroup.pricing.costPerDay,
          avgKmPerDay: Number(pricing.avgKmPerDay) || existingGroup.pricing.avgKmPerDay,
          extraKmPrice: Number(pricing.extraKmPrice) || existingGroup.pricing.extraKmPrice,
          avgBookingHrs: Number(pricing.avgBookingHrs) || existingGroup.pricing.avgBookingHrs,
          extraHrPrice: Number(pricing.extraHrPrice) || existingGroup.pricing.extraHrPrice,
          rtoCharges: Number(pricing.rtoCharges) || existingGroup.pricing.rtoCharges,
          fuelEfficiency: Number(pricing.fuelEfficiency) || existingGroup.pricing.fuelEfficiency,
          minBookingDuration: pricing.minBookingDuration || existingGroup.pricing.minBookingDuration,
          overtimeCharges: Number(pricing.overtimeCharges) || existingGroup.pricing.overtimeCharges,
          waitingCharges: Number(pricing.waitingCharges) || existingGroup.pricing.waitingCharges,
        };
      }
      
      // Update media files if new ones provided
      Object.keys(processedMediaFiles).forEach(field => {
        if (processedMediaFiles[field]) {
          existingGroup.mediaFiles[field] = processedMediaFiles[field];
        }
      });
      
      await existingGroup.save();

      return res.status(200).json({
        success: true,
        message: `${processedVehicles.length} vehicle(s) added to existing group. Total: ${existingGroup.totalVehicles} vehicles`,
        data: existingGroup,
      });
    }

    // Create new group
    const vehicleData = {
      basicInfo: {
        customizedType: basicInfo.customizedType || "Non-Customized",
        vehicleType: basicInfo.vehicleType,
        vehicleName: basicInfo.vehicleName || "",
      },
      vehicleDescription: vehicleDescription || "",
      techSpecs: updatedTechSpecs,
      pricing: {
        basePriceType: pricing?.basePriceType || "Per Day",
        costPerDay: Number(pricing?.costPerDay) || 0,
        avgKmPerDay: Number(pricing?.avgKmPerDay) || 0,
        extraKmPrice: Number(pricing?.extraKmPrice) || 0,
        avgBookingHrs: Number(pricing?.avgBookingHrs) || 0,
        extraHrPrice: Number(pricing?.extraHrPrice) || 0,
        rtoCharges: Number(pricing?.rtoCharges) || 0,
        fuelEfficiency: Number(pricing?.fuelEfficiency) || 0,
        minBookingDuration: pricing?.minBookingDuration || "",
        overtimeCharges: Number(pricing?.overtimeCharges) || 0,
        waitingCharges: Number(pricing?.waitingCharges) || 0,
      },
      mediaFiles: processedMediaFiles,
      registrationVehicles: processedVehicles,
      totalVehicles: processedVehicles.length,
    };

    const vehicle = new Vehicle(vehicleData);
    const savedVehicle = await vehicle.save();

    res.status(201).json({
      success: true,
      message: `${processedVehicles.length} vehicle(s) created successfully`,
      data: savedVehicle,
    });
  } catch (error) {
    console.error("Create Vehicle Error:", error);
    res.status(500).json({
      success: false,
      message: "Error Creating Vehicle",
      error: error.message,
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
        { "basicInfo.vehicleType": { $regex: search, $options: "i" } },
        { "basicInfo.vehicleName": { $regex: search, $options: "i" } },
      ];
    }

    if (vehicleType) query["basicInfo.vehicleType"] = vehicleType;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [vehicles, total] = await Promise.all([
      Vehicle.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Vehicle.countDocuments(query),
    ]);

    let filteredVehicles = vehicles;
    if (city) {
      filteredVehicles = vehicles.filter((v) =>
        v.registrationVehicles.some((rv) => rv.city === city)
      );
    }

    if (status !== undefined) {
      const statusBool = status === "true";
      filteredVehicles = vehicles.filter((v) =>
        v.registrationVehicles.some((rv) => rv.activeStatus === statusBool)
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

// Get single registration vehicle by registration number
const getRegistrationVehicleByNumber = async (req, res) => {
  try {
    const { registrationNumber } = req.params;
    const cleanReg = cleanRegistrationNumber(registrationNumber);

    const vehicle = await Vehicle.findOne({
      "registrationVehicles.registrationNumber": cleanReg,
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found",
      });
    }

    const regVehicle = vehicle.registrationVehicles.find((rv) => rv.registrationNumber === cleanReg);

    const responseData = {
      ...vehicle.toObject(),
      currentRegistrationVehicle: {
        ...regVehicle,
        formattedRegistrationNumber: formatRegistrationNumber(regVehicle.registrationNumber),
      },
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

    // Update registrationVehicles structure
    if (updateData.registrationVehicles && Array.isArray(updateData.registrationVehicles)) {
      updateData.registrationVehicles = updateData.registrationVehicles.map((regVehicle) => {
        const cleanReg = cleanRegistrationNumber(regVehicle.registrationNumber);

        const currentStatus =
          regVehicle.statusAvailability?.currentStatus || regVehicle.currentStatus || "Available";

        const statusAvailability = {
          currentStatus,
          availableFrom:
            currentStatus === "Unavailable"
              ? regVehicle.statusAvailability?.availableFrom || regVehicle.availableFrom || null
              : null,
          remarks:
            currentStatus === "Unavailable"
              ? regVehicle.statusAvailability?.remarks || regVehicle.remarks || ""
              : "",
        };

        const maintenance = {
          lastServiceDate:
            regVehicle.maintenance?.lastServiceDate || regVehicle.lastServiceDate || null,
          insuranceExpiryDate:
            regVehicle.maintenance?.insuranceExpiryDate || regVehicle.insuranceExpiryDate || null,
          pollutionExpiryDate:
            regVehicle.maintenance?.pollutionExpiryDate || regVehicle.pollutionExpiryDate || null,
        };

        const driverDetails = {
          driverName: regVehicle.driverDetails?.driverName || regVehicle.driverName || "",
          driverPhone: regVehicle.driverDetails?.driverPhone || regVehicle.driverPhone || "",
          backupDriver: regVehicle.driverDetails?.backupDriver || regVehicle.backupDriver || "",
          backupDriverPhone:
            regVehicle.driverDetails?.backupDriverPhone || regVehicle.backupDriverPhone || "",
          driverCharges: regVehicle.driverDetails?.driverCharges ?? regVehicle.driverCharges ?? 0,
        };

        return {
          ...regVehicle,
          registrationNumber: cleanReg,
          statusAvailability,
          maintenance,
          driverDetails,
        };
      });
    }

    // Update techSpecs with new structure if present
    if (updateData.techSpecs) {
      updateData.techSpecs = {
        screenType: updateData.techSpecs.screenType || "LED Only",
        numberOfScreens: updateData.techSpecs.numberOfScreens || "",
        leftRightScreenWidth: updateData.techSpecs.leftRightScreenWidth || "",
        leftRightScreenHeight: updateData.techSpecs.leftRightScreenHeight || "",
        backScreenWidth: updateData.techSpecs.backScreenWidth || "",
        backScreenHeight: updateData.techSpecs.backScreenHeight || "",
        leftRightResolutionWidth: updateData.techSpecs.leftRightResolutionWidth || "",
        leftRightResolutionHeight: updateData.techSpecs.leftRightResolutionHeight || "",
        backResolutionWidth: updateData.techSpecs.backResolutionWidth || "",
        backResolutionHeight: updateData.techSpecs.backResolutionHeight || "",
        audioOutput: updateData.techSpecs.audioOutput || "",
        brightness: updateData.techSpecs.brightness || "",
        displayVersion: updateData.techSpecs.displayVersion || "",
        soundQuality: updateData.techSpecs.soundQuality || "",
        generatorCapacity: updateData.techSpecs.generatorCapacity || "",
        additionalFeatures: updateData.techSpecs.additionalFeatures || "",
      };
    }

    // Process media files if any
    const mediaFields = [
      "frontViewImage",
      "leftSideImage",
      "rightSideImage",
      "rearViewImage",
      "interiorImage",
      "demoVideo",
    ];
    const mediaUpdates = {};

    mediaFields.forEach((field) => {
      if (req.files && req.files[field] && req.files[field][0]) {
        const file = req.files[field][0];
        mediaUpdates[`mediaFiles.${field}`] = getFileUrl(file);
      }
    });

    if (Object.keys(mediaUpdates).length > 0) {
      updateData = { ...updateData, ...mediaUpdates };
    }

    // Remove any undefined or null values from updateData
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined || updateData[key] === null) {
        delete updateData[key];
      }
    });

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

    const regIndex = vehicle.registrationVehicles.findIndex((rv) => rv.registrationNumber === cleanReg);

    if (regIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Registration vehicle not found",
      });
    }

    const updateData = req.body;

    if (updateData.city) vehicle.registrationVehicles[regIndex].city = updateData.city;
    if (updateData.modelConfig) vehicle.registrationVehicles[regIndex].modelConfig = updateData.modelConfig;
    if (updateData.permitType) vehicle.registrationVehicles[regIndex].permitType = updateData.permitType;
    if (updateData.ownershipType) vehicle.registrationVehicles[regIndex].ownershipType = updateData.ownershipType;
    if (updateData.fuelType) vehicle.registrationVehicles[regIndex].fuelType = updateData.fuelType;
    if (updateData.manufacturingYear) vehicle.registrationVehicles[regIndex].manufacturingYear = updateData.manufacturingYear;
    if (updateData.gpsEnabled !== undefined) vehicle.registrationVehicles[regIndex].gpsEnabled = updateData.gpsEnabled;
    if (updateData.activeStatus !== undefined) vehicle.registrationVehicles[regIndex].activeStatus = updateData.activeStatus;

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

    if (updateData.lastServiceDate !== undefined)
      vehicle.registrationVehicles[regIndex].maintenance.lastServiceDate = updateData.lastServiceDate || null;
    if (updateData.insuranceExpiryDate !== undefined)
      vehicle.registrationVehicles[regIndex].maintenance.insuranceExpiryDate = updateData.insuranceExpiryDate || null;
    if (updateData.pollutionExpiryDate !== undefined)
      vehicle.registrationVehicles[regIndex].maintenance.pollutionExpiryDate = updateData.pollutionExpiryDate || null;

    if (updateData.driverName !== undefined)
      vehicle.registrationVehicles[regIndex].driverDetails.driverName = updateData.driverName || "";
    if (updateData.driverPhone !== undefined)
      vehicle.registrationVehicles[regIndex].driverDetails.driverPhone = updateData.driverPhone || "";
    if (updateData.backupDriver !== undefined)
      vehicle.registrationVehicles[regIndex].driverDetails.backupDriver = updateData.backupDriver || "";
    if (updateData.backupDriverPhone !== undefined)
      vehicle.registrationVehicles[regIndex].driverDetails.backupDriverPhone = updateData.backupDriverPhone || "";
    if (updateData.driverCharges !== undefined)
      vehicle.registrationVehicles[regIndex].driverDetails.driverCharges = updateData.driverCharges || 0;

    await vehicle.save();

    res.status(200).json({
      success: true,
      message: "Registration vehicle updated successfully",
      data: vehicle,
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

    const regIndex = vehicle.registrationVehicles.findIndex((rv) => rv.registrationNumber === cleanReg);

    if (regIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Registration vehicle not found",
      });
    }

    vehicle.registrationVehicles.splice(regIndex, 1);
    vehicle.totalVehicles = vehicle.registrationVehicles.length;

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
      data: vehicle,
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

        if (regVehicle.city) {
          cityStats[regVehicle.city] = (cityStats[regVehicle.city] || 0) + 1;
        }

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

// Check if registration number exists
const checkRegistrationExists = async (req, res) => {
  try {
    const { registrationNumber } = req.params;
    const cleanReg = cleanRegistrationNumber(registrationNumber);

    const existingVehicle = await Vehicle.findOne({
      "registrationVehicles.registrationNumber": cleanReg,
    });

    res.status(200).json({
      success: true,
      exists: !!existingVehicle,
      registrationNumber: cleanReg,
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

// Generate unique vehicle ID
const generateUniqueVehicleIdInternal = async () => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = String(now.getFullYear()).slice(-2);

  let vehicleId;
  let isUnique = false;
  let attempts = 0;

  while (!isUnique && attempts < 20) {
    const random = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    vehicleId = `${day}${month}${year}${random}`;

    const existing = await Vehicle.findOne({
      "registrationVehicles.vehicleId": vehicleId,
    });

    if (!existing) {
      isUnique = true;
    }
    attempts++;
  }

  if (!vehicleId || !isUnique) {
    vehicleId = `${day}${month}${year}${String(Date.now()).slice(-4)}`;
  }

  return vehicleId;
};

const generateUniqueVehicleId = async (req, res) => {
  try {
    const vehicleId = await generateUniqueVehicleIdInternal();
    res.status(200).json({
      success: true,
      vehicleId: vehicleId,
    });
  } catch (error) {
    console.error("Error generating vehicle ID:", error);
    res.status(500).json({
      success: false,
      message: "Error generating vehicle ID",
      error: error.message,
    });
  }
};

// Create single registration vehicle
const createRegistrationVehicle = async (req, res) => {
  try {
    const formData = req.body;
    const files = req.files;

    const cleanReg = cleanRegistrationNumber(formData.registrationNumber);

    if (!isValidRegistrationNumber(cleanReg)) {
      return res.status(400).json({
        success: false,
        message: "Invalid registration number format",
      });
    }

    const existingVehicle = await Vehicle.findOne({
      "registrationVehicles.registrationNumber": cleanReg,
    });

    if (existingVehicle) {
      return res.status(400).json({
        success: false,
        message: "Registration number already exists",
      });
    }

    const vehicleId = await generateUniqueVehicleIdInternal();

    // Process media files
    const mediaFiles = {};
    const mediaFields = [
      "frontViewImage",
      "leftSideImage",
      "rightSideImage",
      "rearViewImage",
      "interiorImage",
      "demoVideo",
    ];

    mediaFields.forEach((field) => {
      if (files && files[field] && files[field][0]) {
        mediaFiles[field] = getFileUrl(files[field][0]);
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
      gpsEnabled: formData.gpsEnabled === "true",
      activeStatus: formData.activeStatus === "true",
      statusAvailability: {
        currentStatus: formData.currentStatus || "Available",
        availableFrom: formData.currentStatus === "Unavailable" ? formData.availableFrom : null,
        remarks: formData.currentStatus === "Unavailable" ? formData.remarks : "",
      },
      maintenance: {
        lastServiceDate: formData.lastServiceDate || null,
        insuranceExpiryDate: formData.insuranceExpiryDate || null,
        pollutionExpiryDate: formData.pollutionExpiryDate || null,
      },
      driverDetails: {
        driverName: formData.driverName || "",
        driverPhone: formData.driverPhone || "",
        backupDriver: formData.backupDriver || "",
        backupDriverPhone: formData.backupDriverPhone || "",
        driverCharges: formData.driverCharges || 0,
      },
    };

    let vehicleGroup = await Vehicle.findOne({
      "basicInfo.vehicleType": formData.vehicleType || "Default",
    });

    if (!vehicleGroup) {
      vehicleGroup = new Vehicle({
        basicInfo: {
          customizedType: "Non-Customized",
          vehicleType: formData.vehicleType || "Default",
          vehicleName: formData.vehicleName || "",
        },
        vehicleDescription: formData.vehicleDescription || "",
        techSpecs: {},
        pricing: {},
        mediaFiles: mediaFiles,
        registrationVehicles: [registrationVehicle],
        totalVehicles: 1,
      });
    } else {
      vehicleGroup.registrationVehicles.push(registrationVehicle);
      vehicleGroup.totalVehicles = vehicleGroup.registrationVehicles.length;
    }

    await vehicleGroup.save();

    res.status(201).json({
      success: true,
      message: "Vehicle created successfully",
      data: registrationVehicle,
    });
  } catch (error) {
    console.error("Create Registration Vehicle Error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating vehicle",
      error: error.message,
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
        message: "Vehicle type ID is required",
      });
    }

    const vehicles = await Vehicle.find({
      "basicInfo.vehicleType": typeId,
    }).sort({ createdAt: -1 });

    let allRegistrationVehicles = [];

    for (const vehicle of vehicles) {
      if (vehicle.registrationVehicles && vehicle.registrationVehicles.length > 0) {
        allRegistrationVehicles.push({
          groupId: vehicle._id,
          basicInfo: vehicle.basicInfo,
          techSpecs: vehicle.techSpecs,
          pricing: vehicle.pricing,
          mediaFiles: vehicle.mediaFiles,
          registrationVehicles: vehicle.registrationVehicles,
        });
      }
    }

    res.status(200).json({
      success: true,
      count: allRegistrationVehicles.length,
      data: allRegistrationVehicles,
    });
  } catch (error) {
    console.error("Get Vehicles By Type Error:", error);
    res.status(500).json({
      success: false,
      message: "Error Fetching Vehicles By Type",
      error: error.message,
    });
  }
};

// Get vehicle group by type
const getVehicleGroupByType = async (req, res) => {
  try {
    const { typeId } = req.params;

    if (!typeId) {
      return res.status(400).json({
        success: false,
        message: "Vehicle type ID is required",
      });
    }

    const vehicle = await Vehicle.findOne({
      "basicInfo.vehicleType": typeId,
    });

    if (!vehicle) {
      return res.status(200).json({
        success: false,
        message: "No vehicle found for this type",
        data: null,
      });
    }

    res.status(200).json({
      success: true,
      data: vehicle,
    });
  } catch (error) {
    console.error("Get Vehicle Group By Type Error:", error);
    res.status(500).json({
      success: false,
      message: "Error Fetching Vehicle Group",
      error: error.message,
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
  getVehicleGroupByType,
};