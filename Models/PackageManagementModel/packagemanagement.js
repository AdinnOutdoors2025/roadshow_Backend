

const mongoose = require('mongoose');

const packageSchema = new mongoose.Schema({
  vehicleType: {
    type: String,
    enum: ['Customizable Vehicle', 'Non-Customizable Vehicle'],
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
  isActive: { type: Boolean, default: true },
  inactiveReason: { type: String, default: '' }, 
}, { timestamps: true });

module.exports = mongoose.model('Package', packageSchema);