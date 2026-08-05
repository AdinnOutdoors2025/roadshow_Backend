const mongoose = require("mongoose");

const ProjectSettingSchema = new mongoose.Schema(
  {
    defaultTo: { type: String, default: "" },
    defaultCc: { type: String, default: "" },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ProjectSetting", ProjectSettingSchema);
