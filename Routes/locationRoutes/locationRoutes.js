// routes/locationRoutes.js
const express = require('express');
const router = express.Router();
const locationController = require('../../controllers/locationController/locationController');

router.get('/', locationController.getAllLocations);      
router.get('/states', locationController.getStates);      
router.get('/:state/cities', locationController.getCitiesByState); 
router.post('/:state/cities', locationController.addCityToState); 

module.exports = router;