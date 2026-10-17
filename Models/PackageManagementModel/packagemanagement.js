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
  // Legacy flat rate — superseded by locationCharges below (every package
  // must now configure all 6 location buckets individually, enforced in
  // the controller). Kept only so older records/consumers don't break.
  rtoCharges: { type: Number, default: 0 },
  // Only required for a Hybrid vehicle type's package (enforced in the
  // controller, since "required" here has no way to know the vehicle's
  // screen type) — defaults to 0 for every non-Hybrid package.
  brandingCost: { type: Number, default: 0 },
  // State/city-wise RTO & Branding charges. Keys: chennai, rotn (Rest Of
  // Tamil Nadu), kerala, andhra, telangana, karnataka — see
  // Utils/locationChargeResolver.js for how a booking line's state/city
  // resolves to one of these. All 6 are mandatory per package (branding
  // only when the vehicle type is Hybrid), validated in the controller.
  locationCharges: {
    type: new mongoose.Schema({
      // brandingIncludedInRental: when true, this location's Branding Cost
      // is folded into the displayed Rental amount (not shown as its own
      // line) wherever pricing is rendered — a per-location display choice,
      // independent of the other 5 locations. Never affects totals/GST,
      // only how the already-identical subtotal is broken into rows.
      chennai: { rtoCharges: Number, brandingCost: Number, brandingIncludedInRental: { type: Boolean, default: false } },
      rotn: { rtoCharges: Number, brandingCost: Number, brandingIncludedInRental: { type: Boolean, default: false } },
      kerala: { rtoCharges: Number, brandingCost: Number, brandingIncludedInRental: { type: Boolean, default: false } },
      andhra: { rtoCharges: Number, brandingCost: Number, brandingIncludedInRental: { type: Boolean, default: false } },
      telangana: { rtoCharges: Number, brandingCost: Number, brandingIncludedInRental: { type: Boolean, default: false } },
      karnataka: { rtoCharges: Number, brandingCost: Number, brandingIncludedInRental: { type: Boolean, default: false } },
    }, { _id: false }),
    default: () => ({}),
  },
  perKmCharge: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  inactiveReason: { type: String, default: '' },
}, { timestamps: true });

// Unique combination: vehicleType (ObjectId) + vehicleModel
packageSchema.index({ vehicleType: 1, vehicleModel: 1 }, { unique: true });

module.exports = mongoose.model('Package', packageSchema);