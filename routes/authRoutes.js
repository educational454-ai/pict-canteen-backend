const express = require('express');
const router = express.Router();
const Faculty = require('../models/Faculty');
const Guest = require('../models/Guest');

const isVoucherActiveInDateRange = (validFrom, validTill, now = new Date()) => {
    const from = new Date(validFrom);
    const till = new Date(validTill);

    from.setHours(0, 0, 0, 0);
    till.setHours(23, 59, 59, 999);

    return now >= from && now <= till;
};

// Unified Smart Login
router.post('/voucher-login', async (req, res) => {
    try {
        const { voucherCode } = req.body;
        const now = new Date();

        // 1. Check if it's a Faculty Member
        const faculty = await Faculty.findOne({ voucherCode: voucherCode, isActive: true });
        if (faculty) {
            if (!isVoucherActiveInDateRange(faculty.validFrom, faculty.validTill, now)) {
                return res.status(400).json({ error: "This Faculty Voucher is not active for the current date." });
            }
            return res.status(200).json({ 
                role: 'FACULTY', 
                name: faculty.fullName, 
                voucherCode: faculty.voucherCode 
            });
        }

        // 2. Check if it's a Guest
        const guest = await Guest.findOne({ voucherCode: voucherCode, isActive: true });
        if (guest) {
            if (!isVoucherActiveInDateRange(guest.validFrom, guest.validTill, now)) {
                return res.status(400).json({ error: "This Guest Voucher is not active for the current date." });
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