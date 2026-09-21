/**
 * RTO (Return-To-Origin) charge calculation, shared by any caller that needs
 * duration-based RTO pricing. One RTO cycle = RTO_CYCLE_DAYS campaign days;
 * charge is base amount x cycles x vehicle quantity.
 *
 * RTO_CYCLE_DAYS is env-driven (default 30) rather than hardcoded, so a
 * future change to the cycle length (e.g. 31) is a config change, not a
 * code change — and so the admin order flow can read the same constant
 * once RTO there is scoped, without duplicating the value.
 *
 * NOTE: currently wired into the client-request flow only
 * (ClientRequestController.priceBookingItemFromPackage). The admin order
 * flow (Adminordercontroller.calcPricingBackend) intentionally still uses
 * its own flat rtoCharges * quantity formula — do not import this there
 * without a separate, explicit decision to change admin RTO behavior too.
 */

const RTO_CYCLE_DAYS = parseInt(process.env.RTO_CYCLE_DAYS || "30", 10) || 30;

/**
 * @param {number} campaignDays total campaign days for the vehicle line
 * @param {number} vehicleQuantity number of vehicles on that line
 * @param {number} baseRTOAmount RTO rate per vehicle per cycle (e.g. package.rtoCharges)
 * @returns {{ totalDays: number, rtoCycles: number, rtoAmount: number }}
 */
const calculateRTOCharges = (campaignDays, vehicleQuantity, baseRTOAmount) => {
  const totalDays = Math.max(Number(campaignDays) || 0, 0);
  const quantity = Math.max(Number(vehicleQuantity) || 1, 1);
  const baseAmount = Math.max(Number(baseRTOAmount) || 0, 0);

  const rtoCycles = totalDays > 0 ? Math.ceil(totalDays / RTO_CYCLE_DAYS) : 0;
  const rtoAmount = rtoCycles * baseAmount * quantity;

  return { totalDays, rtoCycles, rtoAmount };
};

module.exports = { calculateRTOCharges, RTO_CYCLE_DAYS };
