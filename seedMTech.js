const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const Department = require('./models/Department');

dotenv.config();

const seedMTechCoordinators = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // 1. Define exactly what we want to create
    const coordinators = [
      { name: "MTech CE Coord", email: "mce@pict.edu", deptName: "M.Tech Computer Engineering" },
      { name: "MTech DS Coord", email: "mds@pict.edu", deptName: "M.Tech Data Science" },
      { name: "MTech WCT Coord", email: "mwct@pict.edu", deptName: "M.Tech Wireless Communication Technology" },
      { name: "MTech IT Coord", email: "mit@pict.edu", deptName: "M.Tech Information Technology" }
    ];

    for (const coord of coordinators) {
      // 2. Find the department for THIS specific coordinator
      const dept = await Department.findOne({ name: coord.deptName });

      if (!dept) {
        console.log(`⚠️  Skipping ${coord.deptName}: Department not found in Compass yet.`);
        continue; // Move to the next one instead of crashing
      }

      // 3. Check if user already exists
      const exists = await User.findOne({ email: coord.email });
      if (!exists) {
        await User.create({
          name: coord.name,
          email: coord.email,
          password: "mtech123", 
          role: "COORDINATOR",
          departmentId: dept._id
        });
        console.log(`👤 SUCCESS: Created Coordinator for ${coord.deptName}`);
      } else {
        console.log(`⏩ Already Exists: ${coord.email}`);
      }
    }

    console.log("🏁 Seeding process finished!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding Error:", error);
    process.exit(1);
  }
};

seedMTechCoordinators();