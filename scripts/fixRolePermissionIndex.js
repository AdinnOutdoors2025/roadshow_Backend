
//
// Run once: node scripts/fixRolePermissionIndex.js
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const RolePermission = require("../Models/RolePermissionModel");

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error("MONGODB_URI is not set in .env");
  process.exit(1);
}

(async () => {
  await mongoose.connect(MONGO_URI);
  console.log("Connected.");

  const coll = mongoose.connection.collection("rolepermissions");
  const indexes = await coll.indexes();
  console.log("Existing indexes:", indexes.map((i) => i.name));

  const legacy = indexes.find(
    (i) => i.key && Object.keys(i.key).length === 1 && i.key.role === 1 && !i.partialFilterExpression
  );
  if (legacy) {
    await coll.dropIndex(legacy.name);
    console.log(`Dropped legacy index: ${legacy.name}`);
  } else {
    console.log("No legacy plain-unique role index found (already fixed?).");
  }

  // Recreate indexes per the current schema (adds the two partial ones).
  await RolePermission.syncIndexes();
  console.log("Synced indexes:", (await coll.indexes()).map((i) => i.name));

  await mongoose.disconnect();
  console.log("Done.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
