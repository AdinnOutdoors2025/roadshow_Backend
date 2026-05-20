// utils/gstVerification.js
const axios = require('axios');

async function verifyGST(gstNumber) {
  try {
 
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstRegex.test(gstNumber)) {
      return { valid: false, message: 'Invalid GST Format' };
    }

   
    const response = await axios.get(
      `https://commonapi.mastersindia.co/commonapis/searchgstin/${gstNumber}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.GST_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

   
    const gstData = {
      gstin: gstNumber,
      businessName: response.data.TradeName,
      legalName: response.data.LegalName,
      address: response.data.PradrAddr,
      status: response.data.Status,
      registrationDate: response.data.RegistrationDate,
      valid: true
    };

    return gstData;

  } catch (error) {
    return { valid: false, message: 'GST Verification Failed' };
  }
}

module.exports = { verifyGST };