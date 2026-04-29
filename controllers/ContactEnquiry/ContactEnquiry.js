require("dotenv").config();
const axios = require("axios");
const Enquiry = require("../../Models/contactEnquiryModel/contactEnquiryModel");

const sendContactEnquiry = async (req, res) => {
  try {
    const {
      userName,
      userContactNumber,
      userEnquiryEmail,
      userEnquiryMessage,
    } = req.body;

    // Mandatory fields check
    if (!userName || !userContactNumber) {
      return res.status(400).json({
        status: "error",
        message: "Name and phone number are required",
      });
    }

    const payload = {
      mailtype: "contactEnquiry",
      userName,
      userContactNumber,
      userEnquiryEmail: userEnquiryEmail || "",
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


    if (status === "success") {
      const newEnquiry = new Enquiry({
        ...payload,
        apiStatus: status,
      });

      await newEnquiry.save();

      return res.status(200).json({
        status: "success",
        message: "Mail sent and Contact enquiry saved successfully",
        data: newEnquiry,
      });
    } else {
      return res.status(400).json({
        status: "error",
        message: message || "External API failed",
      });
    }
  } catch (error) {
    console.error(" Error:", error.message);

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

module.exports = { sendContactEnquiry };