const mongoose = require("mongoose");

const workSchema = new mongoose.Schema(
  {
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    serviceType: { type: String, required: true },
    specialization: [String],
    description: String,
    location: String,

    serviceCharge: { type: Number, required: true, default: 0 },

    assignedTechnician: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    coordinates: {
      lat: Number,
      lng: Number,
    },

    token: String,

    status: {
      type: String,
      enum: [
        "open",
        "taken",
        "approved",

        "reject",
    
        "dispatch",
        "inprogress",
        "completed",
        "confirm",
        "onhold_parts",
        "escalated",
        "rescheduled",
      ],
      default: "open",
    },

   issues: [
  {
    issueType: {
      type: String,
      enum: ["need_parts", "need_specialist", "customer_unavailable", "other"],
    },
    remarks: String,
    raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    raisedAt: { type: Date, default: Date.now },

    status: {
      type: String,
      enum: ["open", "resolved"],
      default: "open",
    },

    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    resolvedAt: { type: Date },
  }
],

issueCount: {
  type: Number,
  default: 0,
},


    publicStatus: {
  type: String,
  default: "inprogress", // client ko dikhane ke liye
},

    beforphoto: { type: String },




    afterphoto: { type: String },

    
    invoice: {
      invoiceNumber: String,
      usedMaterials: [
        {
          name: String,
          quantity: Number,
          price: Number,
        },
      ],
      serviceCharge: Number,
      subtotal: Number,
      tax: Number,
      total: Number,
      pdfUrl: String,
      payment:{
        type:String,
        enum:['upi','cash'],
        
      },

    },

    
    billId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bill",
    },
          // 💰 Payment Tracking
    payment: {
      method: { type: String, enum: ["cash", "upi"], default: null },
      status: { type: String, enum: ["pending", "confirmed"], default: "pending" },
      confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // technician
      confirmedAt: { type: Date },
      paidAt: { type: Date }, // client side payment time
    },

    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    remarks: { type: String, trim: true },

    adminNotification: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdminNotification",
    },

    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  {
    timestamps: true, 
  }
);

workSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("Work", workSchema);
