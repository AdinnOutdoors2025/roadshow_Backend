// Utils/vehicleAssignmentResolver.js
/* -------------------------------------------------------------------------- */
/*                  CURRENT VEHICLE ASSIGNMENT PER BOOKED SLOT                 */
/* -------------------------------------------------------------------------- */
/*  onRoadExecutionArray accumulates one entry per vehicleIndex every time a    */
/*  vehicle is assigned, marked unavailable, or replaced — a booking line with  */
/*  quantity 2 that had one replacement can have 3+ entries sharing the same    */
/*  vehicleIndex. Reading "current state" off the array directly (as the Live   */
/*  Vehicle / GPS Movement Report screens used to) shows a stale/removed entry  */
/*  alongside its replacement as two separate active rows.                      */
/*                                                                            */
/*  This resolver treats each entry as a link in a chain: replaceOnRoadVehicle  */
/*  marks the entry it replaces entryStatus:"replaced" (releaseOnRoadVehicle    */
/*  uses entryStatus:"removed" for an explicit withdrawal instead) and stamps   */
/*  the new entry's replacesEntryId with the old entry's _id. A "current slot"  */
/*  is any entry with entryStatus:"active" — there is always exactly one per    */
/*  live chain — and its full chain is reconstructed by walking replacesEntryId */
/*  back to the original vehicle. History itself is never touched here; this    */
/*  only reads it. */

/**
 * @param {Array} onRoadExecutionArray  order.onRoadExecutionArray (any subset
 *   is fine as long as entries for one vehicleIndex are all present).
 * @param {number} vehicleIndex
 * @returns {Array<{
 *   entry: object,
 *   originalVehicle: string,
 *   currentVehicle: string,
 *   registrationChain: string[],
 *   wasReplaced: boolean,
 *   currentStatus: "unavailable" | "assigned",
 * }>} one item per currently-occupied slot for that vehicleIndex — a slot
 *   released with no replacement simply has no entry here (same contract the
 *   callers already relied on before this resolver existed).
 */
const resolveVehicleSlots = (onRoadExecutionArray, vehicleIndex) => {
  const entries = (onRoadExecutionArray || []).filter(
    (e) => e.vehicleIndex === vehicleIndex
  );

  const byId = new Map(entries.map((e) => [String(e._id), e]));

  const buildChain = (head) => {
    const chain = [head];
    let current = head;

    /* Bounded by entries.length so a corrupt/circular link can never loop
       forever — worst case it just stops early, chain stays valid. */
    for (let guard = 0; guard < entries.length && current.replacesEntryId; guard += 1) {
      const previous = byId.get(String(current.replacesEntryId));

      if (!previous) break;

      chain.unshift(previous);
      current = previous;
    }

    return chain;
  };

  return entries
    // "active" only — a replaced entry's entryStatus is "replaced" (not
    // "removed"), and must not be treated as a current slot either, or its
    // replacement would show as a second active row for the same slot.
    .filter((entry) => entry.entryStatus === "active")
    .map((head) => {
      const chain = buildChain(head);
      const registrationChain = chain.map((e) => e.vehicleRegistrationNumber);

      return {
        entry: head,
        originalVehicle: registrationChain[0],
        currentVehicle: head.vehicleRegistrationNumber,
        registrationChain,
        wasReplaced: chain.length > 1,
        currentStatus: head.unavailableStatus ? "unavailable" : "assigned",
      };
    });
};

module.exports = { resolveVehicleSlots };
