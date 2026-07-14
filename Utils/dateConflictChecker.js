

const Order = require("../Models/AdminorderModel/Adminorder");
const { checkVehicleAvailability } = require("./vehicleAvailability");

async function findDateConflictsForOrder(order) {
  const conflictsByVehicleType = {};

  for (let i = 0; i < (order.bookingItems || []).length; i++) {
    const item = order.bookingItems[i];
    if (!item.vehicleType || !item.fromDate || !item.toDate) continue;

    const vehicleTypeKey = String(item.vehicleType);
    const thisFrom = new Date(item.fromDate);
    const thisTo = new Date(item.toDate);

    const overlappingOrders = await Order.find({
      _id: { $ne: order._id },
      bookingItems: {
        $elemMatch: {
          vehicleType: item.vehicleType,
          fromDate: { $lte: thisTo },
          toDate: { $gte: thisFrom },
        },
      },
   }).select(
      "orderId name companyName clientName salesHandlerName handlerName customerType createdAt bookingItems onRoadExecutionArray pipelineStatus salesPipelineStatus"
    );

  
    const currentReserved = (order.onRoadExecutionArray || [])
      .filter((e) => e.vehicleIndex === i)
      .map((e) => ({
        driverName: e.driverName,
        driverPhone: e.driverPhone,
        vehicleRegistrationNumber: e.vehicleRegistrationNumber,
        onRoadStatus: e.onRoadStatus,
        reservedAt: e.uploadedAt,
      }));

  const allEntries = [
      {
        orderObjectId: order._id,
        bookingItemId: item._id,
        orderId: order.orderId,
        name: order.name,
        companyName: order.companyName || "",
        clientName: order.clientName || "",
        handlerName: order.salesHandlerName || order.handlerName || "",
        fromDate: item.fromDate,
        toDate: item.toDate,
        quantity: item.quantity,
        createdAt: order.createdAt,
        isCurrent: true,
        reservedVehicles: currentReserved,
        isReserved: currentReserved.length > 0,
        pipelineStatus: order.pipelineStatus || "",
        salesPipelineStatus: order.salesPipelineStatus || "",
      },
    ];
    overlappingOrders.forEach((otherOrder) => {
      (otherOrder.bookingItems || []).forEach((otherItem, otherIdx) => {
        if (!otherItem.vehicleType || String(otherItem.vehicleType) !== vehicleTypeKey) return;

        const otherFrom = new Date(otherItem.fromDate);
        const otherTo = new Date(otherItem.toDate);
        const overlaps = otherFrom <= thisTo && otherTo >= thisFrom;
        if (!overlaps) return;

        const reservedVehicles = (otherOrder.onRoadExecutionArray || [])
          .filter((e) => e.vehicleIndex === otherIdx)
          .map((e) => ({
            driverName: e.driverName,
            driverPhone: e.driverPhone,
            vehicleRegistrationNumber: e.vehicleRegistrationNumber,
            onRoadStatus: e.onRoadStatus,
            reservedAt: e.uploadedAt,
          }));

        allEntries.push({
          orderObjectId: otherOrder._id,
          orderId: otherOrder.orderId,
          name: otherOrder.name,
          companyName: otherOrder.companyName || "",
          clientName: otherOrder.clientName || "",
          handlerName: otherOrder.salesHandlerName || otherOrder.handlerName || "",
          fromDate: otherItem.fromDate,
          toDate: otherItem.toDate,
          quantity: otherItem.quantity,
          createdAt: otherOrder.createdAt,
          isCurrent: false,
          reservedVehicles,
          isReserved: reservedVehicles.length > 0,
          pipelineStatus: otherOrder.pipelineStatus || "",
          salesPipelineStatus: otherOrder.salesPipelineStatus || "",
        });
      });
    });

  
    allEntries.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    allEntries.forEach((entry, idx) => {
      entry.rank = idx + 1;
    });


    if (allEntries.length > 1) {
    
      let availability = null;
      try {
        availability = await checkVehicleAvailability({
          vehicleType: item.vehicleType,
          quantity: item.quantity || 1,
          fromDate: item.fromDate,
          toDate: item.toDate,
        });
      } catch (err) {
        availability = { available: false, error: err.message };
      }

  
      const groupKey = `${vehicleTypeKey}__${i}`;

      conflictsByVehicleType[groupKey] = {
        vehicleType: item.vehicleType,
        vehicleIndex: i,
        thisOrderFromDate: item.fromDate,
        thisOrderToDate: item.toDate,
        entries: allEntries,
        availability,
      };
    }
  }

  return conflictsByVehicleType;
}

module.exports = { findDateConflictsForOrder };