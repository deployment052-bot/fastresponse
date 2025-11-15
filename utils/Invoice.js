// utils/generateBill.js

const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

exports.generateBillPDF = async (
  work,
  technician,
  client,
  items,
  serviceCharge,
  paymentMethod,
  totalAmount,
  qrBuffer,       // 🆕 NEW → UPI QR buffer from controller
  upiId           // 🆕 NEW → dynamic UPI ID
) => {
  return new Promise(async (resolve, reject) => {
    try {
      // --------------------------------------------------
      //  Ensure invoices folder exists
      // --------------------------------------------------
      const invoicesFolder = path.join(__dirname, "../invoices");
      if (!fs.existsSync(invoicesFolder)) {
        fs.mkdirSync(invoicesFolder);
      }

      const fileName = `bill_${work._id}.pdf`;
      const filePath = path.join(invoicesFolder, fileName);

      const doc = new PDFDocument({ margin: 40 });

      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      // --------------------------------------------------
      // HEADER
      // --------------------------------------------------
      doc.fontSize(22).text("🧾 SERVICE BILL", { align: "center" });
      doc.moveDown(1.2);

      doc.fontSize(11).text(`Bill Date: ${new Date().toLocaleString()}`);
      doc.moveDown();

      // --------------------------------------------------
      // CUSTOMER DETAILS
      // --------------------------------------------------
      doc.fontSize(14).text("Client Details:", { underline: true });
      doc.fontSize(12)
        .text(`Name: ${client.firstName} ${client.lastName}`)
        .text(`Email: ${client.email}`)
        .text(`Phone: ${client.phone}`)
        .moveDown();

      // --------------------------------------------------
      // TECHNICIAN DETAILS
      // --------------------------------------------------
      doc.fontSize(14).text("Technician:", { underline: true });
      doc.fontSize(12)
        .text(`Name: ${technician.firstName} ${technician.lastName}`)
        .text(`Phone: ${technician.phone}`)
        .moveDown();

      // --------------------------------------------------
      // WORK DETAILS
      // --------------------------------------------------
      doc.fontSize(14).text("Work Details:", { underline: true });
      doc.fontSize(12)
        .text(`Work ID: ${work._id}`)
        .text(`Service Type: ${work.serviceType}`)
        .moveDown();

      // --------------------------------------------------
      // ITEMS TABLE
      // --------------------------------------------------
      doc.fontSize(14).text("Items Used:", { underline: true });
      doc.moveDown(0.5);

      if (items.length === 0) {
        doc.fontSize(12).text("No material items used.");
      } else {
        items.forEach((item, index) => {
          doc
            .fontSize(12)
            .text(
              `${index + 1}. ${item.name} — Qty: ${item.qty} × ₹${item.price} = ₹${
                item.price * item.qty
              }`
            );
        });
      }

      doc.moveDown();

      // --------------------------------------------------
      // BILL AMOUNT SUMMARY
      // --------------------------------------------------
      doc.fontSize(12).text(`Subtotal: ₹${items.reduce((a, b) => a + b.qty * b.price, 0)}`);
      doc.text(`Service Charge: ₹${serviceCharge}`);
      doc.text(`-----------------------------`);
      doc.fontSize(14).text(`Total Amount: ₹${totalAmount}`, { underline: true });

      doc.moveDown(1);

      // --------------------------------------------------
      // PAYMENT SECTION
      // --------------------------------------------------
      doc.fontSize(14).text("Payment Method:", { underline: true });
      doc.moveDown(0.5);

      if (paymentMethod === "cash") {
        doc.fontSize(12).text("💰 CASH PAYMENT");
        doc.text("Please pay the technician directly.");
      } else {
        doc.fontSize(12).text("📱 UPI PAYMENT");

        doc.text(`UPI ID: ${upiId}`, { underline: false });
        doc.moveDown(0.3);

        if (qrBuffer) {
          doc.text("Scan to Pay:", { align: "left" });
          doc.image(qrBuffer, {
            fit: [150, 150],
            align: "left",
          });
        }
      }

      doc.moveDown(1);

      // --------------------------------------------------
      // FOOTER
      // --------------------------------------------------
      doc.fontSize(12).text("Thank you for choosing our service!", { align: "center" });
      doc.fontSize(9).text("This is a system-generated bill.", { align: "center" });

      doc.end();

      writeStream.on("finish", () => resolve({ filePath }));
      writeStream.on("error", reject);

    } catch (err) {
      reject(err);
    }
  });
};
