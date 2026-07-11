
const mongoose = require('mongoose');
const ClientRequest = require('../../Models/ClientRequestModel/Clientrequestmodel');

async function generateclientordrId() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const prefix = `${year}${month}${day}`;

  const start = new Date(year, today.getMonth(), today.getDate());
  const end = new Date(year, today.getMonth(), today.getDate() + 1);
  const count = await ClientRequest.countDocuments({ createdAt: { $gte: start, $lt: end } });

  return `${prefix}CRO#${count + 1}`;
}

const calculateTotalDays = (fromDate, toDate) => {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  
  if (from > to) {
    throw new Error('fromDate cannot be after toDate');
  }
  
  const diffTime = Math.abs(to - from);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays === 0 ? 1 : diffDays;
};

exports.createClientRequest = async (req, res) => {
  try {
    const { name, email, phone, userId, vehicleTypes } = req.body;

    // Validation
    if (!name || !phone || !userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Required fields missing' 
      });
    }

    if (!Array.isArray(vehicleTypes) || vehicleTypes.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'vehicleTypes is required' 
      });
    }

    // Validate each vehicle type has dates and calculate total days
    const processedVehicleTypes = vehicleTypes.map((vt) => {
      if (!vt.fromDate || !vt.toDate) {
        throw new Error('Each vehicle type must have fromDate and toDate');
      }
      
      const totalDays = calculateTotalDays(vt.fromDate, vt.toDate);
      
      return {
        ...vt,
        totalDays
      };
    });

    const clientOrderId = await generateclientordrId();

    const clientRequest = await ClientRequest.create({
      clientOrderId, 
      name, 
      email, 
      phone, 
      userId, 
      vehicleTypes: processedVehicleTypes
    });

    const response = clientRequest.toObject();
    
    res.status(201).json({ 
      success: true, 
      data: response 
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Duplicate client order ID generated. Please try again.' 
      });
    }
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// Get all
exports.getAllClientRequests = async (req, res) => {
  try {
    const { status, userId, search } = req.query;
    const filter = {};
    if (status !== undefined) filter.status = Number(status);
    if (userId) filter.userId = userId;
    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [{ name: regex }, { email: regex }, { phone: regex }, { clientOrderId: regex }];
    }

    const requests = await ClientRequest.find(filter)
      .populate('userId', 'name email')
      .populate('vehicleTypes.vehicleType', 'name')
      .sort({ createdAt: -1 });
   
    const formattedRequests = requests.map(request => {
      const data = request.toObject();
      return data;
    });

    res.status(200).json({ 
      success: true, 
      data: formattedRequests,
      count: formattedRequests.length
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// Get by ID
exports.getClientRequestById = async (req, res) => {
  try {
    const request = await ClientRequest.findById(req.params.id)
      .populate('userId', 'name email')
      .populate('vehicleTypes.vehicleType', 'name');
    
    if (!request) {
      return res.status(404).json({ 
        success: false, 
        message: 'Client request not found' 
      });
    }
    
    const data = request.toObject();
    
    res.status(200).json({ 
      success: true, 
      data 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// Update
exports.updateClientRequest = async (req, res) => {
  try {
    const { vehicleTypes } = req.body;
    const updateData = { ...req.body };

    // Remove clientOrderId from update data
    if (updateData.clientOrderId) {
      delete updateData.clientOrderId;
    }

    // If vehicleTypes is being updated, recalculate totalDays for each
    if (vehicleTypes && Array.isArray(vehicleTypes)) {
      const processedVehicleTypes = vehicleTypes.map((vt) => {
        if (vt.fromDate && vt.toDate) {
          const totalDays = calculateTotalDays(vt.fromDate, vt.toDate);
          return {
            ...vt,
            totalDays
          };
        }
        return vt;
      });
      updateData.vehicleTypes = processedVehicleTypes;
    }

    const updated = await ClientRequest.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      {
        new: true,
        runValidators: true
      }
    );
    
    if (!updated) {
      return res.status(404).json({ 
        success: false, 
        message: 'Client request not found' 
      });
    }

    const response = updated.toObject();
    
    res.status(200).json({ 
      success: true, 
      data: response 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// Update status
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (![0, 1, 2].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status value' 
      });
    }

    const updated = await ClientRequest.findByIdAndUpdate(
      req.params.id, 
      { status }, 
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ 
        success: false, 
        message: 'Client request not found' 
      });
    }

    const response = updated.toObject();
    
    res.status(200).json({ 
      success: true, 
      data: response 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// Delete
exports.deleteClientRequest = async (req, res) => {
  try {
    const deleted = await ClientRequest.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ 
        success: false, 
        message: 'Client request not found' 
      });
    }
    res.status(200).json({ 
      success: true, 
      message: 'Deleted successfully' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};