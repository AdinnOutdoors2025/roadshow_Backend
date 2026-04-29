const express = require('express');
const router = express.Router();

const {
  getAllOffers,
  getOfferById,
  createOffer,
  updateOffer,
  deleteOffer,
} = require('../../controllers/vehicleOfferController/vehicleOffer');

const { protect } = require("../../Middleware/authmiddleware");

// Corrected routes
router
  .route('/')
  .get(protect, getAllOffers)
  .post(protect, createOffer);

// If you ever enable apply offer:
// router.post('/apply', protect, applyOffer);

router
  .route('/:id')
  .get(protect, getOfferById)
  .put(protect, updateOffer)
  .delete(protect, deleteOffer);

module.exports = router;