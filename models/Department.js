const mongoose = require('mongoose');

// Define the blueprint for a Department
const departmentSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true,
        unique: true // E.g., "Computer Engineering"
    },
    code: { 
        type: String, 
        required: true,
        unique: true // E.g., "CE", "IT", "ENTC" (Used for generating voucher codes!)
    },
    active: { 
        type: Boolean, 
        default: true // By default, the department is active
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Department', departmentSchema);