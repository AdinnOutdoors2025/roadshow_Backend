// Utils/shortUrl.js

import axios from "axios";

const IS_GD_API_URL = "https://is.gd/create.php";

const normalizeQuotationNumber = (quotationNumber = "") => {
  const normalized = String(quotationNumber || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^EST(\d)/, "EST-$1");

  if (!normalized) {
    throw new Error("Quotation number is required for short URL");
  }

  return normalized;
};

export const buildRoadshowQuotationLongUrl = (quotationNumber = "") => {
  const frontendBaseUrl = process.env.FRONTEND_BASE_URL;

  if (!frontendBaseUrl) {
    throw new Error("FRONTEND_BASE_URL is missing in .env");
  }

  const normalizedQuotationNumber = normalizeQuotationNumber(quotationNumber);

  return `${frontendBaseUrl.replace(
    /\/$/,
    "",
  )}/roadshow-quotations?qn=${encodeURIComponent(normalizedQuotationNumber)}`;
};

// export const shortenAnyUrl = async (longUrl = "") => {
//   const cleanLongUrl = String(longUrl || "").trim();

//   if (!cleanLongUrl) {
//     throw new Error("Long URL is required");
//   }

//   try {
//     const response = await axios.get(IS_GD_API_URL, {
//       params: {
//         format: "json",
//         url: cleanLongUrl,
//       },
//       timeout: 15000,
//     });

//     if (!response.data?.shorturl) {
//       throw new Error(response.data?.errormessage || "Short URL creation failed");
//     }

//     return {
//       provider: "is.gd",
//       longUrl: cleanLongUrl,
//       shortUrl: response.data.shorturl,
//       code: response.data.shorturl.split("/").pop() || "",
//     };
//   } catch (error) {
//     const message =
//       error?.response?.data?.errormessage ||
//       error?.response?.data?.message ||
//       error?.message ||
//       "Short URL creation failed";

//     throw new Error(message);
//   }
// };


export const shortenAnyUrl = async (longUrl = "") => {
  const cleanLongUrl = String(longUrl || "").trim();

  if (!cleanLongUrl) {
    throw new Error("Long URL is required");
  }

 if (process.env.DISABLE_ROADSHOW_SHORT_URL === "true") {
  return {
    provider: "disabled",
    longUrl: cleanLongUrl,
    shortUrl: "",
    code: "",
  };
}
  try {
    const response = await axios.get(IS_GD_API_URL, {
      params: {
        format: "json",
        url: cleanLongUrl,
      },
      timeout: 15000,
    });

    if (!response.data?.shorturl) {
      throw new Error(
        response.data?.errormessage || "Short URL creation failed"
      );
    }

    return {
      provider: "is.gd",
      longUrl: cleanLongUrl,
      shortUrl: response.data.shorturl,
      code: response.data.shorturl.split("/").pop() || "",
    };
  } catch (error) {
    const message =
      error?.response?.data?.errormessage ||
      error?.response?.data?.message ||
      error?.message ||
      "Short URL creation failed";

    throw new Error(message);
  }
};

export const createRoadshowQuotationShortUrl = async ({
  quotationNumber,
  quotationId,
}) => {
  const longUrl = buildRoadshowQuotationLongUrl(quotationNumber);

  console.log("Long URL sending to is.gd:", longUrl);

  const shortUrlResult = await shortenAnyUrl(longUrl);

  return {
    ...shortUrlResult,
    quotationId,
  };
};