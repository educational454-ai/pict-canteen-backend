const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema({
    itemName: { type: String, required: true },
    category: { 
        type: String, 
        enum: ['Breakfast', 'Beverages', 'Quick Bites', 'Fasting Specials (Upvas)', 'Lunch', 'Dessert'], 
        required: true 
    },
    price: { type: Number, required: true },
    isAvailable: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('MenuItem', menuItemSchema);