const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const {
  createVehicle,
  getVehicles,
  updateVehicle,
  deleteVehicle,
} = require("../../controllers/EntryVehiclesController/entryVehicles");
// const { protect } = require("../../Middleware/authmiddleware"); 
const {
    protect,
    isAdmin,
    verifyAdminExists,
} = require('../../Middleware/rolemiddleware');

// ─── Multer Storage Configuration ───────────────────────────────────────────

const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    const modelName = req.body.model;

    if (!modelName) {
      return cb(new Error("Model name is required"), null);
    }

    const formattedModel = modelName.trim().replace(/\s+/g, "_");
    const uploadPath = path.join(__dirname, "../public/uploads", formattedModel);

    // Create folder if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },

  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { files: 4 },
});

// ─── Routes ─────────────────────────────────────────────────────────────────


router.post("/entryVehicles",protect, upload.array("images", 4), createVehicle);
router.get("/getVehicles",protect, getVehicles);
router.put("/updateVehicle/:id",protect, upload.array("images", 4), updateVehicle);
router.delete("/deleteVehicle/:id",protect, deleteVehicle);

module.exports = router;