const ProjectSetting = require("../../Models/ProjectSettingModel/ProjectSettingModel");
const { successResponse, errorResponse } = require("../../Utils/response");

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

const isValidEmailField = (value) => {
  if (!value || !String(value).trim()) return true;
  const emails = String(value).split(",").map((e) => e.trim()).filter(Boolean);
  return emails.every(isValidEmail);
};

exports.getProjectSetting = async (req, res) => {
  try {
    const setting = await ProjectSetting.findOne().sort({ createdAt: -1 });
    return successResponse(res, "Project setting fetched successfully", {
      data: setting || { defaultTo: "", defaultCc: "" },
    });
  } catch (err) {
    return errorResponse(res, "Failed to fetch project setting", err.message, 500);
  }
};

exports.updateProjectSetting = async (req, res) => {
  try {
    const { defaultTo, defaultCc } = req.body;

    if (!defaultTo || !String(defaultTo).trim()) {
      return errorResponse(res, "To email is required", null, 400);
    }
    if (!isValidEmailField(defaultTo)) {
      return errorResponse(res, "Enter a valid email address in the To field", null, 400);
    }
    if (defaultCc && !isValidEmailField(defaultCc)) {
      return errorResponse(res, "Enter a valid email address in the CC field", null, 400);
    }

    let setting = await ProjectSetting.findOne().sort({ createdAt: -1 });
    if (!setting) {
      setting = new ProjectSetting({});
    }
    setting.defaultTo = defaultTo.trim();
    setting.defaultCc = (defaultCc || "").trim();
    setting.updatedBy = req.user?.username || "Admin";
    await setting.save();

    return successResponse(res, "Project setting updated successfully", { data: setting });
  } catch (err) {
    return errorResponse(res, "Failed to update project setting", err.message, 500);
  }
};
