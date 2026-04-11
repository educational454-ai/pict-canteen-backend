const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Department = require('../models/Department');

// Route: Get Department-wise Billing Report
router.get('/billing-summary', async (req, res) => {
    try {
        // This 'aggregate' function sums up all totalAmounts grouped by departmentId
        const report = await Order.aggregate([
            {
                $group: {
                    _id: "$departmentId", 
                    totalAmount: { $sum: "$totalAmount" },
                    totalOrders: { $count: {} }
                }
            },
            {
                // This 'lookup' step joins our Order data with the Department names
                $lookup: {
                    from: "departments",
                    localField: "_id",
                    foreignField: "_id",
                    as: "departmentDetails"
                }
            },
            { $unwind: "$departmentDetails" },
            {
                // This cleans up the final look of our data
                $project: {
                    departmentName: "$departmentDetails.name",
                    departmentCode: "$departmentDetails.code",
                    totalAmount: 1,
                    totalOrders: 1,
                    _id: 0
                }
            }
        ]);

        res.status(200).json(report);
    } catch (error) {
        res.status(500).json({ error: "Failed to generate report", details: error.message });
    }
});

module.exports = router;