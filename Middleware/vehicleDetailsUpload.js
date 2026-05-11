// //MIDDLEWARE
// const multer = require("multer");
// const path = require("path");
// const fs = require("fs");

// // Ensure upload directories exist
// const createUploadDirs = () => {
//   const dirs = [
//     "public/uploads/vehicles",
//     "public/uploads/vehicles/front",
//     "public/uploads/vehicles/side",
//     "public/uploads/vehicles/rear",
//     "public/uploads/vehicles/interior",
//     "public/uploads/vehicles/videos"
//   ];
  
//   dirs.forEach(dir => {
//     const fullPath = path.join(__dirname, "../", dir);
//     if (!fs.existsSync(fullPath)) {
//       fs.mkdirSync(fullPath, { recursive: true });
//     }
//   });
// };

// createUploadDirs();

// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     let uploadPath = path.join(__dirname, "../public/uploads/vehicles");
    
//     // Categorize by file type
//     if (file.fieldname === "demoVideo") {
//       uploadPath = path.join(__dirname, "../public/uploads/vehicles/videos");
//     } else if (file.fieldname === "frontViewImage") {
//       uploadPath = path.join(__dirname, "../public/uploads/vehicles/front");
//     } else if (file.fieldname === "leftSideImage" || file.fieldname === "rightSideImage") {
//       uploadPath = path.join(__dirname, "../public/uploads/vehicles/side");
//     } else if (file.fieldname === "rearViewImage") {
//       uploadPath = path.join(__dirname, "../public/uploads/vehicles/rear");
//     } else if (file.fieldname === "interiorImage") {
//       uploadPath = path.join(__dirname, "../public/uploads/vehicles/interior");
//     }
    
//     cb(null, uploadPath);
//   },
//   filename: function (req, file, cb) {
//     const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
//     const ext = path.extname(file.originalname);
//     cb(null, file.fieldname + "-" + uniqueSuffix + ext);
//   },
// });

// const fileFilter = (req, file, cb) => {
//   const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
//   const allowedVideoTypes = /mp4|mov|avi|mkv|webm/;
  
//   const extname = allowedImageTypes.test(path.extname(file.originalname).toLowerCase()) ||
//                   allowedVideoTypes.test(path.extname(file.originalname).toLowerCase());
//   const mimetype = allowedImageTypes.test(file.mimetype) || allowedVideoTypes.test(file.mimetype);

//   if (mimetype && extname) {
//     return cb(null, true);
//   } else {
//     cb(new Error("Only images (jpeg, jpg, png, gif, webp) and videos (mp4, mov, avi, mkv, webm) are allowed"));
//   }
// };

// const upload = multer({
//   storage: storage,
//   limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
//   fileFilter: fileFilter,
// });

// // Handle multiple file uploads
// const vehicleUpload = upload.fields([
//   // Single file uploads
//   { name: "frontViewImage", maxCount: 1 },
//   { name: "leftSideImage", maxCount: 1 },
//   { name: "rightSideImage", maxCount: 1 },
//   { name: "rearViewImage", maxCount: 1 },
//   { name: "interiorImage", maxCount: 1 },
//   { name: "demoVideo", maxCount: 1 },
  
//   // Array file uploads for backward compatibility
//   { name: "mainImage", maxCount: 10 },
//   { name: "sideImages", maxCount: 4 },
//   { name: "interiorImages", maxCount: 4 },
//   { name: "ledDisplayImage", maxCount: 4 },
//   { name: "brandingSample", maxCount: 4 },
//   { name: "vehicleVideo", maxCount: 4 },
// ]);

// module.exports = vehicleUpload;







// Middleware/vehicleDetailsUpload.js

const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Get configuration from environment
const MAX_IMAGE_SIZE = parseInt(process.env.MAX_IMAGE_SIZE) || 3 * 1024 * 1024; // 3MB default
const MAX_VIDEO_SIZE = parseInt(process.env.MAX_VIDEO_SIZE) || 10 * 1024 * 1024; // 10MB default
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024; // 50MB default
const STORAGE_TYPE = process.env.STORAGE_TYPE || "local";
const LOCAL_BASE_URL = process.env.LOCAL_BASE_URL || "http://localhost:3001";
const PRODUCTION_BASE_URL = process.env.PRODUCTION_BASE_URL || "";
const NODE_ENV = process.env.NODE_ENV || "development";

