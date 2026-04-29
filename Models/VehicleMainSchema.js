const mongoose = require('mongoose');
const additionalFileSchema = new mongoose.Schema({
    url: String,
    type: String,
    public_id: String
});

const similarVehicleSchema = new mongoose.Schema({
    Name: String,
    VehicleID: String,
    image: String,
    vehiclePrice: Number
});


const vehicleSchema = new mongoose.Schema({
    vehicleDetails: {
        vehicleID: String,
        name: String,
        amount: Number,
        // deliveryDay: Number,
        audio: String,
        screenresolution: String,
        // branding: String,
        power: String,
        rating: String,
        vehicleSize: {
            width: Number,
            height: Number,
            VehicleSizeSquareFeet: Number
        },
        vehicleCount: {
            OverAllCount: Number,
            BookedCount: Number,
            BalanceCount: Number,
        },
        image: String,
        imagePublicId: String, // Store public_id for future deletion
        additionalFiles: [additionalFileSchema], // Changed from [String] to proper schema
        vehicleDescription: String,
        visible: {
            type: Boolean,
            default: true
        },

    },
    similarVehicles: [similarVehicleSchema],

    createdAt: { type: Date, default: Date.now }
});
const vehicleModel = mongoose.model('Vehicle', vehicleSchema);
module.exports = vehicleModel;