require("dotenv").config();

const axios =
  require("axios");

const Newsletter =
  require(
    "../../Models/NewsletterModel/newsletterModel"
  );

const {
  normalizePhone,
  normalizeEmail,
  findExistingToday,
  ALREADY_ENQUIRED_MESSAGE,
} = require(
  "../../Utils/enquiryDedup"
);


const normalizeEmailCsv =
(value = "") =>
  String(value || "")
    .split(",")
    .map(
      (email) =>
        email.trim()
    )
    .filter(Boolean);


const sendNewsletter =
async (req, res) => {

  try {

    const {
      contact,
      source,
    } = req.body;


    if (
      !contact ||
      !String(contact).trim()
    ) {

      return res.status(400).json({
        status:
          "error",

        message:
          "Please enter your email address or phone number.",
      });
    }


    const input =
      String(contact).trim();


    const isValidEmail =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(input);


    const phoneDigits =
      input.replace(
        /\D/g,
        ""
      );


    const isValidPhone =
      phoneDigits.length === 10 ||
      (
        phoneDigits.length === 12 &&
        phoneDigits.startsWith("91")
      );


    if (
      !isValidEmail &&
      !isValidPhone
    ) {

      return res.status(400).json({
        status:
          "error",

        message:
          "Please enter a valid email address or 10-digit phone number.",
      });
    }


    const normalizedContact =
      isValidEmail
        ? normalizeEmail(input)
        : normalizePhone(input);


    /* =========================================
       DEDUP
    ========================================= */

    const existingToday =
      await findExistingToday(
        Newsletter,
        {
          phone:
            isValidPhone
              ? input
              : "",

          email:
            isValidEmail
              ? input
              : "",

          phoneField:
            "contact",

          emailField:
            "contact",
        }
      );


    if (existingToday) {

      return res.status(409).json({
        status:
          "error",

        message:
          ALREADY_ENQUIRED_MESSAGE,
      });
    }


    /* =========================================
       SAVE
    ========================================= */

    const newNewsletter =
      await Newsletter.create({

        mailtype:
          "roadshow_footer_contact_enquiry",

        contact:
          normalizedContact,

        contactType:
          isValidEmail
            ? "email"
            : "phone",

        source:
          source ||
          "roadshow_footer_contact_enquiry",

        apiStatus:
          "pending",
      });


    /* =========================================
       MAIL
    ========================================= */

    try {

      const mailResponse =
        await axios.post(

          process.env
            .ROADSHOW_ENQUIRY_MAIL_API_URL,

          {

            mailtype:
              "roadshow_footer_contact_enquiry",

            contact:
              normalizedContact,

            contactType:
              isValidEmail
                ? "email"
                : "phone",

            source:
              source ||
              "roadshow_footer_contact_enquiry",


            /*
             * User mail possible only
             * when contact is an email.
             */

            userEmail:
              isValidEmail
                ? normalizedContact
                : "",


            toEmail:
              process.env
                .ROADSHOW_FOOTER_MAIL_TO,

            ccEmail:
              normalizeEmailCsv(
                process.env
                  .ROADSHOW_FOOTER_MAIL_CC
              ),

            mailLogoUrl:
              process.env
                .MAIL_LOGO_URL ||
              "https://adinnoutdoors.com/images/adinnHeaderlogo.svg",
          },

          {
            headers: {
              "Content-Type":
                "application/json",
            },

            timeout:
              30000,
          }
        );


      newNewsletter.apiStatus =
        mailResponse.data?.status ===
        "success"
          ? "success"
          : "failed";


    } catch (mailError) {

      console.error(
        "Footer contact mail failed:",
        mailError?.response?.data ||
        mailError.message
      );

      newNewsletter.apiStatus =
        "failed";
    }


    await newNewsletter.save();


    return res.status(200).json({

      status:
        "success",

      message:
        isValidEmail
          ? "Your email has been registered for Roadshow updates."
          : "Your phone number has been registered for Roadshow updates.",

      data:
        newNewsletter,
    });
  }
  catch (error) {

    console.error(
      "Newsletter subscription error:",
      error.message
    );


    return res.status(500).json({
      status:
        "error",

      message:
        "Internal server error",
    });
  }
};


module.exports = {
  sendNewsletter,
};