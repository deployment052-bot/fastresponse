// utils/generateBill.js

const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

exports.generateBillPDF = async (
  work,
  technician,
  client,
  serviceCharge,
  paymentMethod,
  totalAmount,
  qrBuffer,
  upiId
) => {
  return new Promise(async (resolve, reject) => {
    try {
      const invoicesFolder = path.join(__dirname, "../invoices");
      if (!fs.existsSync(invoicesFolder)) fs.mkdirSync(invoicesFolder);

      const filePath = path.join(invoicesFolder, `bill_${work._id}.pdf`);

      const doc = new PDFDocument({ margin: 40 });
      doc.pipe(fs.createWriteStream(filePath));

      // HEADER
      doc.fontSize(22).text("SERVICE BILL", { align: "center" }).moveDown();
      doc.fontSize(11).text(`Bill Date: ${new Date().toLocaleString()}`).moveDown();

      // CLIENT
      doc.fontSize(14).text("Client Details:", { underline: true });
      doc.fontSize(12)
        .text(`Name: ${client.firstName} ${client.lastName}`)
        .text(`Email: ${client.email}`)
        .text(`Phone: ${client.phone}`)
        .moveDown();

      // TECHNICIAN
      doc.fontSize(14).text("Technician Details:", { underline: true });
      doc.fontSize(12)
        .text(`Name: ${technician.firstName} ${technician.lastName}`)
        .text(`Phone: ${technician.phone}`)
        .moveDown();

      // WORK DETAILS
      doc.fontSize(14).text("Work Details:", { underline: true });
      doc.fontSize(12)
        .text(`Work ID: ${work._id}`)
        .text(`Service Type: ${work.serviceType}`)
        .moveDown();

      // BILL AMOUNT (NO ITEMS)
      doc.fontSize(14).text("Bill Summary:", { underline: true });
      doc.fontSize(12)
        .text(`Service Charge: ${serviceCharge}`)
        .text(`-----------------------------`);
      doc.fontSize(14).text(`Total Amount: ${totalAmount}`, { underline: true });

      doc.moveDown();

      // PAYMENT
      doc.fontSize(14).text("Payment Method:", { underline: true }).moveDown(0.5);

      if (paymentMethod === "upi") {
        doc.fontSize(12).text(`UPI ID: ${upiId}`);
        doc.moveDown();

        if (qrBuffer) {
          doc.text("Scan to Pay:");
          doc.image(qrBuffer, { fit: [150, 150] });
        }
      } else {
        doc.fontSize(12).text("Cash Payment - Pay directly to technician");
      }

      doc.moveDown(2);
      doc.fontSize(12).text("Thank you for choosing our service!", { align: "center" });

      doc.end();

      resolve({ filePath });

    } catch (err) {
      reject(err);
    }
  });
};
