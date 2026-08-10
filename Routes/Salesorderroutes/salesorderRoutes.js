

const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const multerS3 = require("multer-s3");
const router = express.Router();

const ctrl = require("../../controllers/Salesordercontroller/Salesordercontroller");
const { protect } = require("../../Middleware/rolemiddleware");
const spacesClient = require("../../config/spaces"); 

const STORAGE_TYPE = process.env.STORAGE_TYPE || "local";
const BUCKET_NAME = process.env.DO_SPACES_BUCKET || "adinn-space";


const sanitizeFilename = (originalname) => {
  const ext = path.extname(originalname);
  const base = path.basename(originalname, ext);
  const safeBase = base
    .replace(/[#%?&+=\s]+/g, "-")    
    .replace(/[^a-zA-Z0-9.\-_]/g, "") 
    .replace(/-+/g, "-")              
    .replace(/^-+|-+$/g, "")          
    .slice(0, 100);                  
  return `${safeBase || "file"}${ext}`;
};

const salesFileFilter = (req, file, cb) => {
  const allowed = [
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
  ];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Only PDF and image files are allowed!"), false);
};


let salesUploadStorage;

if (STORAGE_TYPE === "space") {
  // DigitalOcean
  salesUploadStorage = multerS3({
    s3: spacesClient,
    bucket: BUCKET_NAME,
    acl: "public-read",
    metadata: (req, file, cb) => {
      cb(null, { fieldname: file.fieldname });
    },
    key: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      const filename = `sales-${file.fieldname}-${uniqueSuffix}${ext}`;
    
      cb(null, `sales-documents/${filename}`);
    },
  });
} else {
 
  salesUploadStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(__dirname, "../../public/uploads");
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const safeName = sanitizeFilename(file.originalname);
      cb(null, `sales-${Date.now()}-${safeName}`);
    },
  });
}


const salesUpload = multer({
  storage: salesUploadStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, 
  fileFilter: salesFileFilter,
}).any();


router.get("/pipeline", protect, ctrl.getSalesPipeline);
router.get("/pipeline/order/:orderId", protect, ctrl.getSalesOrderById);
router.patch("/pipeline/:id", protect, salesUpload, ctrl.updateSalesPipeline);
router.post("/pipeline/:id/documents", protect, salesUpload, ctrl.uploadStageDocument);
router.post("/pipeline/:id/send-project-mail", ctrl.sendProjectMail);
router.post("/pipeline/:id/save-project-code", ctrl.saveProjectCode);
router.patch("/pipeline/:id/enquiry-name", protect, ctrl.saveEnquiryName);
router.get("/pipeline/:id/date-conflicts", ctrl.getDateConflicts);

router.patch("/pipeline/:id/reassign-handler", protect, ctrl.reassignHandler);
router.patch(
  "/pipeline/:id/handover/:assignmentId/resolve",
  protect,
  ctrl.resolveHandlerHandover
);
router.patch(
  "/pipeline/:id/po-document",
  protect,
  salesUpload,
  ctrl.updatePODocument
);

module.exports = router;