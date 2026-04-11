const mongoose = require('mongoose');

const guestSchema = new mongoose.Schema({
    guestName: { type: String, required: true },
    email: { type: String },
    voucherCode: { type: String, unique: true, required: true },
    facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Faculty', required: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    validFrom: { type: Date, required: true },
    validTill: { type: Date, required: true },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Guest', guestSchema);