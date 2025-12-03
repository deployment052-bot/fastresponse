// controllers/technicianController.js (or wherever)
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const { uploadToCloudinary } = require("../utils/cloudinaryUpload"); 
const { generateBillPDF } = require("../utils/Invoice"); 
const {generatePaymentReceiptPDF}= require("../utils/finalinvoice");
const sendEmail = require("../utils/sendemail"); 
const Work = require("../model/work");
const User = require("../model/user");
const Bill = require("../model/Bill");

const projectRoot = process.cwd();
const invoicesFolder = path.join(projectRoot, "invoices");


if (!fs.existsSync(invoicesFolder)) {
  fs.mkdirSync(invoicesFolder, { recursive: true });
}

exports.completeWorkAndGenerateBill = async (req, res) => {
  try {
    const { workId, serviceCharge , paymentMethod = "upi", upiId,upiApp } = req.body;
    const technicianId = req.user._id;

  const paymentId = "pay_" + Date.now();
  const expiresAt = Date.now() + 10 * 60 * 1000; 
    
    const work = await Work.findById(workId).populate("client");
    if (!work) return res.status(404).json({ message: "Work not found" });

    if (String(work.assignedTechnician) !== String(technicianId)) {
      return res.status(403).json({ message: "You are not assigned to this work" });
    }

    if (!req.file) return res.status(400).json({ message: "After photo is required" });

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

    
    work.afterphoto = finalPhotoUrl;

  
    const totalAmount = Number(work.serviceCharge) ;
let upiIntent = null;
       let qrBuffer = null;
    if (paymentMethod === "upi") {
      const companyUpi = upiId || process.env.upi_id; // your company's UPI ID
      const companyName = encodeURIComponent(
        process.env.COMPANY_NAME || "FAST RESPONSE"
      );
      const description = encodeURIComponent(
        `Service Bill #${work.token || work._id}`
      );

      // Auto-fill amount + company name
      upiIntent =
        `upi://pay?pa=${companyUpi}` +
        `&pn=${companyName}` +
        `&am=${totalAmount}` +
        `&cu=INR` +
        `&tn=${description}`;

      // Generate QR code
      const qr = await QRCode.toDataURL(upiIntent);
      qrBuffer = Buffer.from(qr.split(",")[1], "base64");
    }

 
    const billData = {
      workId: work._id,
      technicianId,
      clientId: work.client._id,
      serviceCharge: totalAmount,
      totalAmount,
      paymentMethod,
       upiIntent,
      status: "sent",
    };

 
    let clickableUPI = null;
    let upiUri = null;

   
    if (paymentMethod === "upi") {
      const finalUpi = upiId || process.env.upi_id;
      if (!finalUpi) return res.status(400).json({ message: "UPI ID is required for UPI payment" });

      const name = encodeURIComponent(req.user.firstName || "Technician");
      upiUri = `upi://pay?pa=${finalUpi}&pn=${name}&am=${serviceCharge}&cu=INR&tn=Service%20Payment`;

      clickableUPI = `https://upi.me/pay?pa=${finalUpi}&pn=${name}&am=${serviceCharge}&cu=INR&tn=Service%20Payment`;

      const qrDataUrl = await QRCode.toDataURL(upiUri);
      qrBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");

      billData.upiUri = upiUri;
      billData.clickableUPI = clickableUPI;
      billData.qrImage = qrDataUrl;
    }

    
    const bill = await Bill.create(billData);

 
    const filePath = path.join(invoicesFolder, `bill_${work._id}.pdf`);

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
      serviceCharge,
      totalAmount,
      qrBuffer,
      upiId || process.env.upi_id,
      filePath 
    );


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

   
    work.status = "completed";
    work.completedAt = new Date();
    work.billId = bill._id;
    await work.save();

 return res.status(200).json({
  success: true,
  bill: {
    workId: work._id,
    serviceType: work.serviceType,
    baseCharge: work.serviceCharge,
    extraCharges: work.extraCharges || 0,
    tax: work.tax || 0,
    totalAmount: totalAmount,
  },
  payment: {
    upiUri,
    clickableUPI,
    upiApp,  
    qrImage: billData.qrImage,
    expiresAt
  },
  afterPhoto: finalPhotoUrl
});


  } catch (err) {
    console.error("COMPLETE WORK ERROR:", err);
    return res.status(500).json({ message: "Error completing work", error: err.message });
  }
};

