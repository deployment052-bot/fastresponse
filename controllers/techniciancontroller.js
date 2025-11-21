// controllers/technicianController.js (or wherever)
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const { uploadToCloudinary } = require("../utils/cloudinaryUpload"); // adjust path
const { generateBillPDF } = require("../utils/Invoice"); // adjust path
const sendEmail = require("../utils/sendemail"); // adjust path
const Work = require("../model/work");
const User = require("../model/user");
const Bill = require("../model/Bill");

const projectRoot = process.cwd();
const invoicesFolder = path.join(projectRoot, "invoices");

// ensure invoices folder exists
if (!fs.existsSync(invoicesFolder)) {
  fs.mkdirSync(invoicesFolder, { recursive: true });
}

exports.completeWorkAndGenerateBill = async (req, res) => {
  try {
    const { workId, serviceCharge = 0, paymentMethod = "upi", upiId } = req.body;
    const technicianId = req.user._id;

    // Validate work
    const work = await Work.findById(workId).populate("client");
    if (!work) return res.status(404).json({ message: "Work not found" });

    if (String(work.assignedTechnician) !== String(technicianId)) {
      return res.status(403).json({ message: "You are not assigned to this work" });
    }

    // After-photo required
    if (!req.file) return res.status(400).json({ message: "After photo is required" });

    // Save photo: try Cloudinary then fallback to base64
    let finalPhotoUrl = null;
    const localPath = req.file.path;

    try {
      const uploaded = await uploadToCloudinary(localPath, "after_photos");
      finalPhotoUrl = uploaded.secure_url;
    } catch (cloudErr) {
      console.error("Cloudinary upload failed, fallback:", cloudErr.message);

      try {
        const buf = fs.readFileSync(localPath);
        finalPhotoUrl = `data:${req.file.mimetype};base64,${buf.toString("base64")}`;
      } catch (fsErr) {
        return res.status(500).json({ message: "Failed to store after photo" });
      }
    } finally {
      try { if (fs.existsSync(localPath)) fs.unlinkSync(localPath); } catch (e) {}
    }

    // Save photo to work
    work.afterphoto = finalPhotoUrl;

    // PAYMENT calculations
    const totalAmount = Number(serviceCharge) || 0;

    // Prepare bill data
    const billData = {
      workId: work._id,
      technicianId,
      clientId: work.client._id,
      serviceCharge: totalAmount,
      totalAmount,
      paymentMethod,
      status: "sent",
    };

    let qrBuffer = null;
    let clickableUPI = null;
    let upiUri = null;

    // ----------- UPI PAYMENT HANDLING -----------
    if (paymentMethod === "upi") {
      const finalUpi = upiId || process.env.upi_id;
      if (!finalUpi) return res.status(400).json({ message: "UPI ID is required for UPI payment" });

      const name = encodeURIComponent(req.user.firstName || "Technician");
      upiUri = `upi://pay?pa=${finalUpi}&pn=${name}&am=${totalAmount}&cu=INR&tn=Service%20Payment`;

      clickableUPI = `https://upi.me/pay?pa=${finalUpi}&pn=${name}&am=${totalAmount}&cu=INR&tn=Service%20Payment`;

      const qrDataUrl = await QRCode.toDataURL(upiUri);
      qrBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");

      billData.upiUri = upiUri;
      billData.clickableUPI = clickableUPI;
      billData.qrImage = qrDataUrl;
    }

    // Save bill in DB
    const bill = await Bill.create(billData);

    // ----------- PDF GENERATION (FIXED PATH) -----------
    const filePath = path.join(invoicesFolder, `bill_${work._id}.pdf`);

    // delete previous bill if exists
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    const technician = await User.findById(technicianId);
    const client = work.client;

    await generateBillPDF(
      work,
      technician,
      client,
      totalAmount,
      paymentMethod,
      totalAmount,
      qrBuffer,
      upiId || process.env.upi_id,
      filePath // pass final path to util
    );

    // ----------- EMAIL ATTACHMENTS -----------
    const pdfBuffer = fs.readFileSync(filePath);

    const attachments = [
      {
        content: pdfBuffer.toString("base64"),
        filename: `bill_${work._id}.pdf`,
        type: "application/pdf",
        disposition: "attachment",
      },
    ];

    if (qrBuffer) {
      attachments.push({
        content: qrBuffer.toString("base64"),
        filename: "upi-qr.png",
        type: "image/png",
        disposition: "inline",
        content_id: "qr_code",
      });
    }

    const emailBody = `
      <p>Hello ${client.firstName || ""},</p>
      <p>Your service <b>${work.serviceType || ""}</b> has been completed.</p>
      <p><b>Total Amount:</b> ₹${totalAmount}</p>
      ${
        paymentMethod === "upi"
          ? `<p><b>Pay Now:</b> <a href="${clickableUPI}">Click here to pay via UPI</a></p>
             <p><img src="cid:qr_code" width="180" /></p>`
          : `<p><b>Payment Mode:</b> Cash</p>`
      }
      <p>The bill (PDF) is attached.</p>
      <p>Thank you!</p>
    `;

    await sendEmail(client.email, "Your Bill & Payment Details", emailBody, attachments);

    // ----------- UPDATE WORK STATUS -----------
    work.status = "completed";
    work.completedAt = new Date();
    work.billId = bill._id;
    await work.save();

    return res.status(200).json({
      message: "Work completed successfully",
      afterphoto: finalPhotoUrl,
      bill,
      upiUri,
      clickableUPI,
    });

  } catch (err) {
    console.error("COMPLETE WORK ERROR:", err);
    return res.status(500).json({ message: "Error completing work", error: err.message });
  }
};

