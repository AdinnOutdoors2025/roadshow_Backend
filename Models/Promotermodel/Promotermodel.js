const mongoose = require('mongoose');

// Promoter management is location-wise charge configuration, not a person
// roster: one row per state, each carrying only its per-day promoter
// charge. "state" stores the real state name as-is (e.g. "Tamil Nadu") —
// the same dynamic value the existing Location collection / order-creation
// State dropdown already uses — not a fixed internal enum/key.
const promoterSchema = new mongoose.Schema(
  {
    state: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    promoterCharge: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Promoter', promoterSchema);
