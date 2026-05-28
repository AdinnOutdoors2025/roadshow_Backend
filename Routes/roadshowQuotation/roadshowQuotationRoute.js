const express = require("express");
const multer = require("multer");

const {
   createRoadshowQuotation,
  uploadRoadshowQuotationPdf,
  getRoadshowQuotationById,
  getRoadshowQuotationDownloadUrl,
  getNextRoadshowQuotationNumber,
  listRoadshowQuotations,
} = require("../../controllers/roadshowQuotation/roadshowQuotationController");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      cb(new Error("Only PDF files are allowed"));
      return;
    }

    cb(null, true);
  },
});

// IMPORTANT: fixed/static routes first
router.get("/next-number", getNextRoadshowQuotationNumber);

// Normal collection routes
router.post("/", createRoadshowQuotation);
router.get("/", listRoadshowQuotations);

// IMPORTANT: dynamic routes after static routes
router.get("/:quotationId/download-url", getRoadshowQuotationDownloadUrl);
router.get("/:quotationId", getRoadshowQuotationById);
router.put("/:quotationId/pdf", upload.single("pdf"), uploadRoadshowQuotationPdf);




module.exports = router;