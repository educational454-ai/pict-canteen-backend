const express = require('express');
const router = express.Router();
const Department = require('../models/Department');

// Route: Add a new Department
// Method: POST
router.post('/add', async (req, res) => {
    try {
        const { name, code } = req.body;

        const newDepartment = new Department({
            name: name,
            code: code
        });

        await newDepartment.save();
        res.status(201).json({ message: "Department added successfully!", department: newDepartment });

    } catch (error) {
        res.status(400).json({ error: "Failed to add department", details: error.message });
    }
});

// GET ALL Departments
router.get('/all', async (req, res) => {
    try {
        const departments = await Department.find().sort({ deptName: 1 });
        res.status(200).json(departments);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch departments" });
    }
});

// 🚨 SECRET CHEAT ROUTE
router.get('/setup-demo-departments', async (req, res) => {
    try {
        const deptsToCreate = [
            { name: "Computer Engineering", code: "CE" },
            { name: "Information Technology", code: "IT" },
            { name: "Electronics & Telecom", code: "ENTC" },
            { name: "First Year Engineering", code: "FE" }
        ];
        
        // Insert them into MongoDB
        await Department.insertMany(deptsToCreate);
        res.status(201).json({ message: "Success! Departments created." });
    } catch (error) {
        res.status(500).json({ error: "Failed to create", details: error.message });
    }
});

// 🚨 CHEAT ROUTE 2: Fix existing Faculty accounts
router.get('/fix-faculty', async (req, res) => {
    try {
        const Department = require('../models/Department');
        const Faculty = require('../models/Faculty');
        
        // 1. Grab the first valid department (e.g., Computer Engineering)
        const validDept = await Department.findOne();
        if (!validDept) return res.send("No departments exist!");

        // 2. Update EVERY faculty member to use this valid Department ID
        await Faculty.updateMany({}, { departmentId: validDept._id });
        
        res.send(`✅ SUCCESS! All faculty members are now safely linked to: ${validDept.name}`);
    } catch (err) {
        res.send("Error: " + err.message);
    }
});

// 🚨 CHEAT ROUTE 3: Fix old broken orders
router.get('/fix-orders', async (req, res) => {
    try {
        const Department = require('../models/Department');
        const Order = require('../models/Order');
        
        // Grab the first valid department
        const validDept = await Department.findOne();
        if (!validDept) return res.send("No departments exist!");

        // Find any order where the departmentId is missing or null, and fix it!
        const result = await Order.updateMany(
            { $or: [{ departmentId: { $exists: false } }, { departmentId: null }] },
            { $set: { departmentId: validDept._id } }
        );
        
        res.send(`✅ SUCCESS! Fixed ${result.modifiedCount} old orders to show: ${validDept.name}`);
    } catch (err) {
        res.send("Error: " + err.message);
    }
});

module.exports = router;