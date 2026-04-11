// backend/seedManager.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String
}, { strict: false });

const User = mongoose.models.User || mongoose.model('User', userSchema);

const seedCanteenManager = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Nuke any existing managers so we start 100% fresh
    await User.deleteMany({ role: 'MANAGER' });
    await User.deleteMany({ email: 'manager@pict.edu' });
    console.log("🗑️ Cleared out old manager records...");

    // Create the fresh user with PLAIN TEXT password
    const canteenManager = new User({
      name: "Main Canteen Desk",
      email: "manager@pict.edu",
      password: "manager123", 
      role: "MANAGER"
    });

    await canteenManager.save();
    console.log("🎉 SUCCESS: Fresh Canteen Manager created successfully!");
    console.log("📧 Email: manager@pict.edu");
    console.log("🔑 Password: manager123");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding Canteen Manager:", error);
    process.exit(1);
  }
};

seedCanteenManager();