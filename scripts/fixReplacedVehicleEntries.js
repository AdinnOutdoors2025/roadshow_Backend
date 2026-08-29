// Run once: node scripts/fixReplacedVehicleEntries.js
//
// Backfill for existing data created before replaceOnRoadVehicle was fixed
// to mark the old entry entryStatus:"removed" and link the new entry's
// replacesEntryId. Every "replaced" event already has both entry ids
// recorded in onRoadUnavailableHistory — this just applies what that audit
// trail already proves happened, so no history is invented or deleted.
require("dotenv").config();
const mongoose = require("mongoose");
const Order = require("../Models/AdminorderModel/Adminorder");

const MONGO_URI = process.env.MONGODB_URI;

(async () => {
  await mongoose.connect(MONGO_URI);
  console.log("Connected.");

  const orders = await Order.find({
    "onRoadUnavailableHistory.eventType": "replaced",
  });

  console.log(`Scanning ${orders.length} order(s) with a "replaced" event...`);

  let ordersFixed = 0;
  let entriesRemoved = 0;
  let entriesLinked = 0;

  for (const order of orders) {
    let changed = false;

    for (const history of order.onRoadUnavailableHistory) {
      if (history.eventType !== "replaced") continue;

      const oldEntry = history.entryId
        ? order.onRoadExecutionArray.id(history.entryId)
        : null;
      const newEntry = history.replacementEntryId
        ? order.onRoadExecutionArray.id(history.replacementEntryId)
        : null;

      if (oldEntry && oldEntry.entryStatus !== "removed") {
        oldEntry.entryStatus = "removed";
        oldEntry.removedAt = history.replacedAt || history.reportedAt || new Date();
        oldEntry.removedBy = history.reportedBy || "";
        oldEntry.removalReason = history.reason || "";
        entriesRemoved += 1;
        changed = true;
      }

      if (newEntry && oldEntry && !newEntry.replacesEntryId) {
        newEntry.replacesEntryId = oldEntry._id;
        entriesLinked += 1;
        changed = true;
      }
    }

    if (changed) {
      await order.save();
      ordersFixed += 1;
      console.log(`Fixed order ${order.orderId || order._id}`);
    }
  }

  console.log(
    `Done. Orders fixed: ${ordersFixed}, entries marked removed: ${entriesRemoved}, entries linked: ${entriesLinked}.`
  );

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
