const axios = require("axios"); 
const Order = require("../../Models/AdminorderModel/Adminorder");



exports.addDriverLocation = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { vehicleRegistrationNumber, latitude, longitude, updatedBy } = req.body;

    // Reverse geocode
    let address = "";
    try {
      const geoRes = await axios.get("https://nominatim.openstreetmap.org/reverse", {
        params: { lat: latitude, lon: longitude, format: "json" },
      
      });
      address = geoRes.data?.display_name || "";
    } catch (e) {
      console.error("Geocode error:", e.message);
    }

   
    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      {
        $push: {
          driverLocationArray: {
            vehicleRegistrationNumber,
            latitude,
            longitude,
            address,
            updatedBy: updatedBy || "",
            updatedAt: new Date(), 
          },
        },
      },
      { new: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.status(200).json({
      message: "Driver location updated successfully",
      location: updatedOrder.driverLocationArray.at(-1), 
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
};


exports.getDriverLocationsByOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId).select("driverLocationArray");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }


    const grouped = {};

    order.driverLocationArray.forEach((loc) => {
      const regNo = loc.vehicleRegistrationNumber;
      if (!grouped[regNo]) {
        grouped[regNo] = [];
      }
      grouped[regNo].push(loc);
    });

    return res.status(200).json({
      message: "Driver locations fetched successfully",
      data: grouped,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
};