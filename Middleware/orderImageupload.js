const multer = require("multer");
const path = require("path");
const fs = require("fs");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const modelName = req.body.model || "misc";
    const formattedModel = modelName.trim().replace(/\s+/g, "_");
    const uploadPath = path.join(__dirname, "../public/uploads", formattedModel);

    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});


const adminOrderUpload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, 
}).any();

module.exports = {adminOrderUpload };