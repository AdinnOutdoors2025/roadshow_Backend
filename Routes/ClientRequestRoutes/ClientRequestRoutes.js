const express = require('express');
const router = express.Router();
const {
  createClientRequest,
  getAllClientRequests,
  getMyClientRequests,
  getClientRequestById,
  updateClientRequest,
  updateStatus,
  deleteClientRequest
} = require('../../controllers/ClientRequestController/ClientRequestController');

/* Campaign media (images + videos) now rides along with a client request, so
   POST/PUT accept multipart/form-data. The admin order uploader is reused
   rather than duplicated — it already enforces exactly the limits the public
   Campaign Details step validates against (images 5MB, videos 50MB) and
   already handles both local disk and DigitalOcean Spaces.

   multer only touches multipart bodies: a JSON request passes straight
   through to the already-parsed req.body, so every existing caller of these
   routes is unaffected. */
const { adminOrderUpload } = require('../../Middleware/orderImageupload');

/* A client request carries the customer's contact details, GSTIN, PAN,
   company, every campaign they booked and the full price breakdown. None of
   these routes used to ask who was calling. See clientRequestAuth.js. */
const {
  protectClient,
  protectStaff,
  allowClientOrStaff,
} = require('./clientRequestAuth');

/* Customers: place a booking, list their own, read one of their own.
   The guard runs BEFORE multer so an unauthenticated upload is rejected
   without first writing its files to disk (or to Spaces). */
router.post('/', protectClient, adminOrderUpload, createClientRequest);

/* Registered before '/:id', or Express would read "mine" as an id. */
router.get('/mine', protectClient, getMyClientRequests);

/* Either audience — the controller narrows a customer to their own record */
router.get('/:id', allowClientOrStaff, getClientRequestById);

/* Staff only: the full listing, edits, status changes and deletion */
router.get('/', protectStaff, getAllClientRequests);
router.put('/:id', protectStaff, adminOrderUpload, updateClientRequest);
router.patch('/:id/status', protectStaff, updateStatus);
router.delete('/:id', protectStaff, deleteClientRequest);

module.exports = router;