exports.getTechnicianSummary1 = async (req, res) => {
  try {
    const technicianId = req.user._id;

   
    const totalWorkCount = await Work.countDocuments({
      assignedTechnician: technicianId,
    });

    const activeCount = await Work.countDocuments({
      assignedTechnician: technicianId,
      status: { $in: ["dispatch", "inprogress"] },
    });

  
    const completedCount = await Work.countDocuments({
      assignedTechnician: technicianId,
      status: "completed",
    });

 
    const rejectedCount = await Work.countDocuments({
      assignedTechnician: technicianId,
      status: "rejected",
    });

   
    const completedWorks = await Work.find({
      assignedTechnician: technicianId,
      status: "completed",
    });

    const totalEarnings = completedWorks.reduce((sum, work) => {
      const invoiceTotal = work.invoice?.total || 0;
      const serviceCharge = work.serviceCharge || 0;
      return sum + invoiceTotal + serviceCharge;
    }, 0);

 
    res.status(200).json({
      technicianId,
      summary: {
        totalWorkCount,
        activeCount,
        completedCount,
        rejectedCount,
        totalEarnings,
      },
    });

  } catch (error) {
    console.error("Error fetching technician summary:", error);
    res.status(500).json({
      message: "Error fetching technician summary",
      error: error.message,
    });
  }
};

exports.getTechnicianSummary = async (req, res) => {
  try {
    const technicianId = req.user._id;

    const works = await Work.find({ technician: technicianId })
      .populate("client", "fisrtName lastName date phone email location")
      .populate("supervisor", "name")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: works.length,
      works,
    });
  } catch (err) {
    console.error("❌ Technician Summary Error:", err);
    res.status(500).json({
      success: false,
      message: "Unable to fetch technician summary",
    });
  }
};

