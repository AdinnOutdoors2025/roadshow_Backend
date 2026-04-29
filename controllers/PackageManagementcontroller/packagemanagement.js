const Package = require('../../Models/PackageManagementModel/packagemanagement');


exports.addPackage = async (req, res) => {
  try {
    const newPackage = new Package(req.body);
    await newPackage.save();
    res.status(201).json({ message: 'Package created successfully', data: newPackage });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};


exports.getPackages = async (req, res) => {
  try {
    const packages = await Package.find();
    res.status(200).json(packages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.getPackageById = async (req, res) => {
  try {
    const pkg = await Package.findById(req.params.id);
    if (!pkg) return res.status(404).json({ message: 'Package not found' });
    res.status(200).json(pkg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.updatePackage = async (req, res) => {
  try {
    const pkg = await Package.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!pkg) return res.status(404).json({ message: 'Package not found' });
    res.status(200).json({ message: 'Package updated successfully', data: pkg });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};


exports.deletePackage = async (req, res) => {
  try {
    const pkg = await Package.findByIdAndDelete(req.params.id);
    if (!pkg) return res.status(404).json({ message: 'Package not found' });
    res.status(200).json({ message: 'Package deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.toggleActiveStatus = async (req, res) => {
  try {
    const pkg = await Package.findById(req.params.id);
    if (!pkg) return res.status(404).json({ message: 'Package not found' });
    pkg.isActive = !pkg.isActive;
    await pkg.save();
    res.status(200).json({ message: `Package ${pkg.isActive ? 'Activated' : 'Deactivated'}`, data: pkg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
