const express = require('express');
const nodemailer = require('nodemailer');
const router = express.Router();

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// Create Brevo SMTP transporter
const transporter = nodemailer.createTransport({
  host: process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com',
  port: process.env.BREVO_SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_SMTP_PASS
  }
});

// Helper function to send email with retry
const sendEmail = async (mailOptions) => {
  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        reject(error);
      } else {
        resolve(info);
      }
    });
  });
};

// Send email to single recipient
router.post('/send-mail', async (req, res) => {
  try {
    const { to, subject, message } = req.body;

    if (!to || !subject || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'to, subject, and message are required' 
      });
    }

    const mailOptions = {
      from: process.env.BREVO_MAIL_FROM || process.env.BREVO_SMTP_USER,
      to,
      subject,
      text: message,
      html: `<pre style="white-space: pre-wrap; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111;">${escapeHtml(message)}</pre><p style="font-size: 12px; color: #666; margin-top: 20px;">Sent from PICT Canteen Management</p>`
    };

    const info = await sendEmail(mailOptions);

    return res.status(200).json({ 
      success: true, 
      message: 'Email sent successfully', 
      messageId: info.messageId 
    });
  } catch (err) {
    console.error('Email send error:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to send email', 
      error: err.message 
    });
  }
});

// Send bulk emails with batching
router.post('/send-bulk-mail', async (req, res) => {
  try {
    const { recipients, subject, message } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'recipients array is required' 
      });
    }

    if (!subject || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'subject and message are required' 
      });
    }

    const batchSize = 10;
    const results = { sent: 0, failed: 0, errors: [] };

    // Send emails in batches with delays
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);

      const promises = batch.map(async (email) => {
        try {
          const mailOptions = {
            from: process.env.BREVO_MAIL_FROM || process.env.BREVO_SMTP_USER,
            to: email,
            subject,
            text: message,
            html: `<pre style="white-space: pre-wrap; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111;">${escapeHtml(message)}</pre><p style="font-size: 12px; color: #666; margin-top: 20px;">Sent from PICT Canteen Management</p>`
          };

          await sendEmail(mailOptions);
          results.sent++;
        } catch (err) {
          results.failed++;
          results.errors.push({ email, error: err.message });
        }
      });

      await Promise.all(promises);

      // Add delay between batches (except after last batch)
      if (i + batchSize < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    return res.status(200).json({ 
      success: true, 
      message: `Bulk email sending completed`, 
      results 
    });
  } catch (err) {
    console.error('Bulk email send error:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to send bulk emails', 
      error: err.message 
    });
  }
});

module.exports = router;
