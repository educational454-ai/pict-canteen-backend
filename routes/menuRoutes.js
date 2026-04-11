const express = require('express');
const router = express.Router();
const Menu = require('../models/MenuItem');

// GET ALL Menu Items (You probably already have this)
router.get('/all', async (req, res) => {
    try {
        const items = await Menu.find().sort({ category: 1, itemName: 1 });
        res.status(200).json(items);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch menu" });
    }
});

// ADD a new Menu Item
router.post('/add', async (req, res) => {
    try {
        const { itemName, category, price } = req.body;
        const newItem = new Menu({ itemName, category, price });
        await newItem.save();
        res.status(201).json({ message: "Item added successfully", item: newItem });
    } catch (error) {
        res.status(400).json({ error: "Failed to add item" });
    }
});

// EDIT/UPDATE a Menu Item
router.put('/update/:id', async (req, res) => {
    try {
        const updatedItem = await Menu.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true } // Returns the updated document
        );
        res.status(200).json({ message: "Item updated", item: updatedItem });
    } catch (error) {
        res.status(400).json({ error: "Failed to update item" });
    }
});

// DELETE a Menu Item
router.delete('/delete/:id', async (req, res) => {
    try {
        await Menu.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Item deleted" });
    } catch (error) {
        res.status(400).json({ error: "Failed to delete item" });
    }
});

module.exports = router;