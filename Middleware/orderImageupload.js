

const multer = require("multer");
const multerS3 = require("multer-s3");
const path = require("path");
const fs = require("fs");
const spacesClient = require("../config/spaces"); 

const STORAGE_TYPE = process.env.STORAGE_TYPE || "local";
const BUCKET_NAME = process.env.DO_SPACES_BUCKET || "adinn-space";

let adminStorage;

if (STORAGE_TYPE === "space") {
 
  adminStorage = multerS3({
    s3: spacesClient,
    bucket: BUCKET_NAME,
    acl: "public-read",
    metadata: (req, file, cb) => {
      cb(null, { fieldname: file.fieldname });
    },
    key: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      const name = path.basename(file.originalname, ext).replace(/\s+/g, "-");
     
      const filename = `${file.fieldname}-${uniqueSuffix}-${name}${ext}`;
      cb(null, `admin-orders/${filename}`);
    },
  });
} else {
 
  adminStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(__dirname, "../public/uploads");
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const name = path.basename(file.originalname, ext).replace(/\s+/g, "-");
      cb(null, `${Date.now()}-${name}${ext}`);
    },
  });
}

const adminOrderUpload = multer({
  storage: adminStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, 
  fileFilter: (req, file, cb) => {
    const allowedImages = /jpeg|jpg|png|gif|webp/;
    const allowedVideos = /mp4|mov|avi|mkv|webm/;
    const ext = path.extname(file.originalname).toLowerCase().slice(1);

    if (allowedImages.test(ext) || allowedVideos.test(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type .${ext} not allowed`));
    }
  },
}).any();

module.exports = { adminOrderUpload };