// abhi hum ye code use kr rahe h technician k work count k liye 
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

      totalWorkCount: works.length,   // 🌟 NEW FIELD ADDED 🌟

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
      .populate("client", "firstName email phone")
      .populate("assignedTechnician", "firstName token email role phone");

    if (!work) return res.status(404).json({ message: "Work not found" });


    if (String(work.assignedTechnician?._id) !== String(technicianId)) {
      return res.status(403).json({ message: "Unauthorized: not your assigned work" });
    }

   
    // if (work.status!=="completed") {
    //   return res.status(400).json({ message: "Work must be completed before confirming payment" });
    // }

    
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
 const receiptFilePath = path.join(
      invoicesFolder,
      `payment_receipt_${work.token}.pdf`
    );

    if (fs.existsSync(receiptFilePath)) fs.unlinkSync(receiptFilePath);

    await generatePaymentReceiptPDF(
      work,
      work.assignedTechnician,
      work.client,
      receiptFilePath
    );

    const pdfBuffer = fs.readFileSync(receiptFilePath);
    const emailBody = `
      <p>Hello ${work.client.firstName || ""},</p>
      <p>Your payment for Work ID <b>${work.token}</b> has been successfully confirmed.</p>
      <p><b>Payment Method:</b> ${paymentMethod.toUpperCase()}</p>
      <p><b>Technician:</b> ${work.assignedTechnician.firstName}</p>
      <p>Your payment receipt is attached as a PDF.</p>
    `;

    await sendEmail(
      work.client.email,
      "Payment Receipt - Thank You",
      emailBody,
      [
        {
          content: pdfBuffer.toString("base64"),
          filename: `payment_receipt_${work.token}.pdf`,
          type: "application/pdf",
          disposition: "attachment",
        },
      ]
    );


    res.status(200).json({
      success: true,
      message: "Payment confirmed successfully by technician.",
      payment: work.payment,
    });
  } catch (err) {
    console.error(" Confirm Payment Error:", err);
    res.status(500).json({ message: "Server error while confirming payment." });
  }
};



exports.raiseWorkIssue = async (req, res) => {
  try {
    const { workId, issueType, remarks, specializationRequired, reason } = req.body;
    
    const technicianId =
      req.user && req.user._id ? req.user._id : req.body.technicianId;

    const work = await Work.findById(workId);
    if (!work) return res.status(404).json({ message: "Work not found" });

    
    const issueData = {
      issueType,
      remarks,
      raisedBy: technicianId,
      status: "open"
    };

    switch (issueType) {
      case "need_parts":
        work.status = "inprogress";
        break;

      case "need_specialist":
        issueData.specializationRequired = specializationRequired;
        issueData.reason = reason;
        work.status = "inprogress";
        break;

      case "customer_unavailable":
        work.status = "inprogress";
        break;

      default:
        work.status = "inprogress";
    }


    work.issues.push(issueData);

    work.issueCount = (work.issueCount || 0) + 1;

    await work.save();

    res.status(201).json({
      message: "Issue raised successfully",
      work,
    });

  } catch (error) {
    console.error("Raise Issue Error:", error);
    res.status(500).json({ message: "Failed to raise issue" });
  }
};
exports.needPartRequest = async (req, res) => {
  try {
    const { workId, parts } = req.body; 
    const technicianId = req.user && req.user._id ? req.user._id : req.body.technicianId;

    if (!parts || !Array.isArray(parts) || parts.length === 0) {
      return res.status(400).json({ message: "Parts details are required" });
    }

    const work = await Work.findById(workId);
    if (!work) return res.status(404).json({ message: "Work not found" });

   
    let latestIssue = work.issues.filter(i => i.issueType === "need_parts" && i.status === "open").slice(-1)[0];

    if (!latestIssue) {
      latestIssue = {
        issueType: "need_parts",
        remarks: "",
        raisedBy: technicianId,
        raisedAt: new Date(),
        status: "open",
        parts: []
      };
      work.issues.push(latestIssue);
    }

const partDetails = parts.map(p => ({
  itemName: p.itemName,
  quantity: p.quantity,
  unit: p.unit || "",
  componyName:"",
  requiredDate: p.requiredDate ? new Date(p.requiredDate) : null,
  deliveryAddress: work.location, 
  requestedBy: technicianId,
  requestedOn: new Date(),
  status: "pending_fastresponse"
}));

    latestIssue.parts = [...(latestIssue.parts || []), ...partDetails];

   
    work.status = "inprogress";

    await work.save();

    return res.status(201).json({
      success: true,
      message: "Parts requested successfully",
      parts: partDetails,
      work
    });

  } catch (error) {
    console.error("Add Part Request Error:", error);
    return res.status(500).json({
      message: "Failed to add part request",
      error: error.message,
      stack: error.stack
    });
  }
};



exports.getMyPartsRequests = async (req, res) => {
  try {
    const technicianId = req.user._id;

    const works = await Work.find({
      "issues": {
        $elemMatch: {
          issueType: "need_parts",
          "parts.requestedBy": technicianId 
        }
      }
    })
      .populate("client", "firstName lastName phone location")
      .populate("assignedTechnician", "firstName lastName phone");

    return res.status(200).json({ success: true, works });
  } catch (error) {
    console.error("Error fetching technician parts requests:", error);
    return res.status(500).json({ message: "Failed to fetch your parts requests", error: error.message });
  }
};
