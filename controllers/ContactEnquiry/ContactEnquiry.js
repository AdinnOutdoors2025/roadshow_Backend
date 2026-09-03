require("dotenv").config();

const axios = require("axios");

const Enquiry = require("../../Models/contactEnquiryModel/contactEnquiryModel"
);

const {
  findExistingToday,
  ALREADY_ENQUIRED_MESSAGE,
} = require(
  "../../Utils/enquiryDedup"
);


const normalizeEmailCsv = (value = "") =>
  String(value || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);


const getMailLogoUrl = () => {

  if (process.env.MAIL_LOGO_URL) {
    return process.env.MAIL_LOGO_URL;
  }

  const base =
    process.env.NODE_ENV === "production"
      ? process.env.MAIL_ASSET_BASE_URL_LIVE
      : process.env.MAIL_ASSET_BASE_URL_LOCAL;

  return `${String(base || "").replace(/\/$/, "")}${
    process.env.MAIL_LOGO_PATH ||
    "/images/adinnHeaderlogo.svg"
  }`;
};


const sendContactEnquiry =
async (req, res) => {

  let savedEnquiry = null;

  try {

    const {
      userName,
      userContactNumber,
      userEnquiryEmail,
      userEnquiryMessage,

      userPreferredLocation,
      userStartDate,
      userEndDate,
      userPreferredVehicle,
      userPreferredVehicleImage,

      source,
    } = req.body;


    /* =========================================
       VALIDATION
    ========================================= */

    if (
      !userName ||
      !userContactNumber ||
      !userEnquiryEmail
    ) {

      return res.status(400).json({
        status: "error",
        message:
          "Name, phone number and email are required",
      });
    }


    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        String(userEnquiryEmail).trim()
      )
    ) {

      return res.status(400).json({
        status: "error",
        message:
          "Please enter a valid email address",
      });
    }


    /* =========================================
       DAILY DEDUP
    ========================================= */

    const existingToday =
      await findExistingToday(
        Enquiry,
        {
          phone:
            userContactNumber,

          email:
            userEnquiryEmail,
        }
      );


    if (existingToday) {

      return res.status(409).json({
        status: "error",
        message:
          ALREADY_ENQUIRED_MESSAGE,
      });
    }


    /* =========================================
       SAVE FIRST

       This ensures mail failure does not
       create duplicate enquiry submissions.
    ========================================= */

    savedEnquiry =
      await Enquiry.create({

        mailtype:
          "roadshow_contact_page",

        userName:
          String(userName).trim(),

        userContactNumber:
          String(
            userContactNumber
          ).trim(),

        userEnquiryEmail:
          String(
            userEnquiryEmail
          )
            .trim()
            .toLowerCase(),

        userEnquiryMessage:
          String(
            userEnquiryMessage || ""
          ).trim(),

        userPreferredLocation:
          String(
            userPreferredLocation || ""
          ).trim(),

        userStartDate:
          userStartDate || "",

        userEndDate:
          userEndDate || "",

        userPreferredVehicle:
          String(
            userPreferredVehicle || ""
          ).trim(),

        userPreferredVehicleImage:
          String(
            userPreferredVehicleImage || ""
          ).trim(),

        source:
          source ||
          "roadshow_contact_page",

        apiStatus:
          "pending",
      });


    /* =========================================
       PHP MAIL PAYLOAD
    ========================================= */

    const payload = {

      mailtype:
        "roadshow_contact_page",

      userName,

      userContactNumber,

      userEnquiryEmail,

      userEnquiryMessage:
        userEnquiryMessage || "",

      userPreferredLocation:
        userPreferredLocation || "",

      userStartDate:
        userStartDate || "",

      userEndDate:
        userEndDate || "",

      userPreferredVehicle:
        userPreferredVehicle || "",

      source:
        source ||
        "roadshow_contact_page",


      /* ADMIN */

      toEmail:
        process.env
          .ROADSHOW_CONTACT_MAIL_TO,

      ccEmail:
        normalizeEmailCsv(
          process.env
            .ROADSHOW_CONTACT_MAIL_CC
        ),


      /* EMAIL ASSETS */

      mailLogoUrl:
        getMailLogoUrl(),

      vehicleImageUrl:
        userPreferredVehicleImage || "",
    };


    const apiResponse =
      await axios.post(

        process.env
          .ROADSHOW_ENQUIRY_MAIL_API_URL,

        payload,

        {
          headers: {
            "Content-Type":
              "application/json",
          },

          timeout:
            30000,
        }
      );


    const {
      status,
      message,
    } =
      apiResponse.data || {};


    savedEnquiry.apiStatus =
      status === "success"
        ? "success"
        : "failed";

    await savedEnquiry.save();


    if (status !== "success") {

      return res.status(502).json({
        status: "error",
        message:
          message ||
          "Enquiry saved but email could not be sent",
        data:
          savedEnquiry,
      });
    }


    return res.status(200).json({

      status:
        "success",

      message:
        "Contact enquiry submitted successfully",

      data:
        savedEnquiry,
    });


  } catch (error) {

    console.error(
      "Contact enquiry error:",
      error?.response?.data ||
      error.message
    );


    if (savedEnquiry) {

      try {

        savedEnquiry.apiStatus =
          "failed";

        await savedEnquiry.save();

      } catch {
        // Do not mask original error.
      }
    }


    return res.status(500).json({

      status:
        "error",

      message:
        "Your enquiry was recorded, but the email notification could not be completed.",
    });
  }
};


module.exports = {
  sendContactEnquiry,
};