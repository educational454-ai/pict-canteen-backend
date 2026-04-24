require('dotenv').config(); // Loads the secret .env file
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose'); // The database tool
const cors = require('cors');
const userRoutes = require('./routes/userRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const facultyRoutes = require('./routes/facultyRoutes');
const menuRoutes = require('./routes/menuRoutes');
const orderRoutes = require('./routes/orderRoutes');
const guestRoutes = require('./routes/guestRoutes');
const reportRoutes = require('./routes/reportRoutes');
const mailRoutes = require('./routes/mailRoutes');
const Order = require('./models/Order');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
});
const PORT = process.env.PORT || 5000;

const getMsUntilNextMidnight = () => {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setDate(now.getDate() + 1);
    nextMidnight.setHours(0, 0, 0, 0);
    return nextMidnight.getTime() - now.getTime();
};

const cleanupUnprocessedOrders = async () => {
    try {
        const staleOrders = await Order.find({ status: { $ne: 'Completed' } }, '_id').lean();
        if (staleOrders.length === 0) {
            console.log('🧹 Midnight cleanup: No unprocessed orders found.');
            return;
        }

        const staleOrderIds = staleOrders.map((order) => order._id);
        await Order.deleteMany({ _id: { $in: staleOrderIds } });

        staleOrderIds.forEach((orderId) => {
            io.emit('order:deleted', { orderId, autoCanceled: true });
        });

        console.log(`🧹 Midnight cleanup: Auto-canceled ${staleOrderIds.length} unprocessed order(s).`);
    } catch (error) {
        console.error('❌ Midnight cleanup failed:', error.message);
    }
};

const scheduleMidnightCleanup = () => {
    const delay = getMsUntilNextMidnight();
    console.log(`⏰ Midnight cleanup scheduled in ${Math.ceil(delay / 1000)}s.`);

    setTimeout(async () => {
        await cleanupUnprocessedOrders();
        scheduleMidnightCleanup();
    }, delay);
};

app.set('io', io);

io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
});

app.use(cors());
app.use(express.json());
console.log("Loading User Routes...");
app.use('/api/users', userRoutes);
console.log("Loading Department Routes...");
app.use('/api/departments', departmentRoutes);
console.log("Faculty Routes file has been loaded!");
app.use('/api/faculty', facultyRoutes);
console.log("Loading Menu Routes...");
app.use('/api/menu', menuRoutes);
console.log("Loading Order Routes...");
app.use('/api/orders', orderRoutes);
console.log("Loading Guest Routes...");
app.use('/api/guests', guestRoutes);
console.log("Loading Report Routes...");
app.use('/api/reports', reportRoutes);
app.use('/api/auth', require('./routes/authRoutes'));
console.log("Loading Mail Routes...");
app.use('/api/mail', mailRoutes);

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ MongoDB Connected Successfully!");
        scheduleMidnightCleanup();
    })
    .catch((error) => {
        console.log("❌ Database connection failed:", error);
    });
// ---------------------------

app.get('/', (req, res) => {
    res.send("Welcome to the PICT Canteen API! The backend is working.");
});

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'pict-canteen-backend',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime())
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});