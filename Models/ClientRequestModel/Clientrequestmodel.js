

const mongoose = require('mongoose');


const vehicleTypeQuantitySchema = new mongoose.Schema({
  vehicleType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VehicleType',  
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  fromDate: {
    type: Date,
    required: true
  },
  toDate: {
    type: Date,
    required: true
  },
  totalDays: {
    type: Number,
    default: 0
  }
}, { _id: false });

const clientRequestSchema = new mongoose.Schema({
  clientOrderId: {
    type: String,
    unique: true,
    required: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: false,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        if (!v) return true;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: props => `${props.value} is not a valid email address!`
    }
  },
  phone: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(v) {
        const cleanPhone = v.replace(/\D/g, '');
        return cleanPhone.length === 10;
      },
      message: props => `${props.value} is not a valid 10-digit phone number!`
    }
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  vehicleTypes: {
    type: [vehicleTypeQuantitySchema],
    required: true,
    validate: {
      validator: (arr) => Array.isArray(arr) && arr.length > 0,
      message: 'At least one vehicle type is required'
    }
  },
  status: {
    type: Number,
    enum: [0, 1, 2], // 0 - todo, 1 - inprogress, 2 - completed
    default: 0
  }
}, { timestamps: true });

module.exports = mongoose.model('ClientRequestOrder', clientRequestSchema);