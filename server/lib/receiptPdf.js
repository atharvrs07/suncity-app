// Payment receipt PDF (2026-07 batch). Turns the receipt payload the dues route
// builds — plus the itemized month/due breakdown from payment_allocations — into
// a one-page PDF Buffer that the mailer attaches to the receipt email.
//
// pdfkit is pure-JS (no native / Chromium deps), so it fits the single-process
// deploy. Amounts render with the ₹ sign using the bundled Roboto TTFs
// (server/assets/fonts) — pdfkit's built-in Helvetica (AFM) has no ₹ (U+20B9)
// glyph. If the font files are ever missing we fall back to Helvetica + "Rs.".
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const INK = '#232634';
const MUTED = '#5d6175';
const LINE = '#e6e8f0';
const GREEN = '#1fa060';
const ORANGE = '#e0851a';

const FONT_REGULAR = path.join(__dirname, '../assets/fonts/Roboto-Regular.ttf');
const FONT_BOLD = path.join(__dirname, '../assets/fonts/Roboto-Bold.ttf');
const FONTS_AVAILABLE = fs.existsSync(FONT_REGULAR) && fs.existsSync(FONT_BOLD);

// Build the receipt PDF. Resolves to a Buffer.
//  - receipt:  { receiptNo, resident, txnId, txnDateTime, paidOn, society, amountValue }
//  - items:    [{ periodLabel, amount }]  (the dues/months this payment was applied to)
//  - provisional: true → AI-pass provisional receipt; false → verified/permanent
function buildReceiptPdf({ receipt, items = [], provisional = false }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Prefer the embedded Roboto (has ₹); fall back to Helvetica + "Rs." if the
      // TTFs are missing so a receipt is still produced rather than crashing.
      let F = 'Helvetica';
      let FB = 'Helvetica-Bold';
      let CUR = 'Rs. ';
      if (FONTS_AVAILABLE) {
        doc.registerFont('body', FONT_REGULAR);
        doc.registerFont('body-bold', FONT_BOLD);
        F = 'body';
        FB = 'body-bold';
        CUR = '₹';
      }
      const rupee = (n) => CUR + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

      const {
        receiptNo,
        resident,
        txnId,
        txnDateTime,
        paidOn,
        society = 'SunCity Vistaar - Jan Kalyan Samiti',
      } = receipt || {};

      // Fall back to a single line if no allocation items were supplied.
      const lines =
        items && items.length
          ? items
          : receipt && receipt.periodLabel
            ? [{ periodLabel: receipt.periodLabel, amount: receipt.amountValue || 0 }]
            : [];
      const total = lines.reduce((s, it) => s + Number(it.amount || 0), 0);

      const accent = provisional ? ORANGE : GREEN;
      const bannerText = provisional
        ? 'PROVISIONAL RECEIPT — SUBJECT TO PAYMENT VERIFICATION BY SOCIETY'
        : 'VERIFIED BY SOCIETY';
      const heading = provisional ? 'Provisional Payment Receipt' : 'Payment Receipt';

      const left = doc.page.margins.left;
      const right = doc.page.width - doc.page.margins.right;
      const width = right - left;

      // Coloured banner.
      doc.rect(left, doc.y, width, 26).fill(accent);
      doc
        .fillColor('#ffffff')
        .fontSize(9)
        .font(FB)
        .text(bannerText, left + 10, doc.y - 26 + 8, { width: width - 20, align: 'center' });
      doc.moveDown(1.2);

      // Society + heading.
      doc.fillColor(INK).font(FB).fontSize(18).text(society, left, doc.y);
      doc.fillColor(MUTED).font(F).fontSize(11).text(heading);
      doc.moveDown(1);

      // Meta rows.
      const meta = [
        ['Receipt No.', receiptNo || '—'],
        ['Resident', resident || '—'],
        ['Transaction ID', txnId || '—'],
        ['Payment date/time', txnDateTime || '—'],
        ['Recorded on', paidOn || '—'],
      ];
      doc.fontSize(11);
      for (const [k, v] of meta) {
        const y = doc.y;
        doc.fillColor(MUTED).font(F).text(k, left, y, { width: 160 });
        doc.fillColor(INK).font(FB).text(String(v), left + 160, y, { width: width - 160 });
        doc.moveDown(0.35);
      }
      doc.moveDown(0.8);

      // Itemized table header.
      doc.fillColor(INK).font(FB).fontSize(12).text('Payment applied to', left, doc.y);
      doc.moveDown(0.4);
      const amtColW = 130;
      const rowH = 22;

      const drawRow = (label, amount, opts = {}) => {
        const y = doc.y;
        if (opts.fill) {
          doc.rect(left, y - 3, width, rowH).fill(opts.fill);
        }
        doc
          .fillColor(INK)
          .font(opts.bold ? FB : F)
          .fontSize(11)
          .text(label, left + 8, y + 3, { width: width - amtColW - 16 });
        doc.font(opts.bold ? FB : F).text(amount, right - amtColW - 8, y + 3, { width: amtColW, align: 'right' });
        doc.y = y + rowH;
        doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor(LINE).lineWidth(0.5).stroke();
      };

      // Column header strip.
      drawRow('Month / Due', 'Amount', { fill: '#f3f5fb', bold: true });
      if (lines.length) {
        for (const it of lines) drawRow(it.periodLabel || '—', rupee(it.amount));
      } else {
        drawRow('—', rupee(0));
      }
      // Total.
      doc.moveDown(0.2);
      drawRow('Total paid', rupee(total), { bold: true });

      doc.moveDown(1.2);
      doc
        .fillColor(MUTED)
        .font(F)
        .fontSize(9.5)
        .text(
          provisional
            ? 'This is a provisional acknowledgement generated after an automated check of your payment screenshot. It is subject to final verification by the society office. A permanent receipt will follow once verified.'
            : 'This payment has been verified by the society office. This is your final receipt.',
          left,
          doc.y,
          { width }
        );
      doc.moveDown(0.6);
      doc.fillColor(MUTED).font(F).fontSize(9).text(`— ${society}`, { width });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildReceiptPdf };
