// Run once: node scripts/findOrphanedSpacesFiles.js [--out=path.json]
//
// Read-only report. Lists every object in the DO Spaces bucket that is not
// referenced by any string field in any MongoDB collection. Deletes nothing.
//
// Cleanup already exists for orders/client-requests deleted through the app
// (see Utils/deleteFromSpaces.js's collectSpaceUrls, called from
// deleteAdminOrder / deleteClientRequest) — but that only runs when the
// delete goes through those controllers. Records removed directly in Mongo
// (Atlas UI, Compass, an ad-hoc script) bypass it, leaving their files
// behind in Spaces. This script finds those leftovers so they can be
// reviewed before anything is removed from the bucket.
//
// Walks every collection generically (matching on URL shape, same approach
// as collectSpaceUrls) rather than importing every model, so it stays
// correct as the schema grows and isn't tied to which collections happen to
// store file URLs today.
require("dotenv").config();
const fs = require("fs");
const mongoose = require("mongoose");
const { S3Client, ListObjectsV2Command } = require("@aws-sdk/client-s3");

const MONGO_URI = process.env.MONGODB_URI;
const BUCKET = process.env.DO_SPACES_BUCKET;
const CDN_BASE = process.env.DO_SPACES_CDN_BASE || process.env.DO_SPACES_CDN_URL;
const OUT_ARG = process.argv.find((arg) => arg.startsWith("--out="));
const OUT_PATH = OUT_ARG ? OUT_ARG.slice("--out=".length) : null;

const spacesClient = new S3Client({
  region: process.env.DO_SPACES_REGION || "sgp1",
  endpoint: process.env.DO_SPACES_ENDPOINT || "https://sgp1.digitaloceanspaces.com",
  credentials: {
    accessKeyId: process.env.DO_SPACES_KEY,
    secretAccessKey: process.env.DO_SPACES_SECRET,
  },
  forcePathStyle: false,
});

const isSpaceUrl = (value) =>
  typeof value === "string" && !!CDN_BASE && value.startsWith(CDN_BASE);

// Mirrors collectSpaceUrls in Utils/deleteFromSpaces.js, but walks plain
// driver documents (no Mongoose toJSON step needed) and collects bucket
// keys directly instead of full URLs.
const collectSpaceKeys = (value, keys, seen) => {
  if (value == null) return;

  if (typeof value === "string") {
    if (isSpaceUrl(value)) keys.add(value.slice(CDN_BASE.length).replace(/^\/+/, ""));
    return;
  }

  if (typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) collectSpaceKeys(item, keys, seen);
    return;
  }

  for (const item of Object.values(value)) collectSpaceKeys(item, keys, seen);
};

async function listAllBucketObjects() {
  const objects = [];
  let ContinuationToken;
  do {
    const res = await spacesClient.send(
      new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken })
    );
    for (const obj of res.Contents || []) {
      objects.push({ key: obj.Key, size: obj.Size, lastModified: obj.LastModified });
    }
    ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return objects;
}

(async () => {
  if (!MONGO_URI) throw new Error("MONGODB_URI is not set.");
  if (!BUCKET) throw new Error("DO_SPACES_BUCKET is not set.");
  if (!CDN_BASE) throw new Error("DO_SPACES_CDN_BASE (or DO_SPACES_CDN_URL) is not set.");

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB.");

  const referencedKeys = new Set();
  const collections = await mongoose.connection.db.listCollections().toArray();

  for (const { name } of collections) {
    const cursor = mongoose.connection.db.collection(name).find({});
    let docCount = 0;
    const seen = new Set();
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      collectSpaceKeys(doc, referencedKeys, seen);
      docCount += 1;
    }
    console.log(`Scanned collection "${name}": ${docCount} document(s).`);
  }

  console.log(`\nTotal distinct Spaces file(s) referenced in DB: ${referencedKeys.size}`);

  console.log("Listing bucket objects...");
  const bucketObjects = await listAllBucketObjects();
  console.log(`Total object(s) in bucket "${BUCKET}": ${bucketObjects.length}`);

  const orphaned = bucketObjects.filter((obj) => !referencedKeys.has(obj.key));
  const orphanedSizeBytes = orphaned.reduce((sum, o) => sum + (o.size || 0), 0);

  console.log(`\nOrphaned object(s) (in bucket, referenced by nothing in the DB): ${orphaned.length}`);
  console.log(`Total orphaned size: ${(orphanedSizeBytes / (1024 * 1024)).toFixed(2)} MB`);

  if (orphaned.length) {
    console.log("\nFirst 50 orphaned keys:");
    for (const obj of orphaned.slice(0, 50)) {
      console.log(`  ${obj.key}  (${obj.size} bytes, modified ${obj.lastModified?.toISOString?.() || obj.lastModified})`);
    }
  }

  if (OUT_PATH) {
    fs.writeFileSync(OUT_PATH, JSON.stringify(orphaned, null, 2));
    console.log(`\nFull list written to: ${OUT_PATH}`);
  } else {
    console.log("\nPass --out=path.json to write the full list to a file.");
  }

  console.log("\nThis script only reports. Nothing was deleted from Spaces or MongoDB.");

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
