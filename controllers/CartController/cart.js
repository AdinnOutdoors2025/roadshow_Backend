const Cart = require("../../Models/Cartmodel/cart");

const vehicleDetails = require("../../Models/vehicleDetails");

const { calculateOfferDetails } = require("../../ReusableComponents/reusableOfferLogic");
const VehicleModel = require("../../Models/VehicleModel");


// ================= ADD TO CART =================

exports.addToCart = async (req, res) => {
  try {
    const {vehicleModel, city, quantity, fromDate, toDate } = req.body;

      const userId = req.user._id;

  

    if (!vehicleModel || !city || !quantity || !fromDate || !toDate) {
      return res.status(400).json({ message: "All fields required" });
    }

    if (quantity <= 0) {
      return res.status(400).json({ message: "Quantity must be greater than 0" });
    }

    const start = new Date(fromDate);
    const end = new Date(toDate);

    if (end < start) {
      return res.status(400).json({ message: "Invalid date range" });
      
    }

  const modelExists = await VehicleModel.findOne({ modelName: vehicleModel });
    if (!modelExists) {
      return res.status(404).json({ 
        message: `"${vehicleModel}" model is not available` 
      });
    }


    const vehicleData = await vehicleDetails.findOne({
      model: vehicleModel,
      city: city,
    });



    if (!vehicleData) {
      return res.status(404).json({ message: "Vehicle not found" });
    }

    const pricePerDay = Number(vehicleData.basePrice);
    const vehicleImage = vehicleData.mainImage?.[0] || "";

    let cart = await Cart.findOne({ userId });

    if (!cart) {
      cart = new Cart({ userId, items: [], grandTotal: 0 });
    }

    const existingItemIndex = cart.items.findIndex(
      (item) => item.vehicleModel === vehicleModel && item.city === city
    );



    if (existingItemIndex !== -1) {
      // ── Quantity add panni recalculate ───
      const existingItem = cart.items[existingItemIndex];
      const newQuantity = existingItem.quantity + quantity;

      // ── Reusable function call with updated quantity ───
      const offerDetails = await calculateOfferDetails({
        vehicleModel,
        fromDate: start,
        toDate: end,
        quantity: newQuantity,
        pricePerDay,
      });

      existingItem.vehicleImage = vehicleImage;
      existingItem.quantity = newQuantity;
      existingItem.fromDate = start;
      existingItem.toDate = end;
      existingItem.pricePerDay = pricePerDay;
      existingItem.totalDays = offerDetails.totalDays;
      existingItem.discountDays = offerDetails.discountDays;
      existingItem.noDiscountDays = offerDetails.noDiscountDays;
      existingItem.discountPercentage = offerDetails.discountPercentage;
      existingItem.discountAmount = offerDetails.discountAmount;
      existingItem.noDiscountAmount = offerDetails.noDiscountAmount;
      existingItem.actualAmount = offerDetails.actualAmount;
      existingItem.totalAmount = offerDetails.totalAmount;
    } else {
      // ── New item — reusable function call ───
      const offerDetails = await calculateOfferDetails({
        vehicleModel,
        fromDate: start,
        toDate: end,
        quantity,
        pricePerDay,
      });

      cart.items.push({
        vehicleModel,
        city,
        vehicleImage,
        quantity,
        fromDate: start,
        toDate: end,
        pricePerDay,
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

    cart.grandTotal = cart.items.reduce((sum, item) => sum + item.totalAmount, 0);

    await cart.save();

    res.status(200).json({
      message: "Added to cart successfully",
      cart,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};




exports.getCart = async (req, res) => {
  try {
    const userId = req.user._id;

    const cart = await Cart.findOne({ userId });

    if (!cart || cart.items.length === 0) {
      return res.status(404).json({ message: "Cart is empty" });
    }

    // ── Live offer check — recalculate every item with latest offer % ───
    let recalculated = false;

    for (let i = 0; i < cart.items.length; i++) {
      const item = cart.items[i];

      const offerDetails = await calculateOfferDetails({
        vehicleModel: item.vehicleModel,
        fromDate: item.fromDate,
        toDate: item.toDate,
        quantity: item.quantity,
        pricePerDay: item.pricePerDay,
      });

      // ── If offer percentage changed — update ───
      if (offerDetails.discountPercentage !== item.discountPercentage) {
        item.discountDays = offerDetails.discountDays;
        item.noDiscountDays = offerDetails.noDiscountDays;
        item.discountPercentage = offerDetails.discountPercentage;
        item.discountAmount = offerDetails.discountAmount;
        item.noDiscountAmount = offerDetails.noDiscountAmount;
        item.actualAmount = offerDetails.actualAmount;
        item.totalAmount = offerDetails.totalAmount;
        recalculated = true;
      }
    }

    if (recalculated) {
      cart.grandTotal = cart.items.reduce((sum, item) => sum + item.totalAmount, 0);
      await cart.save();
    }

    res.status(200).json({
      message: "Cart fetched successfully",
      userId: cart.userId,
      totalItems: cart.items.length,
      grandTotal: cart.grandTotal,
      items: cart.items,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};