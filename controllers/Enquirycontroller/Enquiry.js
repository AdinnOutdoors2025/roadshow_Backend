require('dotenv').config();
const axios = require("axios");
const Enquiry = require("../../Models/Enquiry/enquirymodel");
const {
  findExistingToday,
  ALREADY_ENQUIRED_MESSAGE,
} = require("../../Utils/enquiryDedup");

const sendRoadshowEnquiry = async (req, res) => {
  try {
    const {
      userName,
      userEnquiryEmail,
      userContactNumber,
      userPreferredLocation,
      userStartDate,
      userEndDate,
      userPreferredvehicle,
      userEnquiryMessage,
    } = req.body;

    // Basic Validation
    if (
    
      !userName ||
      !userEnquiryEmail ||
      !userContactNumber ||
      !userPreferredLocation ||
      !userStartDate ||
      !userEndDate ||
      !userPreferredvehicle
    ) {
      return res.status(400).json({
        status: "error",
        message: "All required fields must be provided",
      });
    }

    // Daily dedup: block a second enquiry from the same phone/email today.
    const existingToday = await findExistingToday(Enquiry, {
      phone: userContactNumber,
      email: userEnquiryEmail,
    });

    if (existingToday) {
      return res.status(409).json({
        status: "error",
        message: ALREADY_ENQUIRED_MESSAGE,
      });
    }

    const payload = {
      mailtype: "roadshowEnquiry",
      userName,
      userEnquiryEmail,
      userContactNumber,
      userPreferredLocation,
      userStartDate,
      userEndDate,
      userPreferredvehicle,
      userEnquiryMessage: userEnquiryMessage || "",
    };

    
    const apiResponse = await axios.post(

         process.env.EXTERNAL_API_URL,
     
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const { status, message } = apiResponse.data;

    // Step 2: API success-ஆ check பண்ணு
    if (status === "success") {
    
      const newEnquiry = new Enquiry({
        ...payload,
        apiStatus: status,
      });

      await newEnquiry.save();

      return res.status(200).json({
        status: "success",
        message: "Mail sent and enquiry saved successfully",
        data: newEnquiry,
      });
    } else {
      
      return res.status(400).json({
        status: "error",
        message: message || "External API failed",
      });
    }
  } catch (error) {
    console.error("❌ Error:", error.message);

    // Axios error handle
    if (error.response) {
      return res.status(error.response.status).json({
        status: "error",
        message: error.response.data?.message || "External API error",
      });
    }

    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

module.exports = { sendRoadshowEnquiry };