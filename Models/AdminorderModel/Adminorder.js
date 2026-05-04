
const mongoose = require("mongoose");

const bookingItemSchema = new mongoose.Schema({
 
  packageId: { type: mongoose.Schema.Types.ObjectId, ref: "Package" },
  vehicleType: String,
  vehicleModel: String,
  vehicleImage: String,
  bookingFor: String,
  campaignType: String,
  otherCampaignType: String,
  fromDate: Date,
  toDate: Date,
  totalDays: Number,
  state: String,
  city: String,
  fromLocation: String,
  toLocation: String,
  quantity: Number,
  needPromoter: { type: Boolean, default: false },
  promoterType: String,
  otherPromoterType: String,
 campaignImages: [String],
  campaignVideos: [String],


  perDayRentalCost:      Number,
  driverCharges:         Number,
  promoterChargePerDay:  Number,
  rtoCharges:            Number,
  additionalHourCharges: Number,
  dailyKmLimit:          Number,
  pricePerDay:           Number,    
  rentalCost:            Number,
  driverCost:            Number,
  promoterCost:          Number,
  rtoCost:               Number,
  subtotal:              Number,
  gstAmount:             Number,
  totalAmount:           Number,


  // discountDays:          Number,
  // noDiscountDays:        Number,
  // discountPercentage:    Number,
  // discountAmount:        Number,
  // noDiscountAmount:      Number,
  // actualAmount:          Number,
});

const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, unique: true },

  
    userId:     { type: String, required: true },  
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, 
    name:       { type: String, required: true },
    phone:      { type: String, required: true },
    address:    String,
    email:      String,
    companyName: String,
    designation: String,

   
    isAdminCreated: { type: Boolean, default: false },
    bookingItems: [bookingItemSchema],

    grandTotal: { type: Number, required: true },

    orderStatus: {
      type: String,
      enum: ["Pending", "Confirmed", "Cancelled"],
      default: "Pending",
    },

  
    pipelineStatus: {
      type: String,
      enum: ["newOrder", "proposal", "negotiation", "closedWon", "closedLoss"],
      default: "newOrder",
    },

    handlername:       String,
    reasonDescription: String,

    pipelineLogs: [
      {
        fromStage: String,
        toStage:   String,
        movedBy:   String,
        movedAt:   { type: Date, default: Date.now },
      },
    ],

    negotiationLogs: [
      {
        fromStage: String,
        toStage:   String,
        movedBy:   String,
        movedAt:   { type: Date, default: Date.now },
        amount:    Number,
      },
    ],

    grandNegotiationTotal: { type: Number, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);