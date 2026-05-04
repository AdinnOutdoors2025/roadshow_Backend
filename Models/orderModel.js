// const mongoose = require("mongoose");

// const orderSchema = new mongoose.Schema(
//   {
//     orderId: {
//       type: String,
//       unique: true,
//     },
//       handlername: {
//       type: String,
      
//     },

//     reasonDescription: {
//   type: String,
// },
    
//     // ================= CUSTOMER DETAILS =================
//     userId: {
//       type: String,
//       required: true,
//     },

//     name: {
//       type: String,
//       required: true,
//     },

//     phone: {
//       type: String,
//       required: true,
//     },

//     email: String,

//     companyName: String,

//     designation: String,

//     // ================= BOOKING DETAILS =================
//     bookingItems: [
//       {
//         vehicleModel: String,
//         vehicleImage:String,
//         city: String,
//         quantity: Number,
//         fromDate: Date,
//         toDate: Date,
//         totalDays: Number,
//         pricePerDay: Number,
//         discountDays: Number,
//         noDiscountDays: Number,
//         discountPercentage:Number,
//         discountAmount: Number,
//         noDiscountAmount: Number,
//         actualAmount: Number,
//         totalAmount: Number,
//       },
//     ],

//     grandTotal: {
//       type: Number,
//       required: true,
//     },

//     orderStatus: {
//       type: String,
//       enum: ["Pending", "Confirmed", "Cancelled"],
//       default: "Pending",
//     },
//     // ================= SALES PIPELINE STATUS =================
//   pipelineStatus: {
//   type: String,
//   enum: [
//     "newOrder",
//     "proposal",
//     "negotiation",
//     "closedWon",
//     "closedLoss",
//   ],
//   default: "newOrder",
// },

//     pipelineLogs: [
//       {
//         fromStage: String,
//         toStage: String,
//         movedBy: String,
//         movedAt: {
//           type: Date,
//           default: Date.now,
//         },
//       },
//     ],

//     negotiationLogs: [
//   {
//     fromStage: String,
//     toStage: String,
//     movedBy: String,
//     movedAt: { type: Date, default: Date.now },
//     amount: Number,
//   },
// ],

// grandNegotiationTotal: {
//   type: Number,
//   default: null,
// },
//   },
//   { timestamps: true },
// );

// module.exports = mongoose.model("Order", orderSchema);
