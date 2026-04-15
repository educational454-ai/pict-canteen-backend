const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Faculty = require('../models/Faculty');
const Guest = require('../models/Guest');

router.post('/place', async (req, res) => {
    try {
        const { voucherCode, items, totalAmount } = req.body;
        
        // ==========================================
        // SECURITY CHECK 1: CATEGORY LIMITS FOR TODAY
        // ==========================================
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0); 
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999); 

        const todaysOrders = await Order.find({
            voucherCode: voucherCode,
            orderDate: { $gte: startOfDay, $lte: endOfDay }
        });

        const consumedCategories = new Set();
        todaysOrders.forEach(order => {
            order.items.forEach(item => {
                if (item.category) consumedCategories.add(item.category);
            });
        });

        for (let currentItem of items) {
            if (consumedCategories.has(currentItem.category)) {
                return res.status(400).json({ 
                    error: `Limit Exceeded: You have already ordered an item from the '${currentItem.category}' category today.` 
                });
            }
        }

        // ==========================================
        // SECURITY CHECK 2: VALIDATE VOUCHER
        // ==========================================
        let targetFacultyId;
        let targetDepartmentId;
        let validFrom, validTill, isActive;

        const faculty = await Faculty.findOne({ voucherCode: voucherCode });
        if (faculty) {
            targetFacultyId = faculty._id;
            targetDepartmentId = faculty.departmentId;
            validFrom = new Date(faculty.validFrom);
            validTill = new Date(faculty.validTill);
            isActive = faculty.isActive;
        } else {
            const guest = await Guest.findOne({ voucherCode: voucherCode });
            if (!guest) return res.status(404).json({ error: "Invalid voucher code" });
            
            targetFacultyId = guest.facultyId;
            targetDepartmentId = guest.departmentId;
            validFrom = new Date(guest.validFrom);
            validTill = new Date(guest.validTill);
            isActive = guest.isActive;
        }

        validTill.setHours(23, 59, 59, 999);
        const now = new Date();

        if (!isActive || now < validFrom || now > validTill) {
            return res.status(400).json({ error: "Access Denied: Your voucher is expired or inactive." });
        }

        // ==========================================
        // CREATE ORDER IF ALL CHECKS PASS
        // ==========================================
        const newOrder = new Order({
            facultyId: targetFacultyId,
            departmentId: targetDepartmentId,
            voucherCode: voucherCode, 
            items: items, 
            totalAmount: totalAmount
        });

        await newOrder.save();
        res.status(201).json({ message: "Order placed successfully" });

    } catch (error) {
        console.error("Order Placement Error:", error);
        res.status(500).json({ error: "Failed to place order" });
    }
});

//Fetch orders for a specific department's report (Used by Coordinator)
router.get('/department/:deptId', async (req, res) => {
    try {
        const orders = await Order.find({ departmentId: req.params.deptId })
            // 🚀 THE FIX: Added 'academicYear' to the populated fields list
            .populate('facultyId', 'fullName voucherCode academicYear') 
            .sort({ orderDate: -1 }); 
            
        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch department orders" });
    }
});

//GET ALL Orders (For Canteen Manager / Admin)
router.get('/all', async (req, res) => {
    try {
        const orders = await Order.find()
            // 🚀 THE FIX: Added 'academicYear' here as well
            .populate('facultyId', 'fullName voucherCode academicYear') 
            .populate('departmentId', 'name')
            .sort({ createdAt: -1 })
            .lean(); 
            
        const guests = await Guest.find({}, 'voucherCode guestName').lean();
        const guestMap = {};
        guests.forEach(g => {
            guestMap[g.voucherCode] = g.guestName;
        });

        const enrichedOrders = orders.map(order => {
            if (order.voucherCode && order.voucherCode.startsWith('G-')) {
                order.guestName = guestMap[order.voucherCode] || 'Unknown Guest';
            }
            return order;
        });

        res.status(200).json(enrichedOrders);
    } catch (error) {
        console.error("🚨 BACKEND CRASH in /orders/all:", error);
        res.status(500).json({ error: "Failed to fetch all orders", details: error.message });
    }
});

// UPDATE ORDER STATUS (For Canteen Manager)
router.put('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['Pending', 'Preparing', 'Ready', 'Completed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: "Invalid status value provided." });
        }

        const updatedOrder = await Order.findByIdAndUpdate(
            req.params.id,
            { status: status },
            { new: true }
        );

        if (!updatedOrder) {
            return res.status(404).json({ error: "Order not found." });
        }

        res.status(200).json({ message: "Order status updated successfully", order: updatedOrder });
    } catch (error) {
        console.error("Error updating order status:", error);
        res.status(500).json({ error: "Failed to update order status" });
    }
});

// DELETE an order (Used for the 'Cancel' action)
router.delete('/delete/:id', async (req, res) => {
    try {
        const deletedOrder = await Order.findByIdAndDelete(req.params.id);
        if (!deletedOrder) {
            return res.status(404).json({ error: "Order not found." });
        }
        res.status(200).json({ message: "Order deleted successfully from database." });
    } catch (error) {
        console.error("Delete Order Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// 🚀 UPDATED: GET ALL PAST ORDERS (FACULTY + THEIR GUESTS)
router.get('/history/:voucher', async (req, res) => {
    try {
        // 1. Find the master faculty
        const faculty = await Faculty.findOne({ voucherCode: req.params.voucher });
        if (!faculty) return res.status(404).json({ error: "Faculty not found" });

        // 2. Fetch all orders where this faculty acted as the host (both for themselves and their guests)
        const orders = await Order.find({ facultyId: faculty._id })
            .sort({ createdAt: -1 })
            .lean();

        // 3. Match guest names so the faculty knows who they ordered for
        const guests = await Guest.find({ facultyId: faculty._id }, 'voucherCode guestName').lean();
        const guestMap = {};
        guests.forEach(g => {
            guestMap[g.voucherCode] = g.guestName;
        });

        const enrichedOrders = orders.map(order => {
            if (order.voucherCode && order.voucherCode.startsWith('G-')) {
                order.guestName = guestMap[order.voucherCode] || 'Unknown Guest';
            }
            return order;
        });

        res.status(200).json(enrichedOrders);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch order history" });
    }
});

// SUBMIT FEEDBACK FOR A SPECIFIC ORDER
router.put('/feedback/:id', async (req, res) => {
    try {
        const { rating, feedbackText } = req.body;
        const updatedOrder = await Order.findByIdAndUpdate(
            req.params.id, 
            { rating, feedbackText }, 
            { new: true }
        );
        res.status(200).json(updatedOrder);
    } catch (err) {
        res.status(500).json({ error: "Failed to submit feedback" });
    }
});

module.exports = router;