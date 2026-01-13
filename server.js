const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const passport = require("passport");
const session = require("express-session");
const http = require("http");
const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");

require("dotenv").config(); 

const sendNotification = require('./model/Notification');

// Redis setup
const { client: redisClient, connectRedis } = require('./utils/redis');
const RedisStore = require("connect-redis").default;
const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert(
    
    require((process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH))
    
  ),
  
});
  console.log("Firebase Admin initialized")

const app = express();


const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "https://whimsical-fenglisu-4a7b67.netlify.app"
    ],
    credentials: true,
  }
});
module.exports.io = io;

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);
  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});


require("./config/passport");

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://whimsical-fenglisu-4a7b67.netlify.app"
  ],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));



(async () => {
  await connectRedis();
  console.log(" Redis ready for scaling");
  const pubClient = redisClient;
  const subClient = redisClient.duplicate();
  await subClient.connect();

  io.adapter(createAdapter(pubClient, subClient));
  app.use(session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
      maxAge: 1000 * 60 * 60 * 24,
    }
  }));

  app.use(passport.initialize());
  app.use(passport.session());
 
  app.use('/auth', require('./routes/authRoute'));
  app.use('/api', require('./routes/work'));
  app.use('/api', require('./routes/admin'));
  app.use('/otp', require('./routes/otpRoutes'));
  app.use('/forget', require('./routes/forgotpassword'));
  app.use('/service', require('./routes/service'));
  app.use('/technicaian', require('./routes/technicianRoutes'));
  app.use('/ims', require('./routes/ssologin'));
  app.use('/profile', require('./routes/profileRoutes'));
  app.use('/notification', require('./routes/notificationroute'));
  app.use('/ocr', require('./utils/ocr'));
  app.use('/check',require('./routes/checkroute'));
  app.use('/serviceCard',require('./routes/serviceroute'))
  app.get('/', (req, res) => {
    res.send('Server running fine with Google OAuth, Redis & Socket.IO!');
  });

app.use('/phone',require('./native_code/route/authregister'));
app.use('/phoneclient',require('./native_code/route/clinetRoute'))
  app.get("/test-notif", async (req, res) => {
    const testUserId = "id-of-a-user";
    const notif = await sendNotification(
      testUserId,
      "client",
      "Test Notification",
      "This is a test message",
      "info",
      "/"
    );
    res.send(notif);
  });


app.get('/health', (req, res) => {
  res.json({
    status: "ok",
    instance: process.pid,
    timestamp: new Date()
  });
});
  // Error handler
  app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).json({ message: 'Something went wrong!', error: err.message });
  });


  if (process.env.NODE_ENV !== "test") {
    mongoose.connect(process.env.MONGO_URL)
      .then(() => console.log('MongoDB connected'))
      .catch(err => console.log('MongoDB connection error:', err));

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, "0.0.0.0",() => console.log(`Server running with Socket.IO & Redis session on port ${PORT}`));
  }
})();
