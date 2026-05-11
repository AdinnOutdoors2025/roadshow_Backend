// const mongoose = require("mongoose");

// const vehicleSchema = new mongoose.Schema(
//   {
//     // ================= SECTION 1: BASIC INFORMATION =================
//     basicInfo: {
//       customizedType: { type: String, default: "" },
//       vehicleId: { type: String, default: "" },
//       vehicleName: { type: String, required: true },
//       city: { type: String, required: true },
//       permitType: { type: String, default: "" },
//       vehicleType: { type: String, required: true },
//       modelConfig: { type: String, default: "" },
//       gpsEnabled: { type: Boolean, default: true },
//       ownershipType: { type: String, default: "" },
//       manufacturingYear: { type: String, default: "" },
//       status: { type: Boolean, default: true },
//       registrationNumbers: [{ type: String }],
//       vehicleCount: { type: Number, default: 1 },
//       selectedTemplate: { type: String, default: "" },
//     },

//     // ================= SECTION 2: DISPLAY & TECHNICAL SPECIFICATIONS =================
//     techSpecs: {
//       screenType: { type: String, default: "LED Only" },
//       numberOfScreens: { type: String, default: "" },
//       screenSizeWidth: { type: String, default: "" },
//       screenSizeHeight: { type: String, default: "" },
//       backScreenSizeWidth: { type: String, default: "" },
//       backScreenSizeHeight: { type: String, default: "" },
//       resolution: { type: String, default: "" },
//       brightness: { type: String, default: "" },
//       displayVersion: { type: String, default: "" },
//       supportedFormats: { type: String, default: "" },
//       audioSystem: { type: String, default: "" },
//       soundQuality: { type: String, default: "" },
//       generatorCapacity: { type: String, default: "" },
//       visibilityVersion: { type: String, default: "" },
//       additionalFeatures: { type: String, default: "" },
//       videoFormat: { type: String, default: "" },
//       videoSize: { type: String, default: "" },
//       backVideoSize: { type: String, default: "" },
//       audioOutput: { type: String, default: "" },
//     },

//     // ================= SECTION 3: VEHICLE DETAILS =================
//     vehicleDetails: {
//       fuelType: { type: String, default: "" },
//       avgKmPerDay: { type: Number, default: 0 },
//       extraKmPrice: { type: Number, default: 0 },
//       avgBookingHrs: { type: Number, default: 0 },
//       extraHrPrice: { type: Number, default: 0 },
//       rtoCharges: { type: Number, default: 0 },
//       fuelEfficiency: { type: String, default: "" },
//       vehicleDescription: { type: String, default: "" },
//     },

//     // ================= SECTION 4: PRICING & CHARGES =================
//     pricing: {
//       basePriceType: { type: String, default: "Per Day" },
//       costPerDay: { type: Number, default: 0 },
//       kmCost: { type: Number, default: 0 },
//       overtimeCharges: { type: Number, default: 0 },
//       waitingCharges: { type: Number, default: 0 },
//       minBookingDuration: { type: String, default: "" },
//     },

//     // ================= SECTION 5: MAINTENANCE & LIFECYCLE =================
//     maintenanceInfo: {
//       manufacturingYear: { type: String, default: "" },
//       lastServiceDate: { type: Date, default: null },
//       nextServiceDueDate: { type: Date, default: null },
//       insuranceExpiryDate: { type: Date, default: null },
//       pollutionCertificateExpiryDate: { type: Date, default: null },
//       maintenanceStatus: { type: String, enum: ["Yes", "No"], default: "No" },
//       expectedReadyDate: { type: Date, default: null },
//       maintenanceNotes: { type: String, default: "" },
//     },

//     // ================= SECTION 6: DRIVER DETAILS =================
//     driverDetails: {
//       driverName: { type: String, default: "" },
//       driverPhone: { type: String, default: "" },
//       backupDriver: { type: String, default: "" },
//       backupDriverPhone: { type: String, default: "" },
//     },

//     // ================= SECTION 7: STATUS & AVAILABILITY =================
//     statusAvailability: {
//       currentStatus: { 
//         type: String, 
//         enum: ["Available", "Booked", "Maintenance", "Off-Road"],
//         default: "Available"
//       },
//       availableFrom: { type: Date, default: null },
//       remarks: { type: String, default: "" },
//     },

