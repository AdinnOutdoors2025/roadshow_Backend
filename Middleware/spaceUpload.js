// Middleware/spaceUpload.js
const multer = require("multer");
const multerS3 = require("multer-s3");
const { S3Client } = require("@aws-sdk/client-s3");
const path = require("path");
const fs = require("fs");

// Configure DigitalOcean Spaces Client
const spacesClient = new S3Client({
  region: process.env.DO_SPACES_REGION || "sgp1",
  endpoint: process.env.DO_SPACES_ENDPOINT || "https://sgp1.digitaloceanspaces.com",
  credentials: {
    accessKeyId: process.env.DO_SPACES_KEY,
    secretAccessKey: process.env.DO_SPACES_SECRET,
  },
  forcePathStyle: false,
});

const BUCKET_NAME = process.env.DO_SPACES_BUCKET || "adinn-space";
const CDN_BASE_URL = process.env.DO_SPACES_CDN_BASE || "https://adinn-space.sgp1.digitaloceanspaces.com";
const STORAGE_TYPE = process.env.STORAGE_TYPE || "local";
const NODE_ENV = process.env.NODE_ENV || "development";

// Get base URL for local storage
const getLocalBaseUrl = () => {
  if (NODE_ENV === "production") {
    return process.env.PRODUCTION_BASE_URL || "https://your-production-domain.com";
  }
  return process.env.LOCAL_BASE_URL || "http://localhost:3001";
};

// Ensure local upload directories exist
const createLocalUploadDirs = () => {
  if (STORAGE_TYPE !== "local") return;

  const uploadPath = process.env.LOCAL_UPLOAD_PATH || "public/uploads";
  const dirs = [
    uploadPath,
    `${uploadPath}/vehicles`,
    `${uploadPath}/vehicles/front`,
    `${uploadPath}/vehicles/left`,
    `${uploadPath}/vehicles/right`,
    `${uploadPath}/vehicles/rear`,
    `${uploadPath}/vehicles/interior`,
    `${uploadPath}/vehicles/videos`,
  ];

  dirs.forEach((dir) => {
    const fullPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  });
};

createLocalUploadDirs();

// File filter function
const fileFilter = (req, file, cb) => {
  const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
  const allowedVideoTypes = /mp4|mov|avi|mkv|webm/;

  const extname =
    allowedImageTypes.test(path.extname(file.originalname).toLowerCase()) ||
    allowedVideoTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedImageTypes.test(file.mimetype) || allowedVideoTypes.test(file.mimetype);

  if (mimetype && extname) {
    const isVideo = allowedVideoTypes.test(file.mimetype);
    const maxSize = isVideo
      ? parseInt(process.env.MAX_VIDEO_SIZE) || 10 * 1024 * 1024
      : parseInt(process.env.MAX_IMAGE_SIZE) || 3 * 1024 * 1024;

    if (file.size > maxSize) {
      const maxSizeMB = maxSize / (1024 * 1024);
      return cb(new Error(`File size exceeds ${maxSizeMB}MB limit`));
    }
    return cb(null, true);
  } else {
    cb(new Error("Only images (jpeg, jpg, png, gif, webp) and videos (mp4, mov, avi, mkv, webm) are allowed"));
  }
};

// Local storage configuration
const getLocalDestination = (fieldname) => {
  const basePath = process.env.LOCAL_UPLOAD_PATH || "public/uploads";
  const destinations = {
    frontViewImage: `${basePath}/vehicles/front`,
    leftSideImage: `${basePath}/vehicles/left`,
    rightSideImage: `${basePath}/vehicles/right`,
    rearViewImage: `${basePath}/vehicles/rear`,
    interiorImage: `${basePath}/vehicles/interior`,
    demoVideo: `${basePath}/vehicles/videos`,
  };
  return path.join(process.cwd(), destinations[fieldname] || `${basePath}/vehicles`);
};

const localStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const destinationPath = getLocalDestination(file.fieldname);
    cb(null, destinationPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

// Get file URL based on storage type
const getFileUrl = (filePath) => {
  if (!filePath) return "";

  if (STORAGE_TYPE === "space") {
    // Already a full URL from Spaces
    if (filePath.startsWith("http")) return filePath;
    // Construct CDN URL
    return `${CDN_BASE_URL}/${filePath.replace(/^\/+/, "")}`;
  }

  // Local storage - construct URL
  const baseUrl = getLocalBaseUrl();
  const relativePath = filePath.replace(process.cwd(), "").replace(/\\/g, "/");
  return `${baseUrl}${relativePath}`;
};

// Configure multer based on storage type
let storage;
let upload;

if (STORAGE_TYPE === "space") {
  // DigitalOcean Spaces storage
  storage = multerS3({
    s3: spacesClient,
    bucket: BUCKET_NAME,
    metadata: function (req, file, cb) {
      cb(null, { fieldname: file.fieldname });
    },
    key: function (req, file, cb) {
      const isVideo = file.mimetype.startsWith("video/");
      let folder = "vehicles";

      if (file.fieldname === "demoVideo") folder = "vehicles/videos";
      else if (file.fieldname === "frontViewImage") folder = "vehicles/front";
      else if (file.fieldname === "leftSideImage") folder = "vehicles/left";
      else if (file.fieldname === "rightSideImage") folder = "vehicles/right";
      else if (file.fieldname === "rearViewImage") folder = "vehicles/rear";
      else if (file.fieldname === "interiorImage") folder = "vehicles/interior";

      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      const filename = file.fieldname + "-" + uniqueSuffix + ext;
      const fullPath = `${folder}/${filename}`;
      cb(null, fullPath);
    },
    acl: "public-read",
  });

  upload = multer({
    storage: storage,
    limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024 },
    fileFilter: fileFilter,
  });
} else {
  // Local storage
  upload = multer({
    storage: localStorage,
    limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024 },
    fileFilter: fileFilter,
  });
}

// Create multer fields configuration
const vehicleUpload = upload.fields([
  { name: "frontViewImage", maxCount: 1 },
  { name: "leftSideImage", maxCount: 1 },
  { name: "rightSideImage", maxCount: 1 },
  { name: "rearViewImage", maxCount: 1 },
  { name: "interiorImage", maxCount: 1 },
  { name: "demoVideo", maxCount: 1 },
  // Backward compatibility fields
  { name: "mainImage", maxCount: 10 },
  { name: "sideImages", maxCount: 4 },
  { name: "interiorImages", maxCount: 4 },
  { name: "ledDisplayImage", maxCount: 4 },
  { name: "brandingSample", maxCount: 4 },
  { name: "vehicleVideo", maxCount: 4 },
]);

module.exports = vehicleUpload;
module.exports.getFileUrl = getFileUrl;
module.exports.STORAGE_TYPE = STORAGE_TYPE;
module.exports.spacesClient = spacesClient;