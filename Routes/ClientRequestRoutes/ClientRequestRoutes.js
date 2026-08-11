const express = require('express');
const router = express.Router();
const {
  createClientRequest,
  getAllClientRequests,
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

router.post('/', adminOrderUpload, createClientRequest);
router.get('/',  getAllClientRequests);
router.get('/:id',  getClientRequestById);
router.put('/:id', adminOrderUpload, updateClientRequest);
router.patch('/:id/status',  updateStatus);
router.delete('/:id',  deleteClientRequest);

module.exports = router;
