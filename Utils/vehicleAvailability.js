const Vehicle = require("../Models/vehicleDetails");

async function checkVehicleAvailability({ vehicleType, quantity, fromDate, toDate }) {
  if (!vehicleType) throw new Error("vehicleType is required");
  if (!quantity || Number(quantity) < 1) throw new Error("Valid quantity is required");
  if (!fromDate || !toDate) throw new Error("fromDate and toDate are required");

  const requestedQty = Number(quantity);
  const requestedFrom = new Date(fromDate);
  const requestedTo = new Date(toDate);

  const vehicleGroup = await Vehicle.findOne({ "basicInfo.vehicleType": vehicleType });

  if (!vehicleGroup || !vehicleGroup.registrationVehicles?.length) {
    return { available: false, availableCount: 0, requiredQuantity: requestedQty };
  }

  let currentlyAvailable = 0;
  let soonToBeFree = 0;

  for (const regVehicle of vehicleGroup.registrationVehicles) {
    const status = regVehicle.statusAvailability?.currentStatus;

    if (status === "Available") {
      currentlyAvailable++;
      continue;
    }

    if (status === "Booked") {
      const existingToDate = regVehicle.statusAvailability?.toDate;
      if (existingToDate && new Date(existingToDate) < requestedFrom) {
        soonToBeFree++;
      }
    }
  }

  const availableCount = currentlyAvailable + soonToBeFree;

  return {
    available: availableCount >= requestedQty,
    availableCount,
    requiredQuantity: requestedQty,
    currentlyAvailable,
    soonToBeFree,
  };
}

module.exports = { checkVehicleAvailability };