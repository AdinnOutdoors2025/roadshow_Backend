const express = require('express');
const router = express.Router();
const promoterController = require('../../controllers/Promotercontroller/Promotercontroller');
const { protect } = require('../../Middleware/rolemiddleware');

router.get('/',protect, promoterController.getPromoters);
router.get('/allowed-states',protect, promoterController.getAllowedPromoterStates);
// Unauthenticated mirrors — the public /roadshow/campaign-details page needs
// these same charges to show a live price estimate, same as /packages/ is
// already public for the same reason. No admin-only fields are exposed.
router.get('/public/list', promoterController.getPromoters);
router.get('/public/allowed-states', promoterController.getAllowedPromoterStates);
router.get('/:id',protect, promoterController.getPromoterById);
router.post('/',protect, promoterController.addPromoter);
router.put('/:id',protect, promoterController.updatePromoter);
router.delete('/:id',protect, promoterController.deletePromoter);

module.exports = router;