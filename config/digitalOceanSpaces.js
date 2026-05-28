// config/digitalOceanSpaces.js
//test commit

import dotenv from "dotenv";
import { S3Client } from "@aws-sdk/client-s3";

dotenv.config();

export const DO_SPACES_KEY = process.env.DO_SPACES_KEY;
export const DO_SPACES_SECRET = process.env.DO_SPACES_SECRET;
export const DO_SPACES_REGION = process.env.DO_SPACES_REGION || "sgp1";
export const DO_SPACES_BUCKET = process.env.DO_SPACES_BUCKET;
export const DO_SPACES_ENDPOINT =
  process.env.DO_SPACES_ENDPOINT ||
  `https://sgp1.digitaloceanspaces.com`;
export const DO_SPACES_CDN_URL = process.env.DO_SPACES_CDN_URL || "";

if (!DO_SPACES_KEY || !DO_SPACES_SECRET || !DO_SPACES_BUCKET) {
  throw new Error(
    "DO_SPACES_KEY, DO_SPACES_SECRET and DO_SPACES_BUCKET are required",
  );
}


export const spacesClient = new S3Client({
  region: DO_SPACES_REGION,
  endpoint: DO_SPACES_ENDPOINT,
  credentials: {
    accessKeyId: DO_SPACES_KEY,
    secretAccessKey: DO_SPACES_SECRET,
  },
});