require('dotenv').config();

const axios = require("axios");

const sendOTP = async (mobileNumber, otp) => {


  const formattedNumber =
    mobileNumber.length === 10 ? `91${mobileNumber}` : mobileNumber;

  const message =
    `Welcome to Adinn Outdoors! Your verification code is ${otp}. ` +
    `Use this OTP to complete your verification. Please don't share it with anyone.`;



  const apiUrl =
    `https://retailsms.nettyfish.com/api/mt/SendSMS?` +
    `APIKey=${process.env.NETTYFISH_API_KEY}` +
    `&senderid=${process.env.NETTYFISH_SENDER_ID}` +
    `&channel=Trans` +
    `&DCS=0` +
    `&flashsms=0` +
    `&number=${formattedNumber}` +
    `&dlttemplateid=${process.env.NETTYFISH_TEMPLATE_ID}` +
    `&text=${encodeURIComponent(message)}` +
    `&route=17`;

  const response = await axios.get(apiUrl, { timeout: 10000 });

  if (response.status !== 200) {
    throw new Error(`SMS HTTP Error: ${response.status} | ${response.data}`);
  }

  console.log("Nettyfish SMS response:", response.data);
  return response.data;
};

module.exports = { sendOTP };