//     // ================= SECTION 8: MEDIA FILES =================
//     mediaFiles: {
//       frontViewImage: { type: String, default: "" },
//       leftSideImage: { type: String, default: "" },
//       rightSideImage: { type: String, default: "" },
//       rearViewImage: { type: String, default: "" },
//       interiorImage: { type: String, default: "" },
//       demoVideo: { type: String, default: "" },
//     },
//   },
//   { timestamps: true }
// );

// // Indexes for faster queries
// vehicleSchema.index({ "basicInfo.vehicleId": 1 });
// vehicleSchema.index({ "basicInfo.registrationNumbers": 1 });
// vehicleSchema.index({ "basicInfo.city": 1 });
// vehicleSchema.index({ createdAt: -1 });

// module.exports = mongoose.model("vehicleDetails", vehicleSchema);







// // Models/vehicleDetails.js

// const mongoose = require("mongoose");

// // Individual Vehicle Registration Schema
// const registrationVehicleSchema = new mongoose.Schema({
//   registrationNumber: { 
//     type: String, 
//     required: true,
//     unique: true,
//     uppercase: true,
//     trim: true,
//     set: function(value) {
//     // Store with spaces preserved
//     const clean = value.replace(/\s/g, "").toUpperCase();
//     if (clean.length === 10) {
//       // Format with spaces: XX NN XX NNNN
//       return `${clean.slice(0,2)} ${clean.slice(2,4)} ${clean.slice(4,6)} ${clean.slice(6,10)}`;
//     }
//     return value;
//   },
//   get: function(value) {
//     // Always return formatted version
//     if (value && value.replace(/\s/g, "").length === 10) {
//       const clean = value.replace(/\s/g, "");
//       return `${clean.slice(0,2)} ${clean.slice(2,4)} ${clean.slice(4,6)} ${clean.slice(6,10)}`;
//     }
//     return value;
//   }

//   },
//   vehicleId: { type: String, required: true },
//   city: { type: String, required: true },
//   modelConfig: { type: String, required: true },
//   permitType: { type: String, required: true },
//   ownershipType: { type: String, required: true },
//   fuelType: { type: String, required: true },
//   manufacturingYear: { type: String, default: "" },
//   gpsEnabled: { type: Boolean, default: true },
//   activeStatus: { type: Boolean, default: true },
  
//   // Status & Availability
//   statusAvailability: {
//     currentStatus: { 
//       type: String, 
//       enum: ["Available", "Unavailable"],
//       default: "Available"
//     },
//     availableFrom: { type: Date, default: null },
//     remarks: { type: String, default: "" }
//   },
  
//   // Maintenance Details
//   maintenance: {
//     lastServiceDate: { type: Date, default: null },
//     insuranceExpiryDate: { type: Date, default: null },
//     pollutionExpiryDate: { type: Date, default: null }
//   },
  
//   // Driver Details
//   driverDetails: {
//     driverName: { type: String, default: "" },
//     driverPhone: { type: String, default: "" },
//     backupDriver: { type: String, default: "" },
//     backupDriverPhone: { type: String, default: "" },
//     driverCharges: { type: Number, default: 0 }
//   }
// }, { timestamps: true });

// // Main Vehicle Schema (Group by Vehicle Name and Type)
// const vehicleSchema = new mongoose.Schema(
//   {
//     // Common Information (Shared across all registration numbers)
//     basicInfo: {
//       customizedType: { type: String, default: "Customized" },
//       vehicleName: { type: String},
//       vehicleType: { type: String, required: true },
//     },
    
//     // Technical Specifications (Shared)
//     techSpecs: {
//       screenType: { type: String, default: "LED Only" },
//       numberOfScreens: { type: String, default: "" },
//       screenSizeWidth: { type: String, default: "" },
//       screenSizeHeight: { type: String, default: "" },
//       resolution: { type: String, default: "" },
//       soundQuality: { type: String, default: "" },
//       generatorCapacity: { type: String, default: "" },
//       additionalFeatures: { type: String, default: "" },
//       videoFormat: { type: String, default: "" },
//       audioOutput: { type: String, default: "" }
//     },
    
