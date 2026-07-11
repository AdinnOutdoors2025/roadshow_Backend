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


router.post('/',  createClientRequest);
router.get('/',  getAllClientRequests);
router.get('/:id',  getClientRequestById);
router.put('/:id',  updateClientRequest);
router.patch('/:id/status',  updateStatus);
router.delete('/:id',  deleteClientRequest);

module.exports = router;