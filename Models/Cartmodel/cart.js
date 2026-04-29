
const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema({

    
  //    vehicleId: {
  //  type: mongoose.Schema.Types.ObjectId,
  //     required: true,
    
  //   },

  vehicleModel: {
    type: String,
    required: true,
  },

  city: {
    type: String,
    required: true,
  },

    vehicleImage: { type: String, default: "" },

  quantity: {
    type: Number,
    required: true,
  },

  fromDate: {
    type: Date,
    required: true,
  },

  toDate: {
    type: Date,
    required: true,
  },

  totalDays: {
    type: Number,
    required: true,
  },

  pricePerDay: {
    type: Number,
    required: true,
  },

  discountDays: {
    type: Number,
    default: 0,
  },

  noDiscountDays: {
    type: Number,
    default: 0,
  },

  discountPercentage: {
    type: Number,
    default: 0,
  },

  discountAmount: {
    type: Number,
    default: 0,
  },

  noDiscountAmount: {
    type: Number,
    default: 0,
  },

  actualAmount: {
  type: Number,
  default: 0,
},

  totalAmount: {
    type: Number,
    required: true,
  },
});

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
    },

    items: [cartItemSchema],

    grandTotal: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Cart", cartSchema);