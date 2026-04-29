const mongoose = require ('mongoose');

const vehicleModelElectionSchema = new mongoose.Schema(
    {
        modelName :{type :String, required:true, trim:true, upperCase:true,},

    },
    {timestamps :true}
);
// Create compound index to prevent duplicates
vehicleModelElectionSchema.index(
    {modelName:1}, {unique:true}
);
module.exports = mongoose.model("VehicleModelElection", vehicleModelElectionSchema);