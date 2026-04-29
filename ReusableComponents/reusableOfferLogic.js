const VehicleOffer = require("../Models/VehicleOffer/VehicleOffer"); 

exports.calculateOfferDetails = async ({
  vehicleModel,
  fromDate,
  toDate,
  quantity,
  pricePerDay,
}) => {
  const start = new Date(fromDate);
  const end = new Date(toDate);

  const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  const actualAmount = totalDays * quantity * pricePerDay;

  // ── Check offer for this vehicle model overlapping date range ───
  const offer = await VehicleOffer.findOne({
    model: vehicleModel,
    fromdate: { $lte: end },
    todate: { $gte: start },
  });

  let discountDays = 0;
  let noDiscountDays = totalDays;
  let discountPercentage = 0;
  let discountAmount = 0;
  let noDiscountAmount = 0;
  let totalAmount = 0;

  if (offer) {
    discountPercentage = offer.percentage;

    // ── Overlap between offer dates and user dates ───
    const overlapStart = start > offer.fromdate ? start : offer.fromdate;
    const overlapEnd = end < offer.todate ? end : offer.todate;

    discountDays = Math.ceil((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
    noDiscountDays = totalDays - discountDays;

    const fullPricePerDayPerUnit = pricePerDay * quantity;
    const discountedPricePerDay = fullPricePerDayPerUnit * (1 - discountPercentage / 100);

    discountAmount = discountDays * discountedPricePerDay;
    noDiscountAmount = noDiscountDays * fullPricePerDayPerUnit;
    totalAmount = discountAmount + noDiscountAmount;
  } else {
    noDiscountAmount = totalDays * quantity * pricePerDay;
    totalAmount = noDiscountAmount;
  }

  return {
    totalDays,
    discountDays,
    noDiscountDays,
    discountPercentage,
    discountAmount,
    noDiscountAmount,
    actualAmount,
    totalAmount,
  };
};