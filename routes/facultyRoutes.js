const express = require('express');
const router = express.Router();
const Faculty = require('../models/Faculty');
const Department = require('../models/Department');
const nodemailer = require('nodemailer');
const multer = require('multer');
const XLSX = require('xlsx');
const upload = multer({ storage: multer.memoryStorage() });

// Get all faculty for the dashboard
router.get('/all', async (req, res) => {
    try {
        const list = await Faculty.find().sort({ createdAt: -1 });
        res.status(200).json(list);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch faculty" });
    }
});

router.post('/bulk-upload-file', upload.single('file'), async (req, res) => {
    try {
        const { departmentId, deptName } = req.body; 
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        const facultyMap = new Map();
        const coordinatorDept = deptName.trim(); // Exact DB name: "Computer Engineering", etc.

        rawData.forEach((row) => {
            // Helper to handle messy Excel headers (dots/spaces)
            const getVal = (searchKey) => {
                const normalizedSearch = searchKey.replace(/[^a-z]/gi, '').toLowerCase();
                const actualKey = Object.keys(row).find(k => 
                    k.replace(/[^a-z]/gi, '').toLowerCase() === normalizedSearch
                );
                return actualKey ? String(row[actualKey]).trim() : "";
            };

            const patternName = getVal('Pattern Name').toUpperCase();
            if (!patternName) return;

            // 🚀 SMART PICT FILTERING (Based on your DB JSON)
            let isMyDeptRow = false;

            // 1. Computer Engineering
            if (coordinatorDept === "Computer Engineering") {
                // Must have COMPUTER but NOT ELECTRONICS (taki ECE wali rows skip ho jayein)
                if (patternName.includes("COMPUTER") && !patternName.includes("ELECTRONICS")) {
                    isMyDeptRow = true;
                }
            } 
            // 2. Information Technology
            else if (coordinatorDept === "Information Technology") {
                if (patternName.includes("INFORMATION TECHNOLOGY")) isMyDeptRow = true;
            }
            // 3. Electronics & TeleCommunication
            else if (coordinatorDept === "Electronics & TeleCommunication") {
                if (patternName.includes("ELECTRONICS") && (patternName.includes("TELECOMMUNICATION") || patternName.includes("TELECOM"))) {
                    isMyDeptRow = true;
                }
            }
            // 4. Electronics & Computer
            else if (coordinatorDept === "Electronics & Computer") {
                // Must have BOTH keywords
                if (patternName.includes("ELECTRONICS") && patternName.includes("COMPUTER")) {
                    isMyDeptRow = true;
                }
            }
            // 5. Artificial Intelligance & Data Science
            else if (coordinatorDept.includes("Artificial")) {
                if (patternName.includes("ARTIFICIAL") || patternName.includes("DATA SCIENCE") || patternName.includes("AIDS")) {
                    isMyDeptRow = true;
                }
            }

            if (!isMyDeptRow) return;

            const mobile = getVal('Mobile No'); 
            const rawName = getVal('Internal Examiner');

            if (!mobile || mobile.length < 5 || !rawName) return;

            // Clean name: (ID)-Name -> Name
            const cleanedName = rawName.includes(')-') ? rawName.split(')-')[1].trim() : rawName;
            
            // PICT Pattern Year Mapping
            let yearScope = "2nd Yr (Regular)";
            if (patternName.includes("T.E.")) yearScope = "3rd Yr (Regular)";
            else if (patternName.includes("B.E.")) yearScope = "4th Yr (Regular)";

            // Subject Processing
            const fromDateStr = getVal('From Date') ? new Date(getVal('From Date')).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
            const endDateStr = getVal('End Date') ? new Date(getVal('End Date')).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
            const subject = getVal('Subject Name');
            const subjectEntry = `${fromDateStr}|${endDateStr}|${subject}`;

            if (facultyMap.has(mobile)) {
                const existing = facultyMap.get(mobile);
                if (!existing.assignedSubjects.includes(subjectEntry)) {
                    existing.assignedSubjects.push(subjectEntry);
                }
            } else {
                facultyMap.set(mobile, {
                    fullName: cleanedName,
                    mobile,
                    departmentId,
                    email: `${cleanedName.split(' ')[0].toLowerCase()}@pict.edu`,
                    academicYear: yearScope,
                    validFrom: new Date(fromDateStr),
                    validTill: new Date(endDateStr),
                    assignedSubjects: [subjectEntry],
                    isActive: true
                });
            }
        });

        const finalDataArray = Array.from(facultyMap.values());
        
        if (finalDataArray.length === 0) {
            return res.status(200).json({ success: true, added: 0, updated: 0 });
        }

        const bulkOps = finalDataArray.map(data => {
            const randomID = Math.floor(1000 + Math.random() * 9000);
            return {
                updateOne: {
                    filter: { mobile: data.mobile, departmentId: data.departmentId },
                    update: { 
                        $set: data,
                        $setOnInsert: { voucherCode: `PICT-${deptName.substring(0,2).toUpperCase()}-${randomID}` }
                    },
                    upsert: true
                }
            };
        });

        const result = await Faculty.bulkWrite(bulkOps);

        res.status(201).json({ 
            success: true,
            added: result.upsertedCount, 
            updated: result.modifiedCount 
        });

    } catch (error) {
        console.error("PICT Master Bulk Error:", error);
        res.status(500).json({ error: "Excel upload failed" });
    }
});

