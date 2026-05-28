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

export const getCurrentIndiaDateParts = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return {
    dateOnly: `${year}-${month}-${day}`,
    dateKey: `${year}${month}${day}`,
  };
};

export const sanitizeFileNamePart = (value = "") => {
  const cleaned = String(value)
    .trim()
    .replace(/\.pdf$/i, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
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

  const counterKey = `ADINN-RS-${dateKey}`;

  const [counter, latestQuotation] = await Promise.all([
    Counter.findOne({
      key: counterKey,
    })
      .select("sequence")
      .lean(),

    RoadshowQuotation.findOne({
      quotationDateKey: dateKey,
    })
      .sort({
        quotationSequence: -1,
      })
      .select("quotationSequence")
      .lean(),
  ]);

  const counterSequence = counter?.sequence || 0;
  const latestQuotationSequence = latestQuotation?.quotationSequence || 0;

  const currentSequence = Math.max(counterSequence, latestQuotationSequence);
  const nextSequence = currentSequence + 1;

  return {
    quotationDate: dateOnly,
    quotationDateKey: dateKey,
    nextSequence,
    nextQuotationNumber: `ADINN-RS-${dateKey}#${nextSequence}`,
  };
};

export const generateRoadshowQuotationNumber = async (dateKey) => {
  const counterKey = `ADINN-RS-${dateKey}`;

  const existingCounter = await Counter.findOne({
    key: counterKey,
  });

  if (!existingCounter) {
    const latestQuotation = await RoadshowQuotation.findOne({
      quotationDateKey: dateKey,
    })
      .sort({
        quotationSequence: -1,
      })
      .select("quotationSequence")
      .lean();

    const latestSequence = latestQuotation?.quotationSequence || 0;

    try {
      await Counter.updateOne(
        {
          key: counterKey,
        },
        {
          $setOnInsert: {
            key: counterKey,
            sequence: latestSequence,
          },
        },
        {
          upsert: true,
        },
      );
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
    }
  }

  const counter = await Counter.findOneAndUpdate(
    {
      key: counterKey,
    },
    {
      $inc: {
        sequence: 1,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  );

  const quotationSequence = counter.sequence;
  const quotationNumber = `ADINN-RS-${dateKey}#${quotationSequence}`;

  return {
    quotationNumber,
    quotationSequence,
  };
};