//     // Pricing (Shared)
//     pricing: {
//       basePriceType: { type: String, default: "Per Day" },
//       costPerDay: { type: Number, default: 0 },
//       overtimeCharges: { type: Number, default: 0 },
//       waitingCharges: { type: Number, default: 0 },
//       minBookingDuration: { type: String, default: "" }
//     },
    
//     // Media Files (Shared)
//     mediaFiles: {
//       frontViewImage: { type: String, default: "" },
//       leftSideImage: { type: String, default: "" },
//       rightSideImage: { type: String, default: "" },
//       rearViewImage: { type: String, default: "" },
//       interiorImage: { type: String, default: "" },
//       demoVideo: { type: String, default: "" }
//     },
    
//     // Array of Registration Vehicles
//     registrationVehicles: [registrationVehicleSchema],
    
//     // Total count
//     totalVehicles: { type: Number, default: 0 }
//   },
//   { timestamps: true }
// );

// // Indexes for faster queries
// vehicleSchema.index({ "basicInfo.vehicleName": 1 });
// vehicleSchema.index({ "registrationVehicles.registrationNumber": 1 });
// vehicleSchema.index({ createdAt: -1 });

// module.exports = mongoose.model("vehicleDetails", vehicleSchema);










// // Models/vehicleDetails.js

// const mongoose = require("mongoose");

// // Individual Vehicle Registration Schema
// const registrationVehicleSchema = new mongoose.Schema({
//   registrationNumber: { 
//     type: String, 
//     required: true,
//     unique: true,
//     uppercase: true,
//     trim: true,
//     set: function(value) {
//       const clean = value.replace(/\s/g, "").toUpperCase();
//       if (clean.length === 10) {
//         return `${clean.slice(0,2)} ${clean.slice(2,4)} ${clean.slice(4,6)} ${clean.slice(6,10)}`;
//       }
//       return value;
//     },
//     get: function(value) {
//       if (value && value.replace(/\s/g, "").length === 10) {
//         const clean = value.replace(/\s/g, "");
//         return `${clean.slice(0,2)} ${clean.slice(2,4)} ${clean.slice(4,6)} ${clean.slice(6,10)}`;
//       }
//       return value;
//     }
//   },
//   vehicleId: { type: String, required: true },
//   city: { type: String, required: true },
//   modelConfig: { type: String, required: false },
//   permitType: { type: String, required: true },
//   ownershipType: { type: String, required: true },
//   fuelType: { type: String, required: true },
//   manufacturingYear: { 
//     type: String, 
//     default: "",
//     validate: {
//       validator: function(v) {
//         if (!v) return true;
//         const year = parseInt(v);
//         const currentYear = new Date().getFullYear();
//         return !isNaN(year) && year <= currentYear && year >= 1900;
//       },
//       message: props => `Manufacturing year cannot exceed ${new Date().getFullYear()}`
//     }
//   },
//   gpsEnabled: { type: Boolean, default: true },
//   activeStatus: { type: Boolean, default: true },
  
//   // Status & Availability
//   statusAvailability: {
//     currentStatus: { 
//       type: String, 
//       enum: ["Available", "Unavailable"],
//       default: "Available"
//     },
//     availableFrom: { type: Date, default: null },
//     remarks: { type: String, default: "" }
//   },
  
//   // Maintenance Details
//   maintenance: {
//     lastServiceDate: { type: Date, default: null },
//     insuranceExpiryDate: { type: Date, default: null },
//     pollutionExpiryDate: { type: Date, default: null }
//   },
  
//   // Driver Details
//   driverDetails: {
//     driverName: { type: String, default: "" },
//     driverPhone: { 
//       type: String, 
//       default: "",
//       validate: {
//         validator: function(v) {
//           if (!v) return true;
//           return /^\d{10}$/.test(v);
//         },
//         message: props => `${props.value} is not a valid 10-digit phone number`
//       }
//     },
//     backupDriver: { type: String, default: "" },
//     backupDriverPhone: { 
//       type: String, 
//       default: "",
//       validate: {
//         validator: function(v) {
//           if (!v) return true;
//           return /^\d{10}$/.test(v);
//         },
//         message: props => `${props.value} is not a valid 10-digit phone number`
//       }
//     },
//     driverCharges: { type: Number, default: 0 }
//   }
// }, { timestamps: true });

