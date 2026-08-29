const express = require("express");
const router = express.Router();

const {
  createClientRequest,
  getAllClientRequests,
  getMyClientRequests,
  getClientRequestById,
  getClientRequestTracking,
  getClientRequestLiveLocation,
  getClientRequestDrivingSummary,
  getClientRequestRouteTrack,
  getClientRequestVehicleHistory,
  updateClientRequest,
  updateStatus,
  deleteClientRequest,
  uploadAgencyPoDocument,
  removeAgencyPoDocument,
} = require("../../controllers/ClientRequestController/ClientRequestController");

/* Campaign media (images + videos) now rides along with a client request, so
   POST/PUT accept multipart/form-data. The admin order uploader is reused
   rather than duplicated — it already enforces exactly the limits the public
   Campaign Details step validates against (images 5MB, videos 50MB) and
   already handles both local disk and DigitalOcean Spaces.

   multer only touches multipart bodies: a JSON request passes straight
   through to the already-parsed req.body, so every existing caller of these
   routes is unaffected. */
const {
  adminOrderUpload,
} = require("../../Middleware/orderImageupload");

/* Agency PO document (optional, Agency accounts only) — a separate multer
   pipeline from adminOrderUpload above, see Utils/agencyPoDocumentUpload.js
   for why it can't share that one. */
const {
  agencyPoDocumentUpload,
} = require("../../Utils/agencyPoDocumentUpload");

/* A client request carries the customer's contact details, GSTIN, PAN,
   company, every campaign they booked and the full price breakdown. None of
   these routes used to ask who was calling. See clientRequestAuth.js. */
const {
  protectClient,
  protectStaff,
  allowClientOrStaff,
} = require("./clientRequestAuth");

/* =========================================================
   CLIENT ROUTES
========================================================= */

/* Customers: place a booking, list their own, read one of their own.
   The guard runs BEFORE multer so an unauthenticated upload is rejected
   without first writing its files to disk (or to Spaces). */
router.post(
  "/",
  protectClient,
  adminOrderUpload,
  createClientRequest
);

/* Registered before '/:id', or Express would read "mine" as an id. */
router.get(
  "/mine",
  protectClient,
  getMyClientRequests
);

/* Optional PO document, Agency accounts only — uploaded after the booking
   already exists rather than riding along with adminOrderUpload above (see
   Utils/agencyPoDocumentUpload.js). Both routes are ownership- and
   account-type-checked in the controller. */
router.post(
  "/:id/po-document",
  protectClient,
  agencyPoDocumentUpload,
  uploadAgencyPoDocument
);

router.delete(
  "/:id/po-document",
  protectClient,
  removeAgencyPoDocument
);

/* =========================================================
   CLIENT / STAFF SHARED TRACKING ROUTES
========================================================= */

/* Client-safe campaign tracking console payload */
router.get(
  "/:id/tracking",
  allowClientOrStaff,
  getClientRequestTracking
);

/* Lightweight live GPS lookup */
router.get(
  "/:id/live-location",
  allowClientOrStaff,
  getClientRequestLiveLocation
);

/* Day-wise driving summary */
router.get(
  "/:id/driving-summary",
  allowClientOrStaff,
  getClientRequestDrivingSummary
);

/* Vamosys public route-track / track ID */
router.get(
  "/:id/route-track",
  allowClientOrStaff,
  getClientRequestRouteTrack
);

/* Detailed Vamosys vehicle history:
   - 6 hours
   - 12 hours
   - today
   - yesterday
   - custom date/time
*/
router.get(
  "/:id/vehicle-history",
  allowClientOrStaff,
  getClientRequestVehicleHistory
);

/* =========================================================
   GET SINGLE REQUEST
========================================================= */

/* Either audience — controller restricts client to their own booking */
router.get(
  "/:id",
  allowClientOrStaff,
  getClientRequestById
);

/* =========================================================
   STAFF-ONLY ROUTES
========================================================= */

router.get(
  "/",
  protectStaff,
  getAllClientRequests
);

router.put(
  "/:id",
  protectStaff,
  adminOrderUpload,
  updateClientRequest
);

router.patch(
  "/:id/status",
  protectStaff,
  updateStatus
);

router.delete(
  "/:id",
  protectStaff,
  deleteClientRequest
);

module.exports = router;