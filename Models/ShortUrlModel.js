// Models/ShortUrlModel.js

const mongoose = require("mongoose");

const shortUrlSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    longUrl: {
      type: String,
      required: true,
    },
    quotationNumber: {
      type: String,
      index: true,
    },
    quotationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RoadshowQuotation",
    },
    clicks: {
      type: Number,
      default: 0,
    },
    lastClickedAt: Date,
  },
  { timestamps: true },
);

module.exports = mongoose.model("ShortUrl", shortUrlSchema);