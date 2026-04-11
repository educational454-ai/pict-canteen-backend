const mongoose = require('mongoose');

const facultySchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true },
    mobile: { type: String, required: true },
    academicYear: { type: String, required: true }, // e.g., "2025-26"
    
    // 🚀 NEW: Store the assigned subjects and types from the Excel sheet
    assignedSubjects: [{ type: String }],

    // Link to the Department
    departmentId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Department', 
        required: true 
    },

    // Voucher Details
    voucherCode: { type: String, unique: true, required: true },
    validFrom: { type: Date, required: true },
    validTill: { type: Date, required: true },
    
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } // The Coordinator who added them
}, { timestamps: true });

module.exports = mongoose.model('Faculty', facultySchema);