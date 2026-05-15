const mongoose = require("mongoose");

// Individual Vehicle Registration Schema
const registrationVehicleSchema = new mongoose.Schema(
  {
    registrationNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      set: function (value) {
        const clean = value.replace(/\s/g, "").toUpperCase();
        if (clean.length === 10) {
          return `${clean.slice(0, 2)} ${clean.slice(2, 4)} ${clean.slice(4, 6)} ${clean.slice(6, 10)}`;
        }
        return value;
      },
      get: function (value) {
        if (value && value.replace(/\s/g, "").length === 10) {
          const clean = value.replace(/\s/g, "");
          return `${clean.slice(0, 2)} ${clean.slice(2, 4)} ${clean.slice(4, 6)} ${clean.slice(6, 10)}`;
        }
        return value;
      },
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
        validator: function (v) {
          if (!v) return true;
          const year = parseInt(v);
          const currentYear = new Date().getFullYear();
          return !isNaN(year) && year <= currentYear && year >= 1900;
        },
        message: (props) => `Manufacturing year cannot exceed ${new Date().getFullYear()}`,
      },
    },
    gpsEnabled: { type: Boolean, default: true },
    activeStatus: { type: Boolean, default: true },

    // Status & Availability
    statusAvailability: {
      currentStatus: {
        type: String,
        enum: ["Available", "Unavailable"],
        default: "Available",
      },
      availableFrom: { type: Date, default: null },
      remarks: { type: String, default: "" },
    },

    // Maintenance Details
    maintenance: {
      lastServiceDate: { type: Date, default: null },
      insuranceExpiryDate: { type: Date, default: null },
      pollutionExpiryDate: { type: Date, default: null },
    },

    // Driver Details
    driverDetails: {
      driverName: { type: String, default: "" },
      driverPhone: {
        type: String,
        default: "",
        validate: {
          validator: function (v) {
            if (!v) return true;
            return /^\d{10}$/.test(v);
          },
          message: (props) => `${props.value} is not a valid 10-digit phone number`,
        },
      },
      backupDriver: { type: String, default: "" },
      backupDriverPhone: {
        type: String,
        default: "",
        validate: {
          validator: function (v) {
            if (!v) return true;
            return /^\d{10}$/.test(v);
          },
          message: (props) => `${props.value} is not a valid 10-digit phone number`,
        },
      },
      driverCharges: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

// Main Vehicle Schema (Group by Vehicle Name and Type)
const vehicleSchema = new mongoose.Schema(
  {
    // Common Information (Shared across all registration numbers)
    basicInfo: {
      customizedType: { type: String, default: "Non-Customized" },
      vehicleName: { type: String, default: "" },
      vehicleType: { type: String, required: true },
    },

    // Vehicle Description (Shared)
    vehicleDescription: { type: String, default: "" },

    // Technical Specifications (Shared) - UPDATED with separate Width/Height fields
    techSpecs: {
      screenType: { type: String, default: "LED Only" },
      numberOfScreens: { type: String, default: "" },

      // Left/Right Screen Size (ft) - Separate W & H
      leftRightScreenWidth: { type: String, default: "" },
      leftRightScreenHeight: { type: String, default: "" },

      // Back Screen Size (ft) - Separate W & H
      backScreenWidth: { type: String, default: "" },
      backScreenHeight: { type: String, default: "" },

      // Left/Right Resolution (px) - Separate W & H
      leftRightResolutionWidth: { type: String, default: "" },
      leftRightResolutionHeight: { type: String, default: "" },

      // Back Resolution (px) - Separate W & H
      backResolutionWidth: { type: String, default: "" },
      backResolutionHeight: { type: String, default: "" },

      audioOutput: { type: String, default: "" },
      brightness: { type: String, default: "" },
      displayVersion: { type: String, default: "" },
      soundQuality: { type: String, default: "" },
      generatorCapacity: { type: String, default: "" },
      additionalFeatures: { type: String, default: "" },
    },

    // Pricing (Shared)
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
      waitingCharges: { type: Number, default: 0 },
    },

    // Media Files (Shared)
    mediaFiles: {
      frontViewImage: { type: String, default: "" },
      leftSideImage: { type: String, default: "" },
      rightSideImage: { type: String, default: "" },
      rearViewImage: { type: String, default: "" },
      interiorImage: { type: String, default: "" },
      demoVideo: { type: String, default: "" },
    },

    // Array of Registration Vehicles
    registrationVehicles: [registrationVehicleSchema],

    // Total count
    totalVehicles: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Indexes for faster queries
vehicleSchema.index({ "basicInfo.vehicleType": 1 });
vehicleSchema.index({ "registrationVehicles.registrationNumber": 1 });
vehicleSchema.index({ createdAt: -1 });

module.exports = mongoose.model("vehicleDetails", vehicleSchema);