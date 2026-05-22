const mongoose = require('mongoose');

const packageSchema = new mongoose.Schema({
  vehicleType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VehicleType', 
    required: true,
  },
  vehicleModel: {
    type: String,
    required: true,
  },
  perDayRentalCost: { type: Number, required: true },
  dailyKmLimit: { type: Number, required: true },
  additionalHourCharges: { type: Number, required: true },
  endUserCustomizationPermission: { type: Boolean, default: false },
  promoterAvailable: { type: Boolean, default: false },
  promoterChargePerDay: { type: Number, default: 0 },
  driverCharges: { type: Number, required: true },
  rtoCharges: { type: Number, required: true },
  perKmCharge: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  inactiveReason: { type: String, default: '' },
}, { timestamps: true });

// Unique combination: vehicleType (ObjectId) + vehicleModel
packageSchema.index({ vehicleType: 1, vehicleModel: 1 }, { unique: true });

module.exports = mongoose.model('Package', packageSchema);