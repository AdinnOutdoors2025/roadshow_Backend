
const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  state: { type: String, required: true },
  cities: [{ type: String }]
});

module.exports = mongoose.model('Location', locationSchema);