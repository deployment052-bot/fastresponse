const fs = require("fs");
const { uploadToCloudinary } = require("../utils/cloudinaryUpload"); 
const QRCode = require("qrcode");
const Work = require("../model/work");
const User = require("../model/user");
const Bill = require("../model/Bill");
const { generateBillPDF } = require("../utils/Invoice");

const sendEmail = require("../utils/sendemail");

exports.completeWorkAndGenerateBill = async (req, res) => {
  try {
    const { workId, serviceCharge = 0, paymentMethod = "cash", upiId: bodyUpiId } = req.body;
    const technicianId = req.user._id;

   
    if (!workId) return res.status(400).json({ message: "Work ID is required" });

    const work = await Work.findById(workId).populate("client");
    if (!work) return res.status(404).json({ message: "Work not found" });

    if (String(work.assignedTechnician) !== String(technicianId)) {
      return res.status(403).json({ message: "You are not assigned to this work" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "After photo (field name 'afterphoto') is required" });
    }

    const tempFilePath = req.file.path; 
    let finalPhotoValue = null; 
    let cloudPublicId = null;

    
    try {
      const uploadRes = await uploadToCloudinary(tempFilePath, "after_photos");
      finalPhotoValue = uploadRes.secure_url;
      cloudPublicId = uploadRes.public_id || null;
    } catch (cloudErr) {
      console.warn("Cloudinary upload failed — falling back to base64. Error:", cloudErr.message || cloudErr);
      
      const buffer = fs.readFileSync(tempFilePath);
      const mime = req.file.mimetype || "image/jpeg";
      const base64 = `data:${mime};base64,${buffer.toString("base64")}`;
      finalPhotoValue = base64;
    } finally {
      
      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      } catch (e) {
        console.warn("Failed to remove temp file:", e.message || e);
      }
    }

    
    work.afterphoto = finalPhotoValue;

    
    const totalAmount = Number(serviceCharge) || 0;
    let upiUri = null;
    let qrDataUrl = null; 
    const upiToUse = bodyUpiId && bodyUpiId.trim() ? bodyUpiId.trim() : (process.env.UPI_ID || "").trim();

    if (paymentMethod === "upi") {
      if (!upiToUse) {
        return res.status(400).json({ message: "UPI ID is required for UPI payment" });
      }

      const technician = await User.findById(technicianId);
      const payeeName = technician ? encodeURIComponent(technician.firstName || technician.name || "Technician") : "Technician";

      upiUri = `upi://pay?pa=${encodeURIComponent(upiToUse)}&pn=${payeeName}&am=${encodeURIComponent(String(totalAmount))}&cu=INR&tn=${encodeURIComponent("Service Payment")}`;

     
      try {
        qrDataUrl = await QRCode.toDataURL(upiUri);
      } catch (qrErr) {
        console.warn("QR generation failed:", qrErr.message || qrErr);
        qrDataUrl = null;
      }
    }

   
    const billData = {
      workId: work._id,
      technician: technicianId,
      client: work.client._id,
      serviceCharge: totalAmount,
      totalAmount,
      paymentMethod,
      status: "pending",
    };

    if (upiUri) billData.upiUri = upiUri;
    if (qrDataUrl) billData.qrImage = qrDataUrl; 

    const bill = await Bill.create(billData);

   
    let pdfFilePath = null;
    try {
      const pdfResult = await generateBillPDF({
        work,
        technicianId,
        client: work.client,
        serviceCharge: totalAmount,
        paymentMethod,
        totalAmount,
        qrDataUrl, 
        upiId: upiToUse,
        bill, 
      });

      if (pdfResult && pdfResult.filePath) pdfFilePath = pdfResult.filePath;
      else if (typeof pdfResult === "string") pdfFilePath = pdfResult;
      else if (pdfResult && pdfResult.buffer) {
        
        const tmpPdfPath = path.join(process.cwd(), `tmp_bill_${Date.now()}.pdf`);
        fs.writeFileSync(tmpPdfPath, pdfResult.buffer);
        pdfFilePath = tmpPdfPath;
      } else {
       
        pdfFilePath = null;
      }
    } catch (pdfErr) {
      console.warn("PDF generation failed:", pdfErr.message || pdfErr);
      pdfFilePath = null;
    }

    try {
      const attachments = [];

      if (pdfFilePath && fs.existsSync(pdfFilePath)) {
        const pdfBuf = fs.readFileSync(pdfFilePath);
        attachments.push({
          content: pdfBuf.toString("base64"),
          filename: "bill.pdf",
          type: "application/pdf",
          disposition: "attachment",
        });
      }

      if (qrDataUrl) {
   
        const qrBase64 = qrDataUrl.split(",")[1];
        attachments.push({
          content: qrBase64,
          filename: "upi-qr.png",
          type: "image/png",
          disposition: "inline",
          content_id: "qr_code",
        });
      }

      
      const emailHtml = `
        <p>Hello ${work.client.firstName || work.client.name || ""},</p>
        <p>Your service <strong>${work.serviceType || ""}</strong> has been completed.</p>
        <p><strong>Total Amount:</strong> ₹${totalAmount}</p>
        ${paymentMethod === "upi" && upiUri ? `
          <p><strong>Pay via UPI:</strong> <a href="${upiUri}">${upiUri}</a></p>
          ${qrDataUrl ? `<p>Or scan the QR code below:</p><img src="cid:qr_code" width="220" />` : ""}
        ` : `<p><strong>Payment Mode:</strong> Cash</p>`}
        <p>The invoice is attached.</p>
        <p>Thank you!</p>
      `;

    
      if (work.client.email) {
        await sendEmail(work.client.email, "Your Service Bill & Payment Details", emailHtml, attachments);
      } else {
        console.warn("Client has no email, skipping email send.");
      }

     
      try {
        if (pdfFilePath && pdfFilePath.includes("tmp_bill_") && fs.existsSync(pdfFilePath)) {
          fs.unlinkSync(pdfFilePath);
        }
      } catch (e) {
        console.warn("Failed to delete temp PDF:", e.message || e);
      }
    } catch (emailErr) {
      console.warn("Failed to send email:", emailErr.message || emailErr);
     
    }

    
    work.status = "completed";
    work.completedAt = new Date();
    work.billId = bill._id;
    await work.save();

   
    res.status(200).json({
      message: "Work completed: after-photo stored (cloudinary or base64), bill created, PDF/email attempted.",
      afterphoto: work.afterphoto, 
      bill,
      upiUri: bill.upiUri || null,
    });
  } catch (err) {
    console.error("COMPLETE WORK ERROR:", err);
    res.status(500).json({ message: "Error completing work", error: err.message || err });
  }
};
exports.getTechnicianSummary1 = async (req, res) => {
  try {
   
    const technicianId = req.user._id;

  
    const completedCount = await Work.countDocuments({
      assignedTechnician: technicianId,
      status: "completed",
    });

    const inProgressCount = await Work.countDocuments({
      assignedTechnician: technicianId,
      status: { $in: ["inprogress", "confirm"] },
    });

    const upcomingCount = await Work.countDocuments({
      assignedTechnician: technicianId,
      status: { $in: ["approved", "dispatch", "taken"] },
    });

    const onHoldCount = await Work.countDocuments({
      assignedTechnician: technicianId,
      status: { $in: ["onhold_parts", "rescheduled", "escalated"] },
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
        completed: completedCount,
        inProgress: inProgressCount,
        upcoming: upcomingCount,
        onHold: onHoldCount,
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

