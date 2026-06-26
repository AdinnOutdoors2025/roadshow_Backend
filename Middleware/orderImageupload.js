

// const multer = require("multer");
// const multerS3 = require("multer-s3");
// const path = require("path");
// const fs = require("fs");
// const spacesClient = require("../config/spaces"); 

// const STORAGE_TYPE = process.env.STORAGE_TYPE || "local";
// const BUCKET_NAME = process.env.DO_SPACES_BUCKET || "adinn-space";

// let adminStorage;

// if (STORAGE_TYPE === "space") {
 
//   adminStorage = multerS3({
//     s3: spacesClient,
//     bucket: BUCKET_NAME,
//     acl: "public-read",
//     metadata: (req, file, cb) => {
//       cb(null, { fieldname: file.fieldname });
//     },
//     key: (req, file, cb) => {
//       const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
//       const ext = path.extname(file.originalname);
//       const name = path.basename(file.originalname, ext).replace(/\s+/g, "-");
     
//       const filename = `${file.fieldname}-${uniqueSuffix}-${name}${ext}`;
//       cb(null, `admin-orders/${filename}`);
//     },
//   });
// } else {
 
//   adminStorage = multer.diskStorage({
//     destination: (req, file, cb) => {
//       const uploadPath = path.join(__dirname, "../public/uploads");
//       if (!fs.existsSync(uploadPath)) {
//         fs.mkdirSync(uploadPath, { recursive: true });
//       }
//       cb(null, uploadPath);
//     },
//     filename: (req, file, cb) => {
//       const ext = path.extname(file.originalname);
//       const name = path.basename(file.originalname, ext).replace(/\s+/g, "-");
//       cb(null, `${Date.now()}-${name}${ext}`);
//     },
//   });
// }

// const IMAGE_MAX_BYTES = 5 * 1024 * 1024;   // 5 MB
// const VIDEO_MAX_BYTES = 50 * 1024 * 1024;  // 50 MB

// const adminOrderUpload = multer({
//   storage: adminStorage,
//   limits: { fileSize: 50 * 1024 * 1024 }, // Hard cap (videos need 50 MB)
//   fileFilter: (req, file, cb) => {
//     const allowedImages = /jpeg|jpg|png|gif|webp/;
//     const allowedVideos = /mp4|mov|avi|mkv|webm/;
//     const ext = path.extname(file.originalname).toLowerCase().slice(1);
//     const isImage = allowedImages.test(ext);
//     const isVideo = allowedVideos.test(ext);

//     if (!isImage && !isVideo) {
//       return cb(new Error(`File type .${ext} not allowed`));
//     }

 
//     cb(null, true);
//   },
// }).any();
// module.exports = { adminOrderUpload };



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

/* ---------------------------- FILE TYPE CHECK ---------------------------- */
const isImageFile = (filename) => {
  const ext = path.extname(filename).toLowerCase().slice(1);
  return /jpeg|jpg|png|gif|webp/.test(ext);
};

const isVideoFile = (filename) => {
  const ext = path.extname(filename).toLowerCase().slice(1);
  return /mp4|mov|avi|mkv|webm/.test(ext);
};


const upload = multer({
  storage: adminStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, 
  fileFilter: (req, file, cb) => {
    const image = isImageFile(file.originalname);
    const video = isVideoFile(file.originalname);

    if (!image && !video) {
      return cb(
        new Error(
          "Only image files (jpeg, jpg, png, gif, webp) and video files (mp4, mov, avi, mkv, webm) are allowed"
        )
      );
    }

    cb(null, true);
  },
}).any();


const adminOrderUpload = (req, res, next) => {
  upload(req, res, async (err) => {
    try {
      if (err) {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            success: false,
            message: "File too large. Maximum allowed size is 50MB.",
          });
        }

        return res.status(400).json({
          success: false,
          message: err.message || "Upload failed",
        });
      }

      if (!req.files || req.files.length === 0) {
        return next();
      }

      for (const file of req.files) {
        const image = isImageFile(file.originalname);
        const video = isVideoFile(file.originalname);

        // IMAGE MAX = 5MB
        if (image && file.size > 5 * 1024 * 1024) {
          if (STORAGE_TYPE !== "space" && file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }

          if (STORAGE_TYPE === "space" && file.key) {
            await spacesClient
              .deleteObject({
                Bucket: BUCKET_NAME,
                Key: file.key,
              })
              .promise()
              .catch(() => {});
          }

          return res.status(400).json({
            success: false,
            message: `Image "${file.originalname}" exceeds 5MB limit`,
          });
        }

        // VIDEO MAX = 50MB
        if (video && file.size > 50 * 1024 * 1024) {
          if (STORAGE_TYPE !== "space" && file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }

          if (STORAGE_TYPE === "space" && file.key) {
            await spacesClient
              .deleteObject({
                Bucket: BUCKET_NAME,
                Key: file.key,
              })
              .promise()
              .catch(() => {});
          }

          return res.status(400).json({
            success: false,
            message: `Video "${file.originalname}" exceeds 50MB limit`,
          });
        }
      }

      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || "Upload processing failed",
      });
    }
  });
};

module.exports = { adminOrderUpload };