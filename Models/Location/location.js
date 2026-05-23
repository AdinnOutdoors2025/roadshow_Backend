
// const mongoose = require('mongoose');

// const locationSchema = new mongoose.Schema({
//   state: { type: String, required: true },
//   cities: [{ type: String }]
// });

// module.exports = mongoose.model('Location', locationSchema);

const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {},
  { strict: false } // allows dynamic state keys like "Tamil Nadu", "Haryana"
);

module.exports = mongoose.model('Location', locationSchema);