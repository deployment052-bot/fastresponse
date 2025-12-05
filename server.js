const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const passport = require("passport");
const session = require("express-session");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config(); 

const app = express();


const server = http.createServer(app);


const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "https://whimsical-fenglisu-4a7b67.netlify.app",
      "fantastic-pie-84a677.netlify.app"
    ],
    credentials: true,
  }
});


module.exports.io = io;

io.on("connection", (socket) => {
  console.log(" Socket connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});


require("./config/passport");


app.use(cors({
  origin: [
    "http://localhost:5173",
   "fantastic-pie-84a677.netlify.app"
  ],
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: false,
  })
);


app.use(passport.initialize());
app.use(passport.session());


app.use('/auth', require('./routes/authRoute'));
app.use('/api', require('./routes/work'));
app.use('/api', require('./routes/admin'));
app.use('/otp', require('./routes/otpRoutes'));
app.use('/forget', require('./routes/forgotpassword'));
app.use('/service', require('./routes/service'));
app.use('/technicaian', require('./routes/technicianRoutes'));
app.use('/ims',require('./routes/ssologin'))
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log(' MongoDB connected'))
  .catch(err => console.log('❌ MongoDB connection error:', err));


app.get('/', (req, res) => {
  res.send(' Server running fine with Google OAuth & Socket.IO!');
});

app.use((err, req, res, next) => {
  console.error(' Error:', err.stack);
  res.status(500).json({ message: 'Something went wrong!', error: err.message });
});


const PORT = process.env.PORT ;
server.listen(PORT, () => console.log(` Server running with Socket.IO on port ${PORT}`));