// Get base URL based on environment
const getBaseUrl = () => {
  if (NODE_ENV === "production") {
    return PRODUCTION_BASE_URL;
  }
  return LOCAL_BASE_URL;
};

// Ensure upload directories exist (for local storage)
const createUploadDirs = () => {
  if (STORAGE_TYPE !== "local") return;
  
  const uploadPath = process.env.LOCAL_UPLOAD_PATH || "public/uploads";
  const dirs = [
    uploadPath,
    `${uploadPath}/vehicles`,
    `${uploadPath}/vehicles/front`,
    `${uploadPath}/vehicles/side`,
    `${uploadPath}/vehicles/rear`,
    `${uploadPath}/vehicles/interior`,
    `${uploadPath}/vehicles/videos`
  ];
  
  dirs.forEach(dir => {
    const fullPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  });
};

createUploadDirs();

// File filter function
const fileFilter = (req, file, cb) => {
  const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
  const allowedVideoTypes = /mp4|mov|avi|mkv|webm/;
  
  const extname = allowedImageTypes.test(path.extname(file.originalname).toLowerCase()) ||
                  allowedVideoTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedImageTypes.test(file.mimetype) || allowedVideoTypes.test(file.mimetype);

  if (mimetype && extname) {
    // Check file size based on type
    const isVideo = allowedVideoTypes.test(file.mimetype);
    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
    
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
const localStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = process.env.LOCAL_UPLOAD_PATH || "public/uploads";
    let destinationPath = path.join(process.cwd(), uploadPath, "vehicles");
    
    // Categorize by file type
    if (file.fieldname === "demoVideo") {
      destinationPath = path.join(process.cwd(), uploadPath, "vehicles/videos");
    } else if (file.fieldname === "frontViewImage") {
      destinationPath = path.join(process.cwd(), uploadPath, "vehicles/front");
    } else if (file.fieldname === "leftSideImage" || file.fieldname === "rightSideImage") {
      destinationPath = path.join(process.cwd(), uploadPath, "vehicles/side");
    } else if (file.fieldname === "rearViewImage") {
      destinationPath = path.join(process.cwd(), uploadPath, "vehicles/rear");
    } else if (file.fieldname === "interiorImage") {
      destinationPath = path.join(process.cwd(), uploadPath, "vehicles/interior");
    }
    
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
  
  if (STORAGE_TYPE === "cloudinary") {
    return filePath; // Cloudinary returns full URL
  }
  
  // Local storage - construct URL
  const baseUrl = getBaseUrl();
  const relativePath = filePath.replace(process.cwd(), "");
  return `${baseUrl}${relativePath}`;
};

// Configure multer based on storage type
let storage;
if (STORAGE_TYPE === "cloudinary") {
  const { CloudinaryStorage } = require("multer-storage-cloudinary");
  const { v2: cloudinary } = require("cloudinary");
  
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  
  storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
      const isVideo = file.mimetype.startsWith("video/");
      let folder = "vehicles";
      
      if (file.fieldname === "demoVideo") folder = "vehicles/videos";
      else if (file.fieldname === "frontViewImage") folder = "vehicles/front";
      else if (file.fieldname === "leftSideImage" || file.fieldname === "rightSideImage") folder = "vehicles/side";
      else if (file.fieldname === "rearViewImage") folder = "vehicles/rear";
      else if (file.fieldname === "interiorImage") folder = "vehicles/interior";
      
      return {
        folder: folder,
        resource_type: isVideo ? "video" : "image",
        allowed_formats: isVideo ? ["mp4", "mov", "avi", "mkv", "webm"] : ["jpg", "jpeg", "png", "gif", "webp"],
      };
    },
  });
} else {
  storage = localStorage;
}

const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: fileFilter,
});

// Handle multiple file uploads
const vehicleUpload = upload.fields([
  // Single file uploads
  { name: "frontViewImage", maxCount: 1 },
  { name: "leftSideImage", maxCount: 1 },
  { name: "rightSideImage", maxCount: 1 },
  { name: "rearViewImage", maxCount: 1 },
  { name: "interiorImage", maxCount: 1 },
  { name: "demoVideo", maxCount: 1 },
  
  // Array file uploads for backward compatibility
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