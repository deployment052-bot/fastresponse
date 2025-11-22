const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({

  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  image:{type:String},
  email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  phone: { type: String, unique: true, sparse: true, trim: true },
  password: { type: String },
  confirmPassword: { type: String }, 
  role: {
    type: String,
    enum: ["client", "technician", "admin"],
    default: "client",
  },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },

  //admin degignation like hr admin , store admin
designation:{
  type:String,
},
  
  googleId: String,
  facebookId: String,

  avatar: String,

  
  location: String,
  coordinates: {
    lat: Number,
    lng: Number,
  },
  lastLocationUpdate: Date,


  companyName: String,
  address: String,
  gstNumber: String,

  
  experience: Number,
  specialization: [String],
  responsibility: String,
  employeeId: String,
  availability: { type: Boolean, default: true },
  onDuty: { type: Boolean, default: false },
  ratings: { type: Number, default: 0 },
  totalJobs: { type: Number, default: 0 },
  technicianStatus: {
    type: String,
    enum: ["available", "dispatched", "working", "break", "offDuty"],
    default: "available",
  },

 // eska use kabhi admin ki permissions k liye kiya jayega 
  department: String,
  permissions: [String],

 
  isEmailVerified: { type: Boolean, default: false },
  emailOTP: String,
  emailOTPExpires: Date,
  phoneOTP: String,
  phoneOTPExpires: Date,
});

module.exports = mongoose.model("User", userSchema);