exports.getAvailableJobs = async (req, res) => {
  try {
    const technicianId = req.user._id;
    const technician = await User.findById(technicianId);
    if (!technician) return res.status(404).json({ message: "Technician not found" });


    const jobs = await Work.find({
      status: "open",
      specialization: { $in: technician.specialization },
      location: { $regex: new RegExp(technician.location, "i") },
    });

    res.status(200).json({
      message: "Available jobs fetched successfully",
      jobs,
    });
  } catch (err) {
    console.error("Get Available Jobs Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


exports.approveJob = async (req, res) => {
  try {
    const technicianId = req.user._id;
    const { workId } = req.body;

    const work = await Work.findById(workId);
    if (!work) return res.status(404).json({ message: "Work not found" });

    if (!work.assignedTechnician) {
      return res.status(400).json({ message: "No technician assigned to this work" });
    }

    if (work.assignedTechnician.toString() !== technicianId.toString()) {
      return res.status(403).json({ message: "You are not authorized to approve this job" });
    }

    work.status = "approved";
    await work.save();

    res.status(200).json({
      success: true,
      message: "Job approved successfully",
      work,
    });

  } catch (error) {
    console.error("Approve job error:", error);
    res.status(500).json({ message: "Server error" });
  }
};



exports.getTechnicianSummarybycount = async (req, res) => {
  try {
    const technicianId = req.user._id; 
    const works = await Work.find({ technicianId }) 
      .populate("clientId", "firstName lastName phone email location")
      .populate("billId")
      .sort({ createdAt: -1 });

    const completed = works.filter(w => w.status === "completed");
    const inProgress = works.filter(w => ["inprogress", "confirm"].includes(w.status));
    const upcoming = works.filter(w => ["approved", "dispatch", "taken", "open"].includes(w.status));
    const onHold = works.filter(w => ["onhold_parts", "rescheduled", "escalated"].includes(w.status));

    const totalEarnings = works.reduce((sum, w) => sum + (w.billId?.totalAmount || 0), 0);

    res.status(200).json({
      success: true,
      summary: {
        total: works.length,
        completed: completed.length,
        inProgress: inProgress.length,
        upcoming: upcoming.length,
        onHold: onHold.length,
        totalEarnings,
      },
      data: {
        completed,
        inProgress,
        upcoming,
        onHold,
      },
    });
  } catch (error) {
    console.error("Technician summary error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getAllTechnicianWorks = async (req, res) => {
  try {
    const technicianId = req.user._id;

  
    const works = await Work.find({ assignedTechnician: technicianId })
      .populate("client", "firstName lastName phone email location")
      .populate("billId")
      .sort({ createdAt: -1 }); 

    if (!works.length) {
      return res.status(200).json({
        success: true,
        message: "No works assigned yet",
        works: [],
      });
    }

   
    const categorized = {
      completed: works.filter(w => w.status === "completed"),
      inProgress: works.filter(w => ["inprogress", "confirm"].includes(w.status)),
      upcoming: works.filter(w => ["approved", "dispatch", "taken", "open"].includes(w.status)),
      onHold: works.filter(w => ["onhold_parts", "rescheduled", "escalated"].includes(w.status)),
    };

    res.status(200).json({
      success: true,
      count: works.length,
      works,
      categorized,
    });
  } catch (error) {
    console.error("❌ Error fetching all technician works:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching technician works",
      error: error.message,
    });
  }
};

exports.confirmPayment = async (req, res) => {
  try {
    const { workId, paymentMethod } = req.body; 
    const technicianId = req.user._id;

    const work = await Work.findById(workId)
      .populate("client", "firstName email")
      .populate("assignedTechnician", "firstName _id");

    if (!work) return res.status(404).json({ message: "Work not found" });


    if (String(work.assignedTechnician?._id) !== String(technicianId)) {
      return res.status(403).json({ message: "Unauthorized: not your assigned work" });
    }

   
    if (work.status !== "completed") {
      return res.status(400).json({ message: "Work must be completed before confirming payment" });
    }

    
    if (!["cash", "upi"].includes(paymentMethod)) {
      return res.status(400).json({ message: "Invalid payment method" });
    }

   
    work.payment = {
      method: paymentMethod,
      status: "confirmed",
      confirmedBy: technicianId,
      confirmedAt: new Date(),
      paidAt: work.payment?.paidAt || new Date(), 
    };

   
    work.status = "confirm";
    await work.save();

    
    if (work.client?.email) {
      await sendEmail(
        work.client.email,
        "💰 Payment Confirmed - Thank You!",
        `
        <p>Dear ${work.client.firstName || "Customer"},</p>
        <p>Your payment for <b>Work ID: ${work._id}</b> has been successfully confirmed.</p>
        <p><b>Payment Method:</b> ${paymentMethod.toUpperCase()}</p>
        <p>Technician: ${work.assignedTechnician.firstName}</p>
        <p>Thank you for your trust!</p>
        `
      );
    }

    res.status(200).json({
      success: true,
      message: "Payment confirmed successfully by technician.",
      payment: work.payment,
    });
  } catch (err) {
    console.error("❌ Confirm Payment Error:", err);
    res.status(500).json({ message: "Server error while confirming payment." });
  }
};

