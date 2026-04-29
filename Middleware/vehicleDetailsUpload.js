

const multer = require("multer");
const path = require("path");
const fs = require("fs");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // ✅ model இல்லன்னா "misc" folder use பண்ணு (crash ஆகாது)
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

const vehicleUpload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
}).fields([
  { name: "mainImage", maxCount: 4 },
  { name: "sideImages", maxCount: 4 },
  { name: "interiorImages", maxCount: 4 },
  { name: "ledDisplayImage", maxCount: 4 },
  { name: "brandingSample", maxCount: 4 },
  { name: "vehicleVideo", maxCount: 4 },
]);

module.exports = vehicleUpload;