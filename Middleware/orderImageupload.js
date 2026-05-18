

const multer = require("multer");
const path = require("path");
const fs = require("fs");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    
    const uploadPath = path.join(__dirname, "../public/uploads");

    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
  
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/\s+/g, "-");
    cb(null, `${Date.now()}-${name}${ext}`);
  },
});

const adminOrderUpload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: function (req, file, cb) {
   
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