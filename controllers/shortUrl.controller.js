// controllers/shortUrl.controller.js

const ShortUrl = require("../Models/ShortUrlModel.js");

const redirectShortUrl = async (req, res) => {
  try {
    const { code } = req.params;

    const shortUrl = await ShortUrl.findOne({ code });

    if (!shortUrl) {
      return res.status(404).send("Short URL not found");
    }

    shortUrl.clicks = Number(shortUrl.clicks || 0) + 1;
    shortUrl.lastClickedAt = new Date();
    await shortUrl.save();

    return res.redirect(302, shortUrl.longUrl);
  } catch (error) {
    console.error("Short URL redirect error:", error);
    return res.status(500).send("Unable to open short URL");
  }
};

module.exports = {
  redirectShortUrl,
};