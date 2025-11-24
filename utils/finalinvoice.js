const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");


const projectRoot = process.cwd();
const invoicesFolder = path.join(projectRoot, "invoices");

if (!fs.existsSync(invoicesFolder)) {
  fs.mkdirSync(invoicesFolder, { recursive: true });
}

const formatCurrency = (n) => `Rs.${(Number(n) || 0).toFixed(2)}`;
const formatDate = (d) => {
  const date = d ? new Date(d) : new Date();
  return `${String(date.getDate()).padStart(2, "0")}/${String(
    date.getMonth() + 1
  ).padStart(2, "0")}/${date.getFullYear()}`;
};

exports.generatePaymentReceiptPDF = async (work, technician, client, filePath) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });

      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      const colors = {
        dark: "#222222",
        muted: "#666666",
        accent: "#3F51B5",
        line: "#DDDDDD",
      };

      const font = {
        regular: "Helvetica",
        bold: "Helvetica-Bold",
      };

      const pageWidth = doc.page.width;
      const pageMargin = 50;
      const usableWidth = pageWidth - pageMargin * 2;

      const drawLine = (y) => {
        doc.strokeColor(colors.line)
          .lineWidth(1)
          .moveTo(pageMargin, y)
          .lineTo(pageWidth - pageMargin, y)
          .stroke();
      };

      
      const leftX = pageMargin;
      const rightX = pageWidth - pageMargin - 200;

      doc.fillColor(colors.dark)
        .font(font.bold)
        .fontSize(34)
        .text("Payment Receipt", leftX, pageMargin);

      doc.font(font.bold)
        .fontSize(11)
        .text("FAST RESPONSE", rightX, pageMargin, { align: "right" });

      doc.font(font.regular)
        .fontSize(10)
        .text("I-TECH SPAZE PARK", rightX, pageMargin + 18, { align: "right" })
        .text("GURGAO, HARIYANA", { align: "right" })
        .text("Phone: +91 ", { align: "right" });

      const afterHeader = pageMargin + 70;

     
      let leftY = afterHeader;

      doc.font(font.bold).fontSize(12).fillColor(colors.accent).text("To", leftX, leftY);
      leftY += 16;

      doc.font(font.regular).fontSize(11).fillColor(colors.dark);
      doc.text(`${client.firstName || ""} ${client.lastName || ""}`.trim() || "N/A", leftX, leftY);
      leftY += 14;
      doc.text(client.email || "N/A", leftX, leftY);
      leftY += 14;
      doc.text(client.phone || "N/A", leftX, leftY);
      leftY += 20;

      // ---------- TECHNICIAN ----------
      doc.font(font.bold).fontSize(12).fillColor(colors.accent).text("Technician", leftX, leftY);
      leftY += 16;

      doc.font(font.regular).fontSize(11);
      doc.text(`${technician.firstName } ${technician.lastName || ""}`.trim() || "N/A", leftX, leftY);
      leftY += 14;
      doc.text(technician.phone || "N/A", leftX, leftY);
      leftY += 14;
      technician.email && doc.text(technician.email, leftX, leftY);

      // ---------- RECEIPT META ----------
      let rightY = afterHeader;

      const metaBlock = [
        ["Receipt Date", formatDate(work.payment.confirmedAt)],
        ["Receipt No.", `RCT-${work.token}`],
        ["Paid Amount", formatCurrency(work.serviceCharge)],
        ["Payment Method", work.payment.method.toUpperCase()],
      ];

      metaBlock.forEach(([label, value]) => {
        doc.font(font.bold).fontSize(11).fillColor(colors.accent).text(label, rightX, rightY, {
          align: "right",
        });
        rightY += 14;

        doc.font(font.regular).fontSize(11).fillColor(colors.dark).text(value, rightX, rightY, {
          align: "right",
        });
        rightY += 22;
      });

      const separatorY = Math.max(leftY, rightY) + 10;
      drawLine(separatorY);

      // ---------- WORK SUMMARY ----------
      let workY = separatorY + 20;

      doc.font(font.bold).fontSize(14).fillColor(colors.dark).text("Payment Summary", leftX, workY);
      workY += 20;

      doc.font(font.regular).fontSize(11);
      doc.text(`Work ID: ${work.token}`, leftX, workY);
      workY += 14;
      doc.text(`Service Type: ${work.serviceType}`, leftX, workY);
      workY += 14;
      doc.text(`Payment Status: ${work.payment.status}`, leftX, workY);
      workY += 14;
      doc.text(`Paid At: ${new Date(work.payment.paidAt).toLocaleString()}`, leftX, workY);
      workY += 20;

      drawLine(workY);

      // ---------- AMOUNT BREAKDOWN ----------
      workY += 20;

      const sumX = pageWidth - pageMargin - 200;

      const putSummary = (label, val, bold = false) => {
        doc.font(bold ? font.bold : font.regular)
          .fontSize(11)
          .fillColor(colors.dark);

        doc.text(label, sumX, workY);
        doc.text(val, sumX + 120, workY, { width: 80, align: "right" });
        workY += 18;
      };

      putSummary("Service Charge:", formatCurrency(work.serviceCharge));
      putSummary("Tax:", formatCurrency(0));
      putSummary("Total Paid:", formatCurrency(work.serviceCharge), true);

      // ---------- FOOTER ----------
      let footerY = workY + 40;
      drawLine(footerY);

      doc.font(font.regular)
        .fontSize(10)
        .fillColor(colors.muted)
        .text("Thank you for your payment!", leftX, footerY + 14)
        .text("Your business is appreciated.", leftX, footerY + 30);

      // FINISH
      doc.end();

      stream.on("finish", () => resolve({ filePath }));
      stream.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
};
