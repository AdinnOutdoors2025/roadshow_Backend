// utils/deleteFromSpaces.js
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const spacesClient = require('../config/spaces');

const getKeyFromUrl = (fileUrl) => {
  const bucketBase = process.env.DO_SPACES_CDN_BASE;

  if (!fileUrl.startsWith(bucketBase)) {
    // If it's a local URL, we don't delete from Spaces
    if (fileUrl.includes('localhost') || fileUrl.startsWith('http://localhost')) {
      return null;
    }
    throw new Error(`Invalid Spaces URL: ${fileUrl}`);
  }

  return fileUrl.replace(`${bucketBase}/`, '');
};

const deleteFromSpaces = async (fileUrl) => {
  const key = getKeyFromUrl(fileUrl);

  // Skip deletion for local URLs
  if (!key) {
    console.log('Skipping deletion for local file:', fileUrl);
    return;
  }

  const command = new DeleteObjectCommand({
    Bucket: process.env.DO_SPACES_BUCKET,
    Key: key,
  });

  await spacesClient.send(command);
};

/*
 * Best-effort cleanup for a whole record's worth of file URLs at once (e.g.
 * every field on a document being deleted). Never throws — a record delete
 * must still succeed even if one of its file URLs is malformed, already
 * gone, or (for older/legacy rows) hosted somewhere other than this Spaces
 * bucket (e.g. a stray Cloudinary URL), which deleteFromSpaces treats as an
 * error. Falsy/empty entries are skipped silently; every other failure is
 * logged, not thrown, so callers can fire-and-forget this after confirming
 * the DB delete succeeded.
 */
const deleteManyFromSpaces = async (fileUrls) => {
  const urls = (fileUrls || []).filter(Boolean);

  await Promise.all(
    urls.map(async (url) => {
      try {
        await deleteFromSpaces(url);
      } catch (error) {
        console.error('Failed to delete Spaces file:', url, error.message);
      }
    })
  );
};

module.exports = deleteFromSpaces;
module.exports.deleteManyFromSpaces = deleteManyFromSpaces;