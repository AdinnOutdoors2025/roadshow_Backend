
const Order = require("../../Models/orderModel");
const Cart = require("../../Models/Cartmodel/cart");
const vehicleDetails = require("../../Models/vehicleDetails");
require('dotenv').config();
const { calculateOfferDetails } = require("../../ReusableComponents/reusableOfferLogic"); // correct path போடு



exports.createOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, phone, email, companyName, designation } = req.body;

    // ── Validation ──
    if (!name || !phone) {
      return res.status(400).json({ message: "Name and Phone required" });
    }

    const phoneStr = phone.toString().trim();
    if (!/^\d{10}$/.test(phoneStr)) {
      return res.status(400).json({
        message: "Phone number must be exactly 10 digits",
      });
    }

    // ── Get Cart ──
    const cart = await Cart.findOne({ userId });

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // ── Recalculate Items ──
    const recalculatedItems = [];

    for (const item of cart.items) {
      const offerDetails = await calculateOfferDetails({
        vehicleModel: item.vehicleModel,
        fromDate: item.fromDate,
        toDate: item.toDate,
        quantity: item.quantity,
        pricePerDay: item.pricePerDay,
      });

      recalculatedItems.push({
        vehicleModel: item.vehicleModel,
        vehicleImage: item.vehicleImage,
        city: item.city,
        quantity: item.quantity,
        fromDate: item.fromDate,
        toDate: item.toDate,
        pricePerDay: item.pricePerDay,
        totalDays: offerDetails.totalDays,
        discountDays: offerDetails.discountDays,
        noDiscountDays: offerDetails.noDiscountDays,
        discountPercentage: offerDetails.discountPercentage,
        discountAmount: offerDetails.discountAmount,
        noDiscountAmount: offerDetails.noDiscountAmount,
        actualAmount: offerDetails.actualAmount,
        totalAmount: offerDetails.totalAmount,
      });
    }

    // ── Grand Total ──
    const grandTotal = recalculatedItems.reduce(
      (sum, item) => sum + item.totalAmount,
      0
    );

    // ── Order ID ──
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const datePrefix = `${year}${month}${day}`;

    const startOfDay = new Date(year, today.getMonth(), today.getDate());
    const endOfDay = new Date(year, today.getMonth(), today.getDate() + 1);

    const todayOrdersCount = await Order.countDocuments({
      createdAt: { $gte: startOfDay, $lt: endOfDay },
    });

    const orderId = `${datePrefix}UO#${todayOrdersCount + 1}`;

    // ── Create Order ──
    const order = new Order({
      orderId,
      userId,
      name,
      phone,
      email,
      companyName,
      designation,
      bookingItems: recalculatedItems,
      grandTotal,
      pipelineLogs: [
        {
          fromStage: null,
          toStage: "newOrder",
          movedBy: "System",
          movedAt: new Date(),
        },
      ],
    });

    await order.save();

    // ── Update Vehicle Availability ──
    for (const item of recalculatedItems) {
      const vehicles = await vehicleDetails
        .find({
          modelType: item.vehicleModel,
          city: item.city,
          availability: "Available",
        })
        .limit(item.quantity);

      for (const v of vehicles) {
        v.availability = "Booked";
        await v.save();
      }
    }

    // ── Clear Cart ──
    await Cart.deleteOne({ userId });

    // ── External API Call ──
    try {
      const orderDate = `${day}-${month}-${year}`;

      const subtotal = recalculatedItems.reduce(
        (sum, item) => sum + item.actualAmount,
        0
      );

      const totalDiscount = recalculatedItems.reduce(
        (sum, item) => sum + item.discountAmount,
        0
      );

      const gst = Math.round(grandTotal * 0.18);
      const totalWithGst = grandTotal + gst;

      const savedItems = order.bookingItems;

      const externalPayload = {
        mailtype: "roadshowOrder",
        orderId: orderId,
        userName: name,
        userEmail: email,
        orderDate: orderDate,
        subtotal,
        discount: totalDiscount,
        gst,
        totalAmount: totalWithGst,

        orders: savedItems.map((item) => {
          const modelWithUnderscore = item.vehicleModel.replace(/ /g, "_");

          return {
            vehicleType: item.vehicleModel,
            productId: item._id,
            vehicleCount: item.quantity,
            productImage: `${process.env.MONGODB_URI}/uploads/${modelWithUnderscore}/${item.vehicleImage}`,
            pricePerDay: String(item.pricePerDay),
            location: item.city,
            startDate: new Date(item.fromDate).toISOString().split("T")[0],
            endDate: new Date(item.toDate).toISOString().split("T")[0],
          };
        }),
      };

      console.log(" Sending Payload:", externalPayload);

      const response = await fetch(process.env.EXTERNAL_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(externalPayload),
      });

      console.log("process.env.EXTERNAL_API_URL", process.env.EXTERNAL_API_URL)

      console.log(" Status Code:", response.status);

      if (response.ok) {
        const data = await response.text(); // or .json()
        console.log(" API Success:", data);
      } else {
        const errorText = await response.text();
        console.error(" API Failed:", errorText);
      }

    } catch (error) {
      console.error(" Fetch Error:", error.message);
    }

    // ── Response ──
    return res.status(200).json({
      message: "Order created successfully",
      order,
    });

  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ================= GET ALL ORDERS =================