// backend/routes/facultyRoutes.js - Bulk Add Optimized
router.post('/bulk-add', async (req, res) => {
    try {
        const facultyList = req.body;
        if (!facultyList || facultyList.length === 0) return res.status(400).json({ error: "No data" });

        const dept = await Department.findById(facultyList[0].departmentId);
        
        // Prepare bulk operations array
        const bulkOps = facultyList.map(data => {
            const randomID = Math.floor(1000 + Math.random() * 9000);
            const voucherCode = `PICT-${dept.code || 'DEPT'}-${randomID}`;

            return {
                updateOne: {
                    filter: { 
                        mobile: data.mobile, 
                        departmentId: data.departmentId,
                        academicYear: data.academicYear 
                    },
                    update: {
                        $set: {
                            fullName: data.fullName,
                            email: data.email,
                            validFrom: new Date(data.validFrom),
                            validTill: new Date(data.validTill),
                            assignedSubjects: data.assignedSubjects || [],
                            isActive: true
                        },
                        $setOnInsert: { 
                            voucherCode: voucherCode 
                        }
                    },
                    upsert: true // Agar mobile match nahi hua toh insert karega
                }
            };
        });

        // 🚀 Sabse important line: Ek single call database ko!
        const result = await Faculty.bulkWrite(bulkOps);

        res.status(201).json({ 
            message: "Bulk processing complete", 
            added: result.upsertedCount, 
            extended: result.modifiedCount 
        });
    } catch (error) {
        console.error("Bulk Error:", error);
        res.status(500).json({ error: "Import failed", details: error.message });
    }
});


// Get ONLY ACTIVE faculty for a specific department
router.get('/department/:deptId', async (req, res) => {
    try {
        const list = await Faculty.find({ 
            departmentId: req.params.deptId,
            isActive: true 
        }).sort({ createdAt: -1 });
        
        res.status(200).json(list);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch department faculty" });
    }
});

// Configure Nodemailer 
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'YOUR_EMAIL@gmail.com', 
        pass: 'YOUR_GMAIL_APP_PASSWORD' 
    }
});

// SOFT DELETE a single Faculty
router.delete('/remove/:id', async (req, res) => {
    try {
        await Faculty.findByIdAndUpdate(req.params.id, { isActive: false });
        res.status(200).json({ message: "Faculty removed successfully" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete" });
    }
});

// Add Single Faculty Manually
router.post('/add', async (req, res) => {
    try {
        // 🚀 THE FIX: Extract 'assignedSubject' from the request
        const { fullName, email, mobile, departmentId, academicYear, deptCode, validFrom, validTill, assignedSubject } = req.body;
        const randomID = Math.floor(1000 + Math.random() * 9000);
        const voucherCode = `PICT-${deptCode}-${randomID}`;

        const newFaculty = new Faculty({
            fullName, email, mobile, departmentId, academicYear, voucherCode,
            // 🚀 THE FIX: Save the subject into the array (or leave empty if they didn't type one)
            assignedSubjects: assignedSubject ? [assignedSubject] : [], 
            validFrom: validFrom ? new Date(validFrom) : new Date(),
            validTill: validTill ? new Date(validTill) : new Date(new Date().setMonth(new Date().getMonth() + 3)),
            isActive: true 
        });

        await newFaculty.save();
        res.status(201).json(newFaculty);
    } catch (error) {
        res.status(400).json({ error: "Failed to add faculty" });
    }
});

// Send Professional Email
router.post('/send-voucher', async (req, res) => {
    try {
        const { email, fullName, voucherCode, validTill } = req.body;
        const mailOptions = {
            from: 'PICT Canteen System <YOUR_EMAIL@gmail.com>',
            to: email,
            subject: 'Confidential: Your PICT Canteen Examination Voucher',
            html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #0a1128; padding: 20px; text-align: center;">
            <h2 style="color: #60a5fa; margin: 0; font-style: italic;">PICT EXAM PORTAL</h2>
            </div>
            <div style="padding: 30px; background-color: #ffffff;">
            <p>Dear Prof. <strong>${fullName}</strong>,</p>
            <p>You have been assigned as an examiner at the Pune Institute of Computer Technology. During your duty, you are provided with complimentary canteen access.</p>
            <div style="background-color: #f8f9fc; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0; border: 1px dashed #cbd5e1;">
            <p style="font-size: 14px; color: #64748b; margin-top: 0; text-transform: uppercase; font-weight: bold;">Your Secure Access Code:</p>
            <h1 style="color: #2563eb; font-family: monospace; letter-spacing: 2px; margin: 10px 0;">${voucherCode}</h1>
            </div>
            <p><strong>Instructions for use:</strong></p>
            <ul style="color: #475569; font-size: 14px; line-height: 1.6;">
            <li>Present this code at the canteen counter.</li>
            <li>This voucher is strictly for personal use and is valid for one order per day.</li>
            <li>Validity Period Ends: <strong>${new Date(validTill).toLocaleDateString()}</strong></li>
            </ul>
            <p style="margin-top: 30px; font-size: 14px; color: #64748b;">Best Regards,<br><strong>Department Coordinator</strong><br>Pune Institute of Computer Technology</p>
            </div>
            </div>
            `
        };
        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: "Email sent successfully!" });
    } catch (error) {
        console.error("Email Error:", error);
        res.status(500).json({ error: "Failed to send email" });
    }
});

// SOFT RESET System
router.delete('/department/:deptId/reset', async (req, res) => {
    try {
        const { deptId } = req.params;
        const result = await Faculty.updateMany(
            { departmentId: deptId }, 
            { $set: { isActive: false, assignedSubjects: [] } } // 🚀 THE FIX: Wipes out subjects on reset
        );

        res.status(200).json({ 
            message: "System reset successfully (Soft Delete)",
            deactivatedCount: result.modifiedCount 
        });
    } catch (error) {
        console.error("Reset Error:", error);
        res.status(500).json({ error: "Failed to reset system" });
    }
});

module.exports = router;