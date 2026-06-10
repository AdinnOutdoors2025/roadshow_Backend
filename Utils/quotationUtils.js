// utils/quotation.utils.js

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import Counter from "../Models/CounterModel.js";
import RoadshowQuotation from "../Models/RoadshowQuotationModel.js";
import {
  spacesClient,
  DO_SPACES_BUCKET,
  DO_SPACES_CDN_URL,
} from "../config/digitalOceanSpaces.js";

export const ROADSHOW_ESTIMATE_NUMBER_REGEX = /^EST-\d{5}$/;

const ROADSHOW_ESTIMATE_START_NUMBER = 30000;
const ROADSHOW_ESTIMATE_MAX_NUMBER = 99999;

export const getCurrentIndiaDateParts = () => {
  const indiaDate = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
  );

  const year = indiaDate.getFullYear();
  const month = String(indiaDate.getMonth() + 1).padStart(2, "0");
  const day = String(indiaDate.getDate()).padStart(2, "0");

  return {
    dateOnly: `${year}-${month}-${day}`,
    dateKey: `${year}${month}${day}`,
  };
};

export const normalizeRoadshowQuotationNumber = (value = "") => {
  return String(value || "").trim().toUpperCase();
};

export const isValidRoadshowQuotationNumber = (value = "") => {
  return ROADSHOW_ESTIMATE_NUMBER_REGEX.test(
    normalizeRoadshowQuotationNumber(value),
  );
};

const formatRoadshowEstimateNumber = (quotationSequence) => {
  return `EST-${String(quotationSequence).padStart(5, "0")}`;
};

export const generateUniqueRoadshowQuotationNumber = async () => {
  const existingQuotationCount = await RoadshowQuotation.countDocuments({
    quotationNumber: ROADSHOW_ESTIMATE_NUMBER_REGEX,
  });

  let quotationSequence =
    ROADSHOW_ESTIMATE_START_NUMBER + existingQuotationCount + 1;

  while (quotationSequence <= ROADSHOW_ESTIMATE_MAX_NUMBER) {
    const quotationNumber = formatRoadshowEstimateNumber(quotationSequence);

    const existingQuotation = await RoadshowQuotation.exists({
      quotationNumber,
    });

    if (!existingQuotation) {
      return {
        quotationNumber,
        quotationSequence,
        randomCode: String(quotationSequence).padStart(5, "0"),
      };
    }

    quotationSequence += 1;
  }

  throw new Error(
    "Unable to generate a unique quotation number. EST number limit reached.",
  );
};

export const sanitizeFileNamePart = (value = "") => {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return cleaned || "roadshow-quotation";
};

export const getPublicPdfUrl = (spaceKey) => {
  if (DO_SPACES_CDN_URL) {
    return `${DO_SPACES_CDN_URL.replace(/\/$/, "")}/${spaceKey}`;
  }

  return `https://${DO_SPACES_BUCKET}.${DO_SPACES_REGION}.digitaloceanspaces.com/${spaceKey}`;
};

export const getNextRoadshowQuotationNumberWithoutIncrement = async () => {
  const { dateOnly, dateKey } = getCurrentIndiaDateParts();

  const { quotationNumber, quotationSequence, randomCode } =
    await generateUniqueRoadshowQuotationNumber();

  return {
    quotationDate: dateOnly,
    quotationDateKey: dateKey,
    nextSequence: quotationSequence,
    quotationSequence,
    randomCode,
    nextQuotationNumber: quotationNumber,
    quotationNumber,
  };
};

export const generateRoadshowQuotationNumber = async () => {
  const { quotationNumber, quotationSequence } =
    await generateUniqueRoadshowQuotationNumber();

  return {
    quotationNumber,
    quotationSequence,
  };
};