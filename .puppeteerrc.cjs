// Forces Puppeteer's Chrome download (during npm install/build) and its
// runtime lookup (puppeteer.launch() in Utils/bookingSummaryPdfRenderer.js)
// to use the SAME cache directory — one inside this project folder rather
// than the default $HOME/.cache/puppeteer. On Render, only the project
// directory is guaranteed to carry over from the build phase into the
// running instance; a $HOME-based cache is not, which is why Chrome kept
// downloading successfully at build time yet showing "Could not find
// Chrome" at runtime. See https://pptr.dev/guides/configuration.
const { join } = require("path");

module.exports = {
  cacheDirectory: join(__dirname, ".cache", "puppeteer"),
};
