const mongoose = require('mongoose');

// Define the blueprint (Schema) for a User
const userSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true 
    },
    email: { 
        type: String, 
        required: true, 
        unique: true // Ensures no two users can register with the same email
    },
    password: { 
        type: String, 
        required: true 
    },
    role: { 
        type: String, 
        enum: ['COORDINATOR', 'MANAGER', 'SUPER_ADMIN'], // Strictly limits roles
        required: true 
    },
    departmentId: { 
        type: mongoose.Schema.Types.ObjectId, // This will link to the Departments collection later
        ref: 'Department',
        default: null // Managers might not belong to a specific department
    }
}, {
    timestamps: true // Automatically adds 'createdAt' and 'updatedAt' dates!
});

// Convert the schema into a usable Model and export it
module.exports = mongoose.model('User', userSchema);