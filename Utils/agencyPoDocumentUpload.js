// Utils/agencyPoDocumentUpload.js
/* -------------------------------------------------------------------------- */
/*                     AGENCY PO DOCUMENT UPLOAD (optional)                    */
/* -------------------------------------------------------------------------- */
/*  A single optional PO document an Agency customer can attach to their       */
/*  booking. Deliberately its own multer pipeline — NOT folded into            */
/*  Middleware/orderImageupload.js's adminOrderUpload, which uses .any() and   */
/*  rejects anything that is not an image/video. Mixing a PDF/DOC into that    */
/*  pipeline would break the existing campaign-media upload the moment an      */
/*  agency attaches one.                                                       */
/*                                                                            */
/*  Storage is chosen by CLIENT_AGENCY_PO_DOCUMENTS_STORAGE ("local" |         */
/*  "space"), independent of the generic STORAGE_TYPE env var used elsewhere.  */
/*  "space" reuses the existing uploadToSpaces.js / deleteFromSpaces.js         */
/*  helpers (same DO Spaces credentials/config) instead of a new client.       */
/*                                                                            */
/*  "local" writes under public/uploads/ rather than a bare uploads/ folder — */
/*  only public/uploads is wired to express.static (see VehicleMain.js), so a  */
/*  file saved anywhere else would never be downloadable.                      */

const fs = require("fs");
const path = require("path");
const multer = require("multer");

const uploadToSpaces = require("./uploadToSpaces");
const deleteFromSpaces = require("./deleteFromSpaces");

const STORAGE_TYPE = process.env.CLIENT_AGENCY_PO_DOCUMENTS_STORAGE || "local";

/* Nested under Roadshows/ to sit alongside Roadshows/bookingsummary (see
   bookingSummaryPdfRenderer.js) instead of a top-level bucket prefix.
   Existing objects already uploaded under the old "client_agency_PO_documents"
   prefix keep working — their stored URL doesn't change — only new uploads
   use this path. */
const PO_DOCUMENT_FOLDER = "Roadshows/client_po_document";

const IMAGE_EXTENSIONS = /^(jpe?g|png|webp)$/i;
const DOCUMENT_EXTENSIONS = /^(pdf|docx?)$/i;

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

const sanitizeFilename = (originalname) => {
  const ext = path.extname(originalname);
  const base = path.basename(originalname, ext);

  const safeBase = base
    .replace(/[#%?&+=\s]+/g, "-")
    .replace(/[^a-zA-Z0-9.\-_]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);

  return `${safeBase || "po-document"}${ext}`;
};

const getExtension = (filename) =>
  path.extname(filename || "").replace(".", "").toLowerCase();

const isAllowedExtension = (filename) => {
  const ext = getExtension(filename);
  return IMAGE_EXTENSIONS.test(ext) || DOCUMENT_EXTENSIONS.test(ext);
};

const maxBytesFor = (filename) =>
  IMAGE_EXTENSIONS.test(getExtension(filename))
    ? IMAGE_MAX_BYTES
    : DOCUMENT_MAX_BYTES;

/* Memory storage regardless of final destination — "space" needs file.buffer
   (uploadToSpaces), and "local" writes that same buffer out by hand below, so
   both paths share one multer config instead of two. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCUMENT_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (!isAllowedExtension(file.originalname)) {
      return cb(
        new Error(
          "Only JPG, PNG, WEBP, PDF, DOC or DOCX files are allowed for the PO document."
        )
      );
    }

    cb(null, true);
  },
}).single("poDocument");

/**
 * Express middleware. The field is optional — no file at all is a valid pass
 * (req.file stays undefined; the controller treats that as "nothing to do").
 */
const agencyPoDocumentUpload = (req, res, next) => {
  upload(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: "File too large. PDF/DOC/DOCX max 10MB, images max 5MB.",
        });
      }

      return res.status(400).json({
        success: false,
        message: err.message || "Upload failed",
      });
    }

    /* >= not > — "10MB" is the largest size still rejected, not the last
       size still allowed. */
    if (req.file && req.file.size >= maxBytesFor(req.file.originalname)) {
      const isImage = IMAGE_EXTENSIONS.test(
        getExtension(req.file.originalname)
      );

      return res.status(400).json({
        success: false,
        message: isImage
          ? `Image "${req.file.originalname}" exceeds the 5MB limit.`
          : `Document "${req.file.originalname}" exceeds the 10MB limit.`,
      });
    }

    next();
  });
};

/**
 * Persists req.file and returns the metadata to store on the booking.
 */
const saveAgencyPoDocument = async (file) => {
  if (!file) return null;

  if (STORAGE_TYPE === "space") {
    const url = await uploadToSpaces(file, PO_DOCUMENT_FOLDER);

    return {
      originalName: file.originalname,
      fileName: path.basename(url),
      mimeType: file.mimetype,
      size: file.size,
      url,
      storageType: "space",
    };
  }

  const uploadDir = path.join(__dirname, "../public/uploads", PO_DOCUMENT_FOLDER);

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const fileName = `${Date.now()}-${sanitizeFilename(file.originalname)}`;

  fs.writeFileSync(path.join(uploadDir, fileName), file.buffer);

  return {
    originalName: file.originalname,
    fileName,
    mimeType: file.mimetype,
    size: file.size,
    url: `/uploads/${PO_DOCUMENT_FOLDER}/${fileName}`,
    storageType: "local",
  };
};

/**
 * Deletes the physical/Spaces file behind a previously-saved PO document.
 * Never throws — a failed cleanup must not block clearing/replacing the DB
 * reference, same contract as this codebase's other delete helpers.
 */
const deleteAgencyPoDocument = async (document) => {
  if (!document || !document.url) return;

  try {
    if (document.storageType === "space") {
      await deleteFromSpaces(document.url);
      return;
    }

    const filePath = path.join(
      __dirname,
      "../public",
      document.url.replace(/^\/+/, "")
    );

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error("Failed to delete agency PO document file:", error.message);
  }
};

module.exports = {
  agencyPoDocumentUpload,
  saveAgencyPoDocument,
  deleteAgencyPoDocument,
};
