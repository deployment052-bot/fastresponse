const mongoose= require('mongoose')
const Work = require("../model/work");
const User = require("../model/user");
const Booking=require("../model/BookOrder")
const AdminNotification=require('../model/adminnotification')
const { sendNotification } = require("../controllers/helpercontroller");
const Newsletter = require("../model/sub");
const axios = require("axios");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const nodemailer = require("nodemailer");
const sendemail=require('../utils/sendemail')
const { uploadToCloudinary } = require("../utils/cloudinaryUpload");
const generateToken = (id) => {
  return `REQ-${new Date().getFullYear()}-${String(id).padStart(5, '0')}`;
};




// Parse date from DD/MM/YYYY or DD-MM-YYYY to JS Date object
function parseClientDate(input) {
  if (!input) return null;
  input = input.replace(/\//g, "-");
  const [d, m, y] = input.split("-");
  if (!d || !m || !y) return null;

  const day = d.padStart(2, "0");
  const month = m.padStart(2, "0");
  const year = y;

  const isoDate = `${year}-${month}-${day}`;
  const objectDate = new Date(isoDate);

  if (isNaN(objectDate.getTime())) return null;

  return {
    iso: isoDate,
    formatted: `${day}-${month}-${year}`,
    objectDate,
  };
}

// Reverse geocoding
async function getAddressFromCoordinates(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
    const response = await axios.get(url, {
      timeout: 3000, // 🔥 IMPORTANT
      headers: { "User-Agent": "MyApp/1.0" },
    });
    return response.data.display_name || null;
  } catch (err) {
    return null; // silent fail
  }
}

exports.createWork = async (req, res) => {
  try {
    const {
      serviceType,
      specialization,
      description,
      serviceCharge,
      technicianId,
      lat,
      lng,
      date
    } = req.body;

    const clientId = req.user._id;

    if (!serviceType || !specialization) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (lat == null || lng == null) {
      return res.status(400).json({ message: "Coordinates are required" });
    }

    const client = await User.findById(clientId);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    
    const specs = Array.isArray(specialization)
      ? specialization.map(s => s.trim().toLowerCase())
      : specialization.split(",").map(s => s.trim().toLowerCase());

   
    const parsedDate = date ? parseClientDate(date) : null;
    if (date && !parsedDate) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    if (parsedDate) {
      parsedDate.objectDate.setHours(0, 0, 0, 0);
    }

   
    const locationName = await getAddressFromCoordinates(lat, lng);
    const finalLocation = locationName ? locationName.toLowerCase() : "unknown";

   
    const technicians = await User.find({
      role: "technician",
      specialization: { $in: specs }
    });

    if (technicians.length === 0) {
      return res.status(404).json({
        message: "No technician available for the selected specialization"
      });
    }


    let bookedTechIds = [];

    if (parsedDate) {
      const dayStart = new Date(parsedDate.objectDate);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(parsedDate.objectDate);
      dayEnd.setHours(23, 59, 59, 999);


      const bookedWorks = await Work.find({
        date: { $gte: dayStart, $lte: dayEnd },
        assignedTechnician: { $ne: null },
        status: { $in: ["open", "approved", "on_the_way", "inprogress"] }
      }).select("assignedTechnician");

   
      const bookedBookings = await Booking.find({
        date: { $gte: dayStart, $lte: dayEnd },
        status: { $in: ["Requested", "approved", "on_the_way", "inprogress"] }
      }).select("technician");

      bookedTechIds = [
        ...bookedWorks.map(w => w.assignedTechnician.toString()),
        ...bookedBookings.map(b => b.technician.toString())
      ];
    }


    const R = 6371;
    const matchingTechnicians = [];

    for (const tech of technicians) {
      if (!tech.coordinates?.lat || !tech.coordinates?.lng) continue;


      if (bookedTechIds.includes(tech._id.toString())) continue;

      const dLat = ((tech.coordinates.lat - lat) * Math.PI) / 180;
      const dLng = ((tech.coordinates.lng - lng) * Math.PI) / 180;

      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat * Math.PI) / 180) *
          Math.cos((tech.coordinates.lat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;

      const distance = R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));

      if (distance <= 70) {
        matchingTechnicians.push({
          ...tech.toObject(),
          distanceInKm: distance.toFixed(2),
          bookedBookings:"approved",
          employeeStatus: "available"
        });
      }
    }

    if (matchingTechnicians.length === 0) {
      return res.status(404).json({
        message: "No technician available for this location"
      });
    }


    let assignedTech = null;

    if (technicianId && mongoose.Types.ObjectId.isValid(technicianId)) {
      const selectedTech = matchingTechnicians.find(
        t => t._id.toString() === technicianId
      );

      if (!selectedTech) {
        return res.status(400).json({
          message: "Selected technician is already booked for this date"
        });
      }

      assignedTech = technicianId;
    }

    
    const work = await Work.create({
      client: clientId,
      serviceType,
      specialization: specs,
      description,
      serviceCharge: serviceCharge || 0,
      location: finalLocation,
      coordinates: { lat, lng },
      assignedTechnician: assignedTech,
      status: "open",
      token: `REQ-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
      date: parsedDate ? parsedDate.objectDate : null,
      formattedDate: parsedDate ? parsedDate.formatted : null
    });

    res.status(201).json({
      message: "Work request submitted successfully",
      work,
      matchingTechnicians
    });

  } catch (err) {
    console.error("Work Creation Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};




exports.bookTechnician = async (req, res) => {
  try {
    const {
      workId,
      technicianId,
      lat,
      lng,
      date,
      time,
      serviceType,
      serviceCharge,
      description,
    } = req.body;

    const userId = req.user._id;

    
    if (!mongoose.Types.ObjectId.isValid(workId))
      return res.status(400).json({ message: "Invalid Work ID" });

    if (!mongoose.Types.ObjectId.isValid(technicianId))
      return res.status(400).json({ message: "Invalid Technician ID" });

    if (lat == null || lng == null)
      return res.status(400).json({ message: "Coordinates required" });

    if (!date || !time)
      return res.status(400).json({ message: "Date and time are required" });

    const parsedDate = parseClientDate(date);
    if (!parsedDate)
      return res.status(400).json({ message: "Invalid date format (DD-MM-YYYY)" });

 
    parsedDate.objectDate.setHours(0, 0, 0, 0);

 
    const timeConflict = await Booking.findOne({
      technician: technicianId,
      date: parsedDate.objectDate,
      formattedTime: time,
      status: { $in: ["Requested", "approved", "on_the_way", "inprogress"] }
    });

    if (timeConflict) {
      return res.status(400).json({
        message: `Technician already booked on ${parsedDate.formatted} at ${time}`
      });
    }

    const lockedWork = await Work.findOneAndUpdate(
      {
        _id: workId,
        assignedTechnician: { $in: [null, undefined] }
      },
      {
        assignedTechnician: technicianId,
        status: "approved"
      },
      { new: true }
    );

    if (!lockedWork) {
      return res.status(400).json({
        message: "This work has already been booked"
      });
    }

    const [client, technician] = await Promise.all([
      User.findById(userId).select("firstName address"),
      User.findById(technicianId).select("firstName")
    ]);

    if (!client)
      return res.status(404).json({ message: "Client not found" });

    if (!technician)
      return res.status(404).json({ message: "Technician not found" });

    const existingBooking = await Booking.findOne({
      user: userId,
      technician: technicianId,
      serviceType,
      status: { $in: ["Requested", "approved", "on_the_way", "inprogress"] }
    });

    if (existingBooking) {
      return res.status(400).json({
        message: `You already have an active booking with ${technician.firstName}`,
        bookingId: existingBooking._id
      });
    }

    const booking = await Booking.create({
      user: userId,
      technician: technicianId,
      serviceType,
      serviceCharge: Number(serviceCharge || 0),
      description,
      location: "",
      coordinates: { lat, lng },
      address: client.address || "Not available",
      date: parsedDate.objectDate,
      formattedDate: parsedDate.formatted,
      formattedTime: time,
      status: "open"
    });

    res.status(201).json({
      message: "Technician booked successfully",
      booking,
      work: lockedWork
    });

 
    getAddressFromCoordinates(lat, lng).then(address => {
      if (address) {
        Booking.updateOne(
          { _id: booking._id },
          { location: address.toLowerCase() }
        ).exec();

        Work.updateOne(
          { _id: workId },
          { location: address.toLowerCase() }
        ).exec();
      }
    });

    sendNotification(
      technicianId,
      "technician",
      "New Work Assigned",
      `You have received a new work request from ${client.firstName}`,
      "new_work",
      `work-${lockedWork.token}`
    );

    sendNotification(
      userId,
      "client",
      "Requested",
      `Your technician ${technician.firstName} has been booked successfully`,
      "Requested",
      `work-${lockedWork.token}`
    );

  } catch (err) {
    console.error("Book Technician Error:", err);
    return res.status(500).json({
      message: "Server error while booking technician"
    });
  }
};




exports.WorkStart = async (req, res) => {
  try {
    const { workId } = req.body;
    const technicianId = req.user._id;
    const beforePhoto = req.file;
    if (!workId) {
      return res.status(400).json({ message: "Work ID is required" });
    }
     const gettoken=await Work.findById(workId).select("token")

    const work = await Work.findById(workId);
    if (!work) {
      return res.status(404).json({ message: "Work not found" });
    }

    if (String(work.assignedTechnician) !== String(technicianId)) {
      return res.status(403).json({ message: "You are not assigned to this work" });
    }

   
    let beforePhotoUrl = "";
    if (beforePhoto) {
      // 📤 Cloudinary upload
      const uploadRes = await uploadToCloudinary(beforePhoto.path, "work_before_photos");
      beforePhotoUrl = uploadRes.secure_url;

      // OR if local:
      // beforePhotoUrl = `/uploads/${beforePhoto.filename}`;
    }

    // ✅ Update work status and save photo
    work.status = "inprogress";
    work.startedAt = new Date();
    work.beforephoto = beforePhotoUrl; // ✅ Save to DB
    await work.save();

    // ✅ Update technician’s personal status
    await User.findByIdAndUpdate(technicianId, {
      technicianStatus: "inprogress",
      onDuty: true,
      availability: false,
    });
// await sendNotification(
//   technicianId,
//   "technician",
//   "Job Status Updated",
//   `You have started work (${work.serviceType}).`,
//   "info",
//   `/technician/work/${work._id}`
// );

// await sendNotification(
//   work.client,
//   "client",
//   "Work In Progress",
//   `Your job (${work.serviceType}) has been marked as in-progress.`,
//   "info",
//   `/client/work/${work._id}`
// );

    // ✅ Update related booking if any
    await Booking.findOneAndUpdate(
      { technician: technicianId, user: work.client, status: { $in: ["open", "taken", "dispatch"] } },
      { status: "inprogress" }
    );
    await sendNotification(
  work.client._id, 
  "client", 
  "Work Started", 
  `Technician has started your work: ${work.serviceType}`,
  "work_started",
  `work${gettoken.token}`
);
    res.status(200).json({
      message: "Technician started the work. Status set to in-progress.",
      work,
      beforePhoto: beforePhotoUrl,
    });
  } catch (err) {
    console.error("❌ Work Start Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};






exports.updateLocation = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const technicianId = req.user._id;

    if (!lat || !lng)
      return res.status(400).json({ message: "Latitude and longitude required" });

    // 🔍 Find active approved work
    const work = await Work.findOne({
      assignedTechnician: technicianId,
      status: { $in: ["approved", "taken", "dispatch", "inprogress"] },
    }).populate("client", "name phone email coordinates serviceType");

    if (!work) {
      return res.status(403).json({
        message: "You cannot update location until the work is approved.",
      });
    }

    // ✅ Proceed with location update
    const technician = await User.findByIdAndUpdate(
      technicianId,
      {
        coordinates: { lat, lng },
        lastLocationUpdate: new Date(),
        onDuty: true,
      },
      { new: true }
    );

    if (work.status === "approved") {
      work.status = "dispatch";
      await work.save();
    }

 
    if (global.io) {
      global.io.emit(`track-${technicianId}`, {
        lat,
        lng,
        time: Date.now(),
        workId: work._id,
      });
    }
 await sendNotification(
  work.client._id,
  "client",
  "Technician on the way",
  `Technician has started your work: ${work.serviceType}`,
  "technician_on_the_way",
  `work${work.token}`
);
await sendNotification(
  work.assignedTechnician,
  "technician",
  "Job Started",
  `You have started: ${work.serviceType}`,
  "technician_on_the_way",
  `work${work.token}`
);
    res.status(200).json({
      message: "Technician location updated and status set to 'dispatch'.",
      workStatus: work.status,
    });

  } catch (err) {
    console.error("Update Location Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


exports.trackTechnician = async (req, res) => {
  try {
    const { workId } = req.params;
    const work = await Work.findById(workId).populate("assignedTechnician");

    if (!work || !work.assignedTechnician) {
      return res.status(404).json({ message: "Technician not assigned yet" });
    }

    const technician = work.assignedTechnician;
    const client = await User.findById(work.client);


    const clientLat = work.coordinates?.lat || client.coordinates?.lat;
    const clientLng = work.coordinates?.lng || client.coordinates?.lng;

    if (
      !technician.coordinates?.lat ||
      !technician.coordinates?.lng ||
      !clientLat ||
      !clientLng
    ) {
      return res.status(400).json({
        message: "Missing coordinates for route calculation",
      });
    }

    const googleKey = process.env.GOOGLE_MAPS_API_KEY;
    const origin = `${technician.coordinates.lat},${technician.coordinates.lng}`;
    const destination = `${clientLat},${clientLng}`;

    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=driving&alternatives=true&key=${googleKey}`;

    const response = await axios.get(url);
    const data = response.data;

    if (data.status !== "OK") {
      return res.status(400).json({
        message: `Google Directions API error: ${data.status}`,
      });
    }

 
    const selectedRouteIndex = work.selectedRouteIndex ?? 0;

    const route = data.routes[selectedRouteIndex];
    const leg = route.legs[0];

    const etaSeconds = leg.duration.value;
    const distanceText = leg.distance.text;
    const minutes = Math.round(etaSeconds / 60);

    res.status(200).json({
      technician: {
        name: technician.name,
        coordinates: technician.coordinates,
        lastUpdate: technician.lastLocationUpdate,
        liveStatus: work.status,
      },
      client: {
        name: client.name,
        coordinates: { lat: clientLat, lng: clientLng },
      },

      eta: `${minutes} minutes`,
      distance: distanceText,


      polyline: route.overview_polyline.points,

      allRoutes: data.routes.map((r, i) => ({
        index: i,
        summary: r.summary,
        distance: r.legs[0].distance.text,
        duration: r.legs[0].duration.text,
      })),
    });

  } catch (err) {
    console.error("Track Technician Error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};



exports.getClientWorkStatus = async (req, res) => {
  try {
    const { workId } = req.params;
    const clientId = req.user._id;

    const work = await Work.findById(workId)
      .populate("assignedTechnician", "firstName lastName phone email technicianStatus coordinates lastLocationUpdate")
      .populate("client", "firstName lastName phone email")
      .populate("billId"); // Populate billId so we can read UPI link

    if (!work) return res.status(404).json({ message: "Work not found" });
    if (String(work.client._id) !== String(clientId)) {
      return res.status(403).json({ message: "Not authorized to view this work" });
    }

    const technician = work.assignedTechnician;
    let eta = "ETA not available";

    if (technician?.coordinates?.lat && technician?.coordinates?.lng &&
        work.coordinates?.lat && work.coordinates?.lng) {
      try {
        const orsKey = process.env.ORS_KEY;
        const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${orsKey}&start=${technician.coordinates.lng},${technician.coordinates.lat}&end=${work.coordinates.lng},${work.coordinates.lat}`;
        const response = await axios.get(url);
        const seconds = response.data.features[0].properties.summary.duration;
        const minutes = Math.round(seconds / 60);
        eta = `${minutes} minutes`;
      } catch (err) {
        console.log("ETA calc failed:", err.message);
      }
    }

    const workStatus = {
      workId: work._id,
      token: work.token,
      serviceType: work.serviceType,
      specialization: work.specialization,
      serviceCharge: work.serviceCharge,
      totalAmount: work.totalAmount,
      description: work.description,
      location: work.location,
      status: work.status,
      createdAt: work.createdAt,
      startedAt: work.startedAt,
      completedAt: work.completedAt,
      afterPhoto: work.afterphoto,
      client: {
        name: work.client.name,
        phone: work.client.phone,
        email: work.client.email,
      },
      technician: technician ? {
        name: technician.firstName,
        phone: technician.phone,
        email: technician.email,
        status: technician.technicianStatus,
        coordinates: technician.coordinates,
        lastUpdate: technician.lastLocationUpdate,
      } : null,
      eta,
      payment: work.billId ? {
        upiUri: work.billId.upiUri || null,
        clickableUPI: work.billId.clickableUPI || null,
        qrImage: work.billId.qrImage || null,
        expiresAt: work.billId.expiresAt || null
      } : null
    };

    return res.status(200).json({
      message: "Work status fetched successfully",
      workStatus
    });

  } catch (err) {
    console.error("Client Work Status Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
exports.reportWorkIssue = async (req, res) => {
  try {
    const { workId, issueType, remarks } = req.body;
    const technicianId = req.user._id;

    if (!workId || !issueType) {
      return res.status(400).json({ message: "Work ID and issue type required" });
    }

    const work = await Work.findById(workId).populate("client");
    if (!work) return res.status(404).json({ message: "Work not found" });

    if (String(work.assignedTechnician) !== String(technicianId)) {
      return res.status(403).json({ message: "You are not assigned to this work" });
    }

 
    switch (issueType) {
      case "need_parts":
        work.status = "onhold_parts";
        work.remarks = remarks || "Parts required for repair";
        await work.save();

        console.log(`Parts required for Work ID: ${workId}`);
        break;

      case "need_specialist":
        work.status = "escalated";
        work.remarks = remarks || "Requires senior technician";
        await work.save();

        console.log(`Escalated to supervisor for Work ID: ${workId}`);
        break;

      case "customer_unavailable":
        work.status = "rescheduled";
        work.remarks = remarks || "Customer not available at site";
        await work.save();

        console.log(`Work rescheduled due to customer unavailability`);
        break;

      default:
        return res.status(400).json({ message: "Invalid issue type" });
    }

    
    try {
      await AdminNotification.create({
        type: "work_issue",
        message: `Technician ${req.user.name || technicianId} reported an issue (${issueType}) for work ${work._id}`,
        work: work._id,
        technician: technicianId,
        issueType,
        remarks: remarks || ""
      });
      console.log(`✅ Admin notified about issue ${issueType} for Work ${workId}`);
    } catch (notifErr) {
      console.error("❌ Admin notification creation failed:", notifErr.message);
    }

    
    await Booking.findOneAndUpdate(
      { technician: technicianId, user: work.client._id },
      { status: work.status }
    );

    await User.findByIdAndUpdate(technicianId, {
      technicianStatus: "pending",
      availability: true
    });


    return res.status(200).json({
      message: "Work issue reported successfully.",
      workStatus: work.status,
      remarks: work.remarks
    });

  } catch (err) {
    console.error("Report Work Issue Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
 



exports.getAdminNotifications = async (req, res) => {
  
  try {
    const notifications = await AdminNotification.find()
      .sort({ createdAt: -1 })
      .populate("work", "serviceType status location")
      .populate("technician", "name email phone");

    if (!notifications.length) {
      return res.status(200).json({ message: "No notifications found", notifications: [] });
    }

    res.status(200).json({
      message: "Admin notifications fetched successfully",
      count: notifications.length,
      notifications
    });
  } catch (err) {
    console.error("Get Admin Notifications Error:", err.message);
    res.status(500).json({ message: "Server error while fetching notifications" });
  }
};



exports.payBill = async (req, res) => {
  try {
    const { workId, paymentMethod, paymentStatus } = req.body; // paymentMethod = "cash" | "upi"
    const clientId = req.user._id;

    const work = await Work.findById(workId).populate("client");
    if (!work) return res.status(404).json({ message: "Work not found" });

    if (String(work.client._id) !== String(clientId))
      return res.status(403).json({ message: "Unauthorized" });

    if (work.status !== "completed")
      return res.status(400).json({ message: "Work not completed yet" });

    // ✅ Update payment info
    work.payment = {
      method: paymentMethod,
      status: paymentStatus || "pending",
      paidAt: new Date(),
    };
    await work.save();
// await sendNotification(
//   work.client,
//   "client",
//   "Payment Successful",
//   `Payment received for work ID: ${work._id}`,
//   "success",
//   `/client/work/${work._id}`
// );

    
    await sendemail(
      work.client.email,
      `Payment Confirmation - ${work.invoice.invoiceNumber}`,
      `<p>Hello ${work.client.firstName},</p>
       <p>We’ve received your payment of ₹${work.invoice.total.toFixed(2)} via ${paymentMethod.toUpperCase()}.</p>
       <p>Your final invoice is attached below.</p>`,
      work.invoice.pdfUrl
    );

    res.status(200).json({
      message: "Payment processed and final invoice sent to client email.",
      payment: work.payment,
    });
  } catch (err) {
    console.error("Payment Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
exports.confirmPayment = async (req, res) => {
  try {
    const { workId, paymentMethod } = req.body;
    const technicianId = req.user._id;

    const work = await Work.findById(workId)
      .populate("client", "firstName email")
      .populate("technician", "firstName _id");

    if (!work) return res.status(404).json({ message: "Work not found" });

    // ✅ Technician must be assigned to this work
    if (String(work.technician._id) !== String(technicianId))
      return res.status(403).json({ message: "Unauthorized: not your assigned work" });

    // ✅ Work must be completed
    if (work.status !== "completed")
      return res.status(400).json({ message: "Work must be completed before confirming payment" });

    // ✅ Payment method check
    if (!["cash", "upi"].includes(paymentMethod))
      return res.status(400).json({ message: "Invalid payment method" });

    // ✅ Save payment info
    work.payment = {
      method: paymentMethod,
      status: "confirmed",
      confirmedBy: technicianId,
      confirmedAt: new Date(),
    };
    await work.save();



    res.status(200).json({
      message: "Payment confirmed successfully.",
      payment: work.payment,
    });
  } catch (err) {
    console.error("Confirm Payment Error:", err);
    res.status(500).json({ message: "Server error while confirming payment." });
  }
};
exports.saveLocation = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const userId = req.user._id;

    if (!lat || !lng)
      return res.status(400).json({ message: "Latitude and longitude required" });

    // Update user's saved coordinates
    await User.findByIdAndUpdate(userId, {
      coordinates: { lat, lng },
      lastLocationUpdate: new Date(),
    });

    res.status(200).json({
      success: true,
      message: "Location saved successfully",
      coordinates: { lat, lng },
    });
  } catch (error) {
    console.error("Save Location Error:", error);
    res.status(500).json({ message: "Failed to save location" });
  }
};

// 📍 Get Saved Location
exports.getLocation = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || !user.coordinates)
      return res.status(404).json({ message: "No saved location found" });

    res.status(200).json({
      success: true,
      coordinates: user.coordinates,
      lastUpdated: user.lastLocationUpdate,
    });
  } catch (error) {
    console.error("Get Location Error:", error);
    res.status(500).json({ message: "Failed to fetch location" });
  }
};


exports.getRoutes = async (req, res) => {
  try {
    const { techLat, techLng, clientLat, clientLng } = req.body;

    const googleKey = process.env.GOOGLE_MAPS_API_KEY;

    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${techLat},${techLng}&destination=${clientLat},${clientLng}&mode=driving&alternatives=true&key=${googleKey}`;

    const response = await axios.get(url);
    const data = response.data;

    if (data.status !== "OK") {
      return res.status(400).json({ message: "Google Directions API Error" });
    }

    res.status(200).json({
      routes: data.routes.map((route, index) => ({
        index,
        summary: route.summary,
        distance: route.legs[0].distance.text,
        duration: route.legs[0].duration.text,
        polyline: route.overview_polyline.points,
      })),
    });

  } catch (err) {
    console.error("Get Routes Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.selectRoute = async (req, res) => {
  try {
    const { workId } = req.params;
    const { selectedRouteIndex } = req.body;

    const work = await Work.findById(workId);
    if (!work) return res.status(404).json({ message: "Work not found" });

    work.selectedRouteIndex = selectedRouteIndex;
    await work.save();

    res.status(200).json({
      message: "Route selected successfully",
      selectedRouteIndex
    });

  } catch (err) {
    console.error("Select Route Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
exports.subscribe = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email required" });
    }

    // Check existing subscriber
    const exist = await Newsletter.findOne({ email });
    if (exist) {
      return res.status(200).json({ message: "Already subscribed!" });
    }

    // Save subscriber
    await Newsletter.create({ email });

    // Send Welcome Email using SENDGRID
    await sendemail(
      email,
      "You're Subscribed! 🎉",
      `
        <h2>Welcome to Our Newsletter ❤️</h2>
        <p>Thank you for subscribing. You'll now receive updates directly from us.</p>
      `
    );

    return res.status(200).json({
      success: true,
      message: "Subscribed successfully & email sent!"
    });

  } catch (error) {
    console.error("Newsletter Error:", error);
    res.status(500).json({ message: "Something went wrong" });
  }
};

exports.sendBulkEmail = async (req, res) => {
  try {
    const { subject, message } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ message: "Subject and message required" });
    }

    const subscribers = await Newsletter.find({}, "email");

    if (subscribers.length === 0) {
      return res.status(400).json({ message: "No subscribers found" });
    }

 
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.ADMIN_EMAIL,
        pass: process.env.ADMIN_PASSWORD,
      },
    });

    for (let sub of subscribers) {
      const mailOptions = {
        from: process.env.ADMIN_EMAIL,
        to: sub.email,
        subject,
        html: `
          <div style="font-family: Arial; padding: 10px;">
            <h2>${subject}</h2>
            <p>${message}</p>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
    }

    res.status(200).json({
      success: true,
      message: "Bulk emails sent successfully!",
      count: subscribers.length,
    });

  } catch (error) {
    console.error("Bulk Email Error:", error);
    res.status(500).json({ message: "Failed to send bulk emails" });
  }
};

exports.getSubscribers = async (req, res) => {
  try {
    const list = await Newsletter.find().sort({ subscribedAt: -1 });
    res.status(200).json({ success: true, subscribers: list });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch subscribers" });
  }
};
