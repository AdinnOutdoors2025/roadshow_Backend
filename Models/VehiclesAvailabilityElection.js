const mongoose = require('mongoose');
const vehicleAvailabilityElectionSchema = new mongoose.Schema(
    {
        modelId: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleModelElection', required: true },
        modelName: { type: String, required: true, trim: true },
        availableCount: { type: Number, default: 0, min: 0 },
        unavailableCount: { type: Number, default: 0, min: 0 },
        remainingCount: { type: Number, default: 0, min: 0 },
    },
    { timestamp: true }
);
vehicleAvailabilityElectionSchema.index(
    { modelId: 1 },
    { unique: true }
);

module.exports = mongoose.model("VehicleAvailabilityElection", vehicleAvailabilityElectionSchema);