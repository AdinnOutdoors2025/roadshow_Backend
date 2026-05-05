
const express = require('express');
const router = express.Router();
const packageController = require('../../controllers/PackageManagementcontroller/packagemanagement');

router.post('/add', packageController.addPackage);
router.get('/', packageController.getPackages);
router.get('/vehicle-options', packageController.getVehicleOptions); 
router.get('/check-exists', packageController.checkPackageExists);  
router.get('/:id', packageController.getPackageById);
router.put('/:id', packageController.updatePackage);
router.delete('/:id', packageController.deletePackage);
router.patch('/:id/toggle', packageController.toggleActiveStatus);

module.exports = router;