// // Main Vehicle Schema (Group by Vehicle Name and Type)
// const vehicleSchema = new mongoose.Schema(
//   {
//     // Common Information (Shared across all registration numbers)
//     basicInfo: {
//       customizedType: { type: String, default: "Customized" },
//       vehicleName: { type: String },
//       vehicleType: { type: String, required: true },
//     },
    
//     // Technical Specifications (Shared) - Updated with new fields
//     techSpecs: {
//       screenType: { type: String, default: "LED Only" },
//       numberOfScreens: { type: String, default: "" },
//       screenSizeWidth: { type: String, default: "" },
//       screenSizeHeight: { type: String, default: "" },
//       backScreenWidth: { type: String, default: "" },
//       backScreenHeight: { type: String, default: "" },
//       resolution: { type: String, default: "" },
//       backResolution: { type: String, default: "" },
//       videoSize: { type: String, default: "" },
//       backVideoSize: { type: String, default: "" },
//       audioOutput: { type: String, default: "" },
//       brightness: { type: String, default: "" },
//       displayVersion: { type: String, default: "" },
//       soundQuality: { type: String, default: "" },
//       generatorCapacity: { type: String, default: "" },
//       additionalFeatures: { type: String, default: "" },
//       videoFormat: { type: String, default: "" }
//     },
    
//     // Pricing (Shared) - Updated with new fields
//     pricing: {
//       basePriceType: { type: String, default: "Per Day" },
//       costPerDay: { type: Number, default: 0 },
//       avgKmPerDay: { type: Number, default: 0 },
//       extraKmPrice: { type: Number, default: 0 },
//       avgBookingHrs: { type: Number, default: 0 },
//       extraHrPrice: { type: Number, default: 0 },
//       rtoCharges: { type: Number, default: 0 },
//       fuelEfficiency: { type: Number, default: 0 },
//       minBookingDuration: { type: String, default: "" },
//       overtimeCharges: { type: Number, default: 0 },
//       waitingCharges: { type: Number, default: 0 }
//     },
    
//     // Media Files (Shared)
//     mediaFiles: {
//       frontViewImage: { type: String, default: "" },
//       leftSideImage: { type: String, default: "" },
//       rightSideImage: { type: String, default: "" },
//       rearViewImage: { type: String, default: "" },
//       interiorImage: { type: String, default: "" },
//       demoVideo: { type: String, default: "" }
//     },
    
//     // Array of Registration Vehicles
//     registrationVehicles: [registrationVehicleSchema],
    
//     // Total count
//     totalVehicles: { type: Number, default: 0 }
//   },
//   { timestamps: true }
// );

// // Indexes for faster queries
// vehicleSchema.index({ "basicInfo.vehicleName": 1 });
// vehicleSchema.index({ "registrationVehicles.registrationNumber": 1 });
// vehicleSchema.index({ createdAt: -1 });

// module.exports = mongoose.model("vehicleDetails", vehicleSchema);








const mongoose = require("mongoose");

