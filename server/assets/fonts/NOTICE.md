# Bundled fonts

`Roboto-Regular.ttf` and `Roboto-Bold.ttf` are the Roboto family by Google,
licensed under the **Apache License, Version 2.0**
(https://www.apache.org/licenses/LICENSE-2.0).

They are embedded into the payment-receipt PDFs (`server/lib/receiptPdf.js`)
because Roboto includes the Indian Rupee sign ₹ (U+20B9), which PDFKit's built-in
Helvetica (AFM) does not. Source: Google Fonts (https://fonts.google.com/specimen/Roboto).
