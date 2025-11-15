const mongoose= require('mongoose')
const Work = require("../model/work");
const User = require("../model/user");
const Booking=require("../model/BookOrder")
const AdminNotification=require('../model/adminnotification')
const axios = require("axios");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const nodemailer = require("nodemailer");
const sendemail=require('../utils/sendemail')
const { uploadToCloudinary } = require("../utils/cloudinaryUpload");
const generateToken = (id) => {
  return `REQ-${new Date().getFullYear()}-${String(id).padStart(5, '0')}`;
};

function parseClientDate(input) {
  if (!input) return null;

  // Replace slashes with dashes
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
    objectDate
  };
}

exports.createWork = async (req, res) => {
  try {
    const { 
      serviceType, 
      specialization, 
      description, 
      location, 
      serviceCharge,
      technicianId, 
      lat, 
      lng,
      date // DD-MM-YYYY or DD/MM/YYYY
    } = req.body;

    const clientId = req.user._id;

    if (!serviceType || !specialization || !location)
      return res.status(400).json({ message: "Missing required fields" });

    // Normalize specialization
    const specs = Array.isArray(specialization)
      ? specialization.map(s => s.trim().toLowerCase())
      : specialization.split(",").map(s => s.trim().toLowerCase());

    const normalizedLocation = location.trim().toLowerCase();

    // Fetch client
    const client = await User.findById(clientId);
    if (!client) return res.status(404).json({ message: "Client not found" });

    // Coordinates
    const finalLat = lat || client.coordinates?.lat;
    const finalLng = lng || client.coordinates?.lng;
    if (!finalLat || !finalLng)
      return res.status(400).json({ message: "Location coordinates missing." });

    // Parse date
    let parsedDate = null;
    if (date) {
      parsedDate = parseClientDate(date);
      if (!parsedDate) return res.status(400).json({ message: "Invalid date format (DD-MM-YYYY)" });
    }

    // Create Work
    const work = await Work.create({
      client: clientId,
      serviceType,
      specialization: specs,
      description,
      serviceCharge,
      location: normalizedLocation,
      coordinates: { lat: finalLat, lng: finalLng },
      assignedTechnician: technicianId || null,
      status: technicianId ? "taken" : "open",
      token: `REQ-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
      date: parsedDate ? parsedDate.objectDate : null,
      formattedDate: parsedDate ? parsedDate.formatted : null,
      time: "",
      formattedTime: ""
    });

    // Fetch matching technicians
    const technicians = await User.find({
      role: "technician",
      specialization: { $in: specs.map(s => new RegExp(s, "i")) },
      location: { $regex: new RegExp(normalizedLocation, "i") }
    }).select("firstName lastName phone email experience specialization location ratings coordinates");

    const techniciansWithStatus = [];
    for (const tech of technicians) {
      const inWork = await Work.findOne({
        assignedTechnician: tech._id,
        status: { $in: [ "dispatch", "inprogress"] }
      });
      techniciansWithStatus.push({
        ...tech.toObject(),
        employeeStatus: inWork ? "in work" : "available"
      });
    }

    res.status(201).json({
      message: technicianId
        ? "Work created and assigned to technician"
        : "Work request submitted successfully",
      work,
      matchingTechnicians: techniciansWithStatus
    });

  } catch (err) {
    console.error("Work Creation Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};




exports.findMatchingTechnicians = async (req, res) => {
  try {
    const clientId = req.user._id;
    let { specialization, location, date, description, serviceType, time } = req.body;

    if (!specialization || !location || !date) {
      return res.status(400).json({ message: "Specialization, location, and date required" });
    }

    if (typeof specialization === "string") {
      specialization = [specialization];
    }

    const workDate = new Date(date);
    if (isNaN(workDate.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    let specs = [];
    if (typeof specialization === "string") {
      specs = specialization
        .split(",")
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);
    } else if (Array.isArray(specialization)) {
      specs = specialization.map(s => s.trim().toLowerCase());
    }

    const normalizedLocation = location.trim().toLowerCase();

  
    const work = await Work.create({
      client: clientId,
      serviceType,
      specialization: specs,
      description,
      location: normalizedLocation,
      date: workDate,
      time,
      status: "open",
      token: `REQ-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`
    });
      
    const technicians = await User.find({
      role: "technician",
      specialization: { $in: specs.map(s => new RegExp(s, "i")) },
      location: { $regex: new RegExp(normalizedLocation, "i") }
    }).select("name phone email experience specialization location ratings");

    const techniciansWithStatus = [];
    for (const tech of technicians) {
      const inWork = await Work.findOne({
        assignedTechnician: tech._id,
        status: { $in: ["taken", "approved"] }
      });

      techniciansWithStatus.push({
        ...tech.toObject(),
        employeeStatus: inWork ? "in work" : "available"
      });

     
    //   await sendNotification(
    //     tech._id,
    //     "technician",
    //     "New Work Request",
    //     `New job available: ${serviceType} in ${location}`,
    //     "info",
    //     `/technician/jobs`
    //   );
     }

   
    // await sendNotification(
    //   clientId,
    //   "client",
    //   "Work Request Submitted",
    //   `Your request for ${serviceType} has been submitted successfully.`,
    //   "success",
    //   `/client/work/${work._id}`
    // );

    res.status(201).json({
      message: "Work request submitted and sent to all matching technicians",
      work,
      matchingTechnicians: techniciansWithStatus.length
        ? techniciansWithStatus
        : "No matching technicians found"
    });

  } catch (err) {
    console.error("Technician Search Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};



// DATE FORMAT: D-MM-YYYY
exports.bookTechnician = async (req, res) => {
  try {
    const { 
      workId,
      technicianId,
      serviceType,
      serviceCharge,
      description,
      date // DD-MM-YYYY or DD/MM/YYYY
    } = req.body;

    const userId = req.user._id;

    if (!technicianId || !workId)
      return res.status(400).json({ message: "Work ID and Technician ID are required" });

    if (!date)
      return res.status(400).json({ message: "Date required (DD-MM-YYYY)" });

    const parsedDate = parseClientDate(date);
    if (!parsedDate)
      return res.status(400).json({ message: "Invalid date format (DD-MM-YYYY)" });

    // Fetch users
    const client = await User.findById(userId);
    if (!client) return res.status(404).json({ message: "Client not found" });

    const technician = await User.findById(technicianId);
    if (!technician) return res.status(404).json({ message: "Technician not found" });

    const work = await Work.findById(workId);
    if (!work) return res.status(404).json({ message: "Work not found" });

    // Duplicate booking
    const duplicateBooking = await Booking.findOne({
      user: userId,
      technician: technicianId,
      serviceType,
      status: { $in: ["open", "taken", "dispatch", "inprogress"] }
    });
    if (duplicateBooking) return res.status(400).json({
      message: `You already booked technician ${technician.name} for ${serviceType}.`
    });

    // Technician conflict
    const conflict = await Work.findOne({
      assignedTechnician: technicianId,
      status: { $in: ["taken", "dispatch", "inprogress"] }
    });
    if (conflict) return res.status(400).json({ message: "Technician is already assigned to another work." });

    // Create booking
    const booking = await Booking.create({
      user: userId,
      technician: technicianId,
      serviceType,
      serviceCharge,
      description,
      location: work.location,
      address: client.address || "Not available",
      date: parsedDate.objectDate,
      formattedDate: parsedDate.formatted,
      formattedTime: "",
      status: "open"
    });

    // Update work
    const updatedWork = await Work.findByIdAndUpdate(
      workId,
      { assignedTechnician: technicianId, status: "taken" },
      { new: true }
    );

    res.status(201).json({
      message: "Technician booked successfully.",
      booking,
      work: updatedWork,
      formattedDate: parsedDate.formatted
    });

  } catch (err) {
    console.error("Book Technician Error:", err);
    res.status(500).json({ message: "Server error while booking technician" });
  }
};







exports.WorkStart = async (req, res) => {
  try {
    const { workId } = req.body;
    const technicianId = req.user._id;
    const beforePhoto = req.file; // 📸 Multer will store file here

    if (!workId) {
      return res.status(400).json({ message: "Work ID is required" });
    }

    const work = await Work.findById(workId);
    if (!work) {
      return res.status(404).json({ message: "Work not found" });
    }

    if (String(work.assignedTechnician) !== String(technicianId)) {
      return res.status(403).json({ message: "You are not assigned to this work" });
    }

    // ✅ Upload before photo (Cloudinary or local)
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

    // 🚫 Block updates ONLY if work not found
    // ❗ Remove the strict check work.status !== "approved"
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

    // 🔹 Auto move to dispatch ONLY first time
    if (work.status === "approved") {
      work.status = "dispatch";
      await work.save();
    }

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

    // Prefer work coordinates, else fallback to client's saved coordinates
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

    // 🔥 UPDATED: Directions API with multiple routes (alternatives=true)
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=driving&alternatives=true&key=${googleKey}`;

    const response = await axios.get(url);
    const data = response.data;

    if (data.status !== "OK") {
      return res.status(400).json({
        message: `Google Directions API error: ${data.status}`,
      });
    }

    // ⭐ Technician-selected route (default: 0)
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

      // ⭐ Same old fields, just updated logic
      eta: `${minutes} minutes`,
      distance: distanceText,

      // ⭐ Extra: polyline if you want to draw route on client map
      polyline: route.overview_polyline.points,

      // ⭐ Extra: all routes list for route selection (optional)
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
      .populate("assignedTechnician", "name phone email technicianStatus coordinates lastLocationUpdate")
      .populate("client", "name phone email coordinates");

    if (!work) {
      return res.status(404).json({ message: "Work not found" });
    }

    if (String(work.client._id) !== String(clientId)) {
      return res.status(403).json({ message: "Not authorized to view this work" });
    }

    // Prepare technician data
    const technician = work.assignedTechnician;
    let eta = "ETA not available";

    // 🔹 Calculate ETA if both coordinates exist
    if (technician?.coordinates?.lat && technician?.coordinates?.lng && work.coordinates?.lat && work.coordinates?.lng) {
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

    // 🔹 Prepare response object
    const workStatus = {
      workId: work._id,
      token: work.token,
      serviceType: work.serviceType,
      specialization: work.specialization,
      serviceCharge:work.serviceCharge,
      description: work.description,
      location: work.location,
      status: work.status,
      createdAt: work.createdAt,
      startedAt: work.startedAt,
      completedAt: work.completedAt,
      client: {
        name: work.client.name,
        phone: work.client.phone,
        email: work.client.email,
      },
      technician: technician
        ? {
            name: technician.name,
            phone: technician.phone,
            email: technician.email,
            status: technician.technicianStatus,
            coordinates: technician.coordinates,
            lastUpdate: technician.lastLocationUpdate,
          }
        : null,
      eta,
    };

    res.status(200).json({
      message: "Work status fetched successfully",
      workStatus,
    });
  } catch (err) {
    console.error("Client Work Status Error:", err);
    res.status(500).json({ message: "Server error" });
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

    // ⚙️ Your existing switch logic (unchanged)
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

    // ✅ 🔹 ADD ADMIN NOTIFICATION (only new part)
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

    // 🔹 Existing booking & technician update (unchanged)
    await Booking.findOneAndUpdate(
      { technician: technicianId, user: work.client._id },
      { status: work.status }
    );

    await User.findByIdAndUpdate(technicianId, {
      technicianStatus: "pending",
      availability: true
    });

    // 🔹 Final response (unchanged)
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
    const { workId, paymentMethod } = req.body; // "cash" or "upi"
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