// Individual Vehicle Registration Schema
const registrationVehicleSchema = new mongoose.Schema({
  registrationNumber: { 
    type: String, 
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    set: function(value) {
      const clean = value.replace(/\s/g, "").toUpperCase();
      if (clean.length === 10) {
        return `${clean.slice(0,2)} ${clean.slice(2,4)} ${clean.slice(4,6)} ${clean.slice(6,10)}`;
      }
      return value;
    },
    get: function(value) {
      if (value && value.replace(/\s/g, "").length === 10) {
        const clean = value.replace(/\s/g, "");
        return `${clean.slice(0,2)} ${clean.slice(2,4)} ${clean.slice(4,6)} ${clean.slice(6,10)}`;
      }
      return value;
    }
  },
  vehicleId: { type: String, required: true },
  city: { type: String, required: true },
  modelConfig: { type: String, default: "" },
  permitType: { type: String, default: "" },
  ownershipType: { type: String, default: "" },
  fuelType: { type: String, default: "" },
  manufacturingYear: { 
    type: String, 
    default: "",
    validate: {
      validator: function(v) {
        if (!v) return true;
        const year = parseInt(v);
        const currentYear = new Date().getFullYear();
        return !isNaN(year) && year <= currentYear && year >= 1900;
      },
      message: props => `Manufacturing year cannot exceed ${new Date().getFullYear()}`
    }
  },
  gpsEnabled: { type: Boolean, default: true },
  activeStatus: { type: Boolean, default: true },
  
  // Status & Availability
  statusAvailability: {
    currentStatus: { 
      type: String, 
      enum: ["Available", "Unavailable"],
      default: "Available"
    },
    availableFrom: { type: Date, default: null },
    remarks: { type: String, default: "" }
  },
  
  // Maintenance Details
  maintenance: {
    lastServiceDate: { type: Date, default: null },
    insuranceExpiryDate: { type: Date, default: null },
    pollutionExpiryDate: { type: Date, default: null }
  },
  
  // Driver Details
  driverDetails: {
    driverName: { type: String, default: "" },
    driverPhone: { 
      type: String, 
      default: "",
      validate: {
        validator: function(v) {
          if (!v) return true;
          return /^\d{10}$/.test(v);
        },
        message: props => `${props.value} is not a valid 10-digit phone number`
      }
    },
    backupDriver: { type: String, default: "" },
    backupDriverPhone: { 
      type: String, 
      default: "",
      validate: {
        validator: function(v) {
          if (!v) return true;
          return /^\d{10}$/.test(v);
        },
        message: props => `${props.value} is not a valid 10-digit phone number`
      }
    },
    driverCharges: { type: Number, default: 0 }
  }
}, { timestamps: true });

// Main Vehicle Schema (Group by Vehicle Name and Type)
const vehicleSchema = new mongoose.Schema(
  {
    // Common Information (Shared across all registration numbers)
    basicInfo: {
      customizedType: { type: String, default: "Customized" },
      vehicleName: { type: String },
      vehicleType: { type: String, required: true },
    },
    
    // Vehicle Description (Shared)
    vehicleDescription: { type: String, default: "" },
    
    // Technical Specifications (Shared) - Updated with new fields
    techSpecs: {
      screenType: { type: String, default: "LED Only" },
      numberOfScreens: { type: String, default: "" },
      screenSizeWidth: { type: String, default: "" },
      screenSizeHeight: { type: String, default: "" },
      backScreenWidth: { type: String, default: "" },
      backScreenHeight: { type: String, default: "" },
      resolution: { type: String, default: "" },
      backResolution: { type: String, default: "" },
      videoSize: { type: String, default: "" },
      backVideoSize: { type: String, default: "" },
      audioOutput: { type: String, default: "" },
      brightness: { type: String, default: "" },
      displayVersion: { type: String, default: "" },
      soundQuality: { type: String, default: "" },
      generatorCapacity: { type: String, default: "" },
      additionalFeatures: { type: String, default: "" },
      videoFormat: { type: String, default: "" }
    },
    
    // Pricing (Shared) - Updated with new fields
    pricing: {
      basePriceType: { type: String, default: "Per Day" },
      costPerDay: { type: Number, default: 0 },
      avgKmPerDay: { type: Number, default: 0 },
      extraKmPrice: { type: Number, default: 0 },
      avgBookingHrs: { type: Number, default: 0 },
      extraHrPrice: { type: Number, default: 0 },
      rtoCharges: { type: Number, default: 0 },
      fuelEfficiency: { type: Number, default: 0 },
      minBookingDuration: { type: String, default: "" },
      overtimeCharges: { type: Number, default: 0 },
      waitingCharges: { type: Number, default: 0 }
    },
    
    // Media Files (Shared)
    mediaFiles: {
      frontViewImage: { type: String, default: "" },
      leftSideImage: { type: String, default: "" },
      rightSideImage: { type: String, default: "" },
      rearViewImage: { type: String, default: "" },
      interiorImage: { type: String, default: "" },
      demoVideo: { type: String, default: "" }
    },
    
    // Array of Registration Vehicles
    registrationVehicles: [registrationVehicleSchema],
    
    // Total count
    totalVehicles: { type: Number, default: 0 }
  },
  { timestamps: true }
);

// Indexes for faster queries
vehicleSchema.index({ "basicInfo.vehicleName": 1 });
vehicleSchema.index({ "registrationVehicles.registrationNumber": 1 });
vehicleSchema.index({ createdAt: -1 });

module.exports = mongoose.model("vehicleDetails", vehicleSchema);