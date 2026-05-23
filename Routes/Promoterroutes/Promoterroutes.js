const express = require('express');
const router = express.Router();
const promoterController = require('../../controllers/Promotercontroller/Promotercontroller');
const { protect } = require('../../Middleware/rolemiddleware');

router.get('/',protect, promoterController.getPromoters);
router.get('/:id',protect, promoterController.getPromoterById);
router.post('/',protect, promoterController.addPromoter);
router.put('/:id',protect, promoterController.updatePromoter);
router.delete('/:id',protect, promoterController.deletePromoter);
router.patch('/:id/toggle',protect, promoterController.togglePromoterStatus);

module.exports = router;