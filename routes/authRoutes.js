const express = require('express');
const router = express.Router();
const Faculty = require('../models/Faculty');
const Guest = require('../models/Guest');

// Unified Smart Login
router.post('/voucher-login', async (req, res) => {
    try {
        const { voucherCode } = req.body;

        // 1. Check if it's a Faculty Member
        const faculty = await Faculty.findOne({ voucherCode: voucherCode, isActive: true });
        if (faculty) {
            return res.status(200).json({ 
                role: 'FACULTY', 
                name: faculty.fullName, 
                voucherCode: faculty.voucherCode 
            });
        }

        // 2. Check if it's a Guest
        const guest = await Guest.findOne({ voucherCode: voucherCode, isActive: true });
        if (guest) {
            // Check if guest pass is expired
            if (new Date() > new Date(guest.validTill)) {
                return res.status(400).json({ error: "This Guest Voucher has expired." });
            }
            return res.status(200).json({ 
                role: 'GUEST', 
                name: guest.guestName, 
                voucherCode: guest.voucherCode 
            });
        }

        // 3. If neither, reject it
        return res.status(404).json({ error: "Invalid or Expired Voucher Code" });

    } catch (error) {
        console.error("Auth Error:", error);
        res.status(500).json({ error: "Server error during login" });
    }
});

module.exports = router;