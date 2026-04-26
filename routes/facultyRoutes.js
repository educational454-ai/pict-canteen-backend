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
        if (!req.file) return res.status(400).json({ error: "File not received" });

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
        let rows = [];
        workbook.SheetNames.forEach(name => {
            const data = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "" });
            if (data.length > rows.length) rows = data;
        });

        // 1. Column Identification (Previous logic)
        let colIdx = { pattern: -1, name: -1, mobile: -1, subject: -1, from: -1, to: -1 };
        for (let i = 0; i < Math.min(20, rows.length); i++) {
            rows[i].forEach((cell, idx) => {
                if (!cell) return;
                const s = String(cell).toLowerCase().replace(/[^a-z]/g, "");
                if (s.includes("pattern")) colIdx.pattern = idx;
                if (s.includes("examiner")) colIdx.name = idx;
                if (s.includes("mobile")) colIdx.mobile = idx;
                if (s.includes("subjectname")) colIdx.subject = idx;
                if (s.includes("fromdate")) colIdx.from = idx;
                if (s.includes("enddate") || s.includes("tilldate")) colIdx.to = idx;
            });
            if (colIdx.pattern !== -1 && colIdx.mobile !== -1) break;
        }

        // 2. Group all duties by Faculty Mobile
        const tempGroup = {};
        const coordDept = (deptName || "").toUpperCase();

        rows.forEach((row) => {
            const pattern = String(row[colIdx.pattern] || "").toUpperCase();
            if (!pattern || pattern.includes("PATTERN NAME") || pattern.length < 10) return;

            // PICT Branch Filter (Same as before)
            let isMyDept = false;
            if (coordDept === "COMPUTER ENGINEERING" && pattern.includes("COMPUTER") && !pattern.includes("ELECTRONICS")) isMyDept = true;
            else if (coordDept === "INFORMATION TECHNOLOGY" && pattern.includes("INFORMATION")) isMyDept = true;
            else if (coordDept.includes("TELECOMMUNICATION") && pattern.includes("ELECTRONICS") && pattern.includes("TELE")) isMyDept = true;
            else if (coordDept === "ELECTRONICS & COMPUTER" && pattern.includes("ELECTRONICS") && pattern.includes("COMPUTER")) isMyDept = true;
            else if (coordDept.includes("ARTIFICIAL") && (pattern.includes("ARTIFICIAL") || pattern.includes("DATA SCIENCE"))) isMyDept = true;

            if (!isMyDept) return;

            const mobile = String(row[colIdx.mobile] || "").trim().replace(/[^0-9]/g, "");
            if (mobile.length < 10) return;

            if (!tempGroup[mobile]) tempGroup[mobile] = { rows: [], info: {} };
            
            const rawName = String(row[colIdx.name] || "").trim();
            const cleanedName = rawName.includes(')-') ? rawName.split(')-')[1].trim() : rawName;
            const year = pattern.includes("T.E.") ? "3rd Yr" : pattern.includes("B.E.") ? "4th Yr" : "2nd Yr";

            tempGroup[mobile].info = { fullName: cleanedName, academicYear: `${year} (Regular)` };
            tempGroup[mobile].rows.push({
                from: new Date(row[colIdx.from]),
                to: new Date(row[colIdx.to]),
                subject: String(row[colIdx.subject] || "Exam Duty")
            });
        });

        // 3. SMART SPLITTING LOGIC
        const finalVouchers = [];
        const GAP_THRESHOLD_DAYS = 2; // 2 din se zyada gap = Naya Voucher

        Object.keys(tempGroup).forEach(mobile => {
            const faculty = tempGroup[mobile];
            // Sort duties by 'from' date
            faculty.rows.sort((a, b) => a.from - b.from);

            let currentSession = null;

            faculty.rows.forEach(duty => {
                if (!currentSession) {
                    currentSession = { ...faculty.info, mobile, validFrom: duty.from, validTill: duty.to, subjects: [duty] };
                } else {
                    const diffTime = duty.from - currentSession.validTill;
                    const diffDays = diffTime / (1000 * 60 * 60 * 24);

                    if (diffDays <= GAP_THRESHOLD_DAYS) {
                        // Merge: Expand validity
                        if (duty.to > currentSession.validTill) currentSession.validTill = duty.to;
                        currentSession.subjects.push(duty);
                    } else {
                        // Split: Save current and start new
                        finalVouchers.push(currentSession);
                        currentSession = { ...faculty.info, mobile, validFrom: duty.from, validTill: duty.to, subjects: [duty] };
                    }
                }
            });
            if (currentSession) finalVouchers.push(currentSession);
        });

        // 4. Bulk Write to DB
        const bulkOps = finalVouchers.map(v => {
            const randomID = Math.floor(1000 + Math.random() * 9000);
            const assignedSubjects = v.subjects.map(s => `${s.from.toISOString().split('T')[0]}|${s.to.toISOString().split('T')[0]}|${s.subject}`);
            
            return {
                updateOne: {
                    // Filter: Unique combination of Mobile + Start Date
                    filter: { mobile: v.mobile, departmentId, validFrom: v.validFrom },
                    update: { 
                        $set: { 
                            ...v, 
                            assignedSubjects,
                            departmentId, 
                            isActive: true,
                            email: `${v.fullName.split(' ')[0].toLowerCase()}@pict.edu`
                        },
                        $setOnInsert: { voucherCode: `PICT-${coordDept.substring(0,2)}-${randomID}` }
                    },
                    upsert: true
                }
            };
        });

        const result = await Faculty.bulkWrite(bulkOps);
        const totalProcessed = result.upsertedCount + result.matchedCount;
        res.status(201).json({ success: true, added: result.upsertedCount, updated: result.modifiedCount, total: totalProcessed});

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
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