// All users data 

exports.getOrders = async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      total: orders.length,
      orders,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};





// Add to top of file
const NEGOTIATION_DISCOUNT = parseFloat(process.env.NEGOTIATION_DISCOUNT_PERCENT || "10");

exports.updateOrderPipeline = async (req, res) => {
  try {
    const { pipelineStatus, movedBy, handlername, reasonDescription } = req.body;
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const oldStage = order.pipelineStatus;
    order.pipelineStatus = pipelineStatus;

    if (handlername !== undefined) order.handlername = handlername;
    if (reasonDescription) order.reasonDescription = reasonDescription;

    order.pipelineLogs.push({
      fromStage: oldStage,
      toStage: pipelineStatus,
      movedBy: movedBy || "Admin",
      movedAt: new Date(),
    });

    // ── Negotiation logic ──
    // if (pipelineStatus === "negotiation") {
    //   const discountPercent = NEGOTIATION_DISCOUNT / 100;

    //   // Find last negotiation log amount (if any)
    //   const prevNegLogs = order.negotiationLogs || [];
    //   const lastNegAmount =
    //     prevNegLogs.length > 0
    //       ? prevNegLogs[prevNegLogs.length - 1].amount
    //       : null;

    //   const baseAmount = lastNegAmount !== null ? lastNegAmount : order.grandTotal;
    //   const negotiatedAmount = Math.round(baseAmount * (1 - discountPercent));

    //   order.negotiationLogs.push({
    //     fromStage: oldStage,
    //     toStage: pipelineStatus,
    //     movedBy: movedBy || "Admin",
    //     movedAt: new Date(),
    //     amount: negotiatedAmount,
    //   });

    //   order.grandNegotiationTotal = negotiatedAmount;
    // }

    if (pipelineStatus === "negotiation") {
      const discountPercent = NEGOTIATION_DISCOUNT / 100;

      // ✅ Correct base amount
      const baseAmount =
        order.grandNegotiationTotal && order.grandNegotiationTotal > 0
          ? order.grandNegotiationTotal
          : order.grandTotal;

      //  Discount 
      const discountAmount = Math.round(baseAmount * discountPercent);

      //  Remaining amount
      const remainingAmount = baseAmount - discountAmount;

      //  Log (discount only)
      order.negotiationLogs.push({
        fromStage: oldStage,
        toStage: pipelineStatus,
        movedBy: movedBy || "Admin",
        movedAt: new Date(),
        amount: discountAmount,
      });

      //  Save remaining
      order.grandNegotiationTotal = remainingAmount;
    }

    await order.save();
    return res.status(200).json({ message: "Pipeline updated successfully", order });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};