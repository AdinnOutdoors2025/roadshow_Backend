const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema(
  {
    // ================= BASIC INFO =================
    vehicleName: { type: String, required: true },
    vehicleType: { type: String, required: true },
    model: {
      type: String,
      required: true,
    },
    // vehicleNumber: { type: String, required: true },
    // vehicleDetails Schema - இந்த fields மாத்தணும்
    vehicleNumber: [{ type: String }],  // String → Array
    vehicleCount: { type: Number, default: 1 },  // புதுசா add
    year: Number,
    fuelType: String,
    transmission: String,
    seatingCapacity: Number,

    // ================= CAMPAIGN =================
    campaignType: String,
    ledAvailable: String,
    ledSize: String,
    soundSystem: String,
    brandingSideSize: String,
    brandingBackSize: String,
    roofSetup: String,
    generatorAvailable: String,
    lighting: String,

    // ================= PRICING =================
    basePrice: { type: Number, required: true },
    pricingType: String,
    minBooking: String,
    extraHourCharge: Number,
    driverCharge: String,
    fuelPolicy: String,
    securityDeposit: Number,
    discountEligible: String,
    availability: String,

    // ================= LEGAL =================
    rcValidTill: Date,
    insuranceValidTill: Date,
    pollutionValidTill: Date,
    permitType: String,
    emergencyContact: String,

    // ================= ADMIN =================
    internalNotes: String,
    priorityLevel: String,
    internalRating: Number,
    featured: String,

    // ================= DRIVER & STAFF =================
    driverName: {
      type: String,
      default: "",
    },

    driverPhone: {
      type: String,
      default: "",
    },

    driverExperience: {
      type: Number,
      default: 0,
    },

    languagesKnown: {
      type: String,
      default: "",
    },

    helperAvailable: {
      type: String,
      default: "",
    },
    // Add this inside vehicleSchema

    city: {
      type: String,
      default: "",
    },



    // ================= MEDIA =================
    mainImage: [String],
    sideImages: [String],
    interiorImages: [String],
    ledDisplayImage: [String],
    brandingSample: [String],
    vehicleVideo: [String],
  },


  { timestamps: true },
);



module.exports = mongoose.model("vehicleDetails", vehicleSchema);


// const mongoose = require("mongoose");

// const subVehicleEntrySchema = new mongoose.Schema(
//   {
//     // ================= BASIC INFO =================
//     vehicleName: { type: String },
//     vehicleType: { type: String },
//     model: { type: String },
//     vehicleNumber: { type: String },
//     year: Number,
//     fuelType: String,
//     transmission: String,
//     seatingCapacity: Number,

//     // ================= CAMPAIGN =================
//     campaignType: String,
//     ledAvailable: String,
//     ledSize: String,
//     soundSystem: String,
//     brandingSideSize: String,
//     brandingBackSize: String,
//     roofSetup: String,
//     generatorAvailable: String,
//     lighting: String,

//     // ================= PRICING =================
//     basePrice: { type: Number },
//     pricingType: String,
//     minBooking: String,
//     extraHourCharge: Number,
//     driverCharge: String,
//     fuelPolicy: String,
//     securityDeposit: Number,
//     discountEligible: String,
//     availability: String,

//     // ================= LEGAL =================
//     rcValidTill: Date,
//     insuranceValidTill: Date,
//     pollutionValidTill: Date,
//     permitType: String,
//     emergencyContact: String,

//     // ================= ADMIN =================
//     internalNotes: String,
//     priorityLevel: String,
//     internalRating: Number,
//     featured: String,

//     // ================= DRIVER & STAFF =================
//     driverName: { type: String, default: "" },
//     driverPhone: { type: String, default: "" },
//     driverExperience: { type: Number, default: 0 },
//     languagesKnown: { type: String, default: "" },
//     helperAvailable: { type: String, default: "" },

//     city: { type: String, default: "" },

//     // ================= MEDIA =================
//     mainImage: [String],
//     sideImages: [String],
//     interiorImages: [String],
//     ledDisplayImage: [String],
//     brandingSample: [String],
//     vehicleVideo: [String],

//     // ================= REFERENCE =================
//     vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: "vehicleDetails" },
//   },
//   { _id: true, timestamps: true }
// );

// const subVehicleGroupSchema = new mongoose.Schema(
//   {
//     model: { type: String, required: true },
//     city: { type: String, required: true },
//     vehicleCount: { type: Number, default: 0 },
//     vehicles: [subVehicleEntrySchema],  // full object embed
//   },
//   { _id: true, timestamps: true }
// );

// const vehicleSchema = new mongoose.Schema(
//   {
//     // ================= BASIC INFO =================
//     vehicleName: { type: String, required: true },
//     vehicleType: { type: String, required: true },
//     model: { type: String, required: true },
//     vehicleNumber: { type: String, required: true },
//     year: Number,
//     fuelType: String,
//     transmission: String,
//     seatingCapacity: Number,

//     // ================= CAMPAIGN =================
//     campaignType: String,
//     ledAvailable: String,
//     ledSize: String,
//     soundSystem: String,
//     brandingSideSize: String,
//     brandingBackSize: String,
//     roofSetup: String,
//     generatorAvailable: String,
//     lighting: String,

//     // ================= PRICING =================
//     basePrice: { type: Number, required: true },
//     pricingType: String,
//     minBooking: String,
//     extraHourCharge: Number,
//     driverCharge: String,
//     fuelPolicy: String,
//     securityDeposit: Number,
//     discountEligible: String,
//     availability: String,

//     // ================= LEGAL =================
//     rcValidTill: Date,
//     insuranceValidTill: Date,
//     pollutionValidTill: Date,
//     permitType: String,
//     emergencyContact: String,

//     // ================= ADMIN =================
//     internalNotes: String,
//     priorityLevel: String,
//     internalRating: Number,
//     featured: String,

//     // ================= DRIVER & STAFF =================
//     driverName: { type: String, default: "" },
//     driverPhone: { type: String, default: "" },
//     driverExperience: { type: Number, default: 0 },
//     languagesKnown: { type: String, default: "" },
//     helperAvailable: { type: String, default: "" },

//     city: { type: String, default: "" },

//     // ================= MEDIA =================
//     mainImage: [String],
//     sideImages: [String],
//     interiorImages: [String],
//     ledDisplayImage: [String],
//     brandingSample: [String],
//     vehicleVideo: [String],

//     // ================= SUB VEHICLE GROUP =================
//     subVehicleGroup: [subVehicleGroupSchema],
//   },
//   { timestamps: true }
// );

// module.exports = mongoose.model("vehicleDetails", vehicleSchema);