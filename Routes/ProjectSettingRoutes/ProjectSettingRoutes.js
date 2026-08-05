const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/ProjectSettingController/ProjectSettingController");
const { protect } = require("../../Middleware/rolemiddleware");

router.get("/", protect, ctrl.getProjectSetting);
router.put("/", protect, ctrl.updateProjectSetting);

module.exports = router;
