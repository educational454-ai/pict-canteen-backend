// backend/seedAdmin.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

// Define the blueprint directly in this script to avoid import errors
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String
}, { strict: false });

const User = mongoose.models.User || mongoose.model('User', userSchema);

const forceSeedSuperAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Nuke any existing super admins so we start 100% fresh
    await User.deleteMany({ role: 'SUPER_ADMIN' });
    await User.deleteMany({ email: 'principal@pict.edu' });
    console.log("🗑️ Cleared out old admin records...");

    // Create the fresh user with PLAIN TEXT password (matches your login route)
    const superAdmin = new User({
      name: "Principal Desk",
      email: "principal@pict.edu",
      password: "admin123", 
      role: "SUPER_ADMIN"
    });

    await superAdmin.save();
    console.log("🎉 SUCCESS: Fresh Super Admin created successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding Super Admin:", error);
    process.exit(1);
  }
};

forceSeedSuperAdmin();