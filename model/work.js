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
      enum: ["open", "resolved","unresolved"],
      default: "open",
    },

    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    resolvedAt: { type: Date },
    parts: [
  {
    itemName: { type: String, required: true },
    quantity: { type: String, required: true },
    Decofitem:{type:String,required:true},
    unit: String,
    requiredDate: Date,
    
    

    deliveryAddress: String, 
    company: { type:String },

    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    requestedOn: { type: Date, default: Date.now },

 
    status: {
  type: String,
  enum: [
    "pending_fastresponse",
    "approved_fastresponse",
    "rejected_fastresponse",
    "pending_ims",
    "dispatched_from_ims",
    "received_parts"
  ],
  default: "pending_fastresponse"
},


    approvedBy_FR: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt_FR: Date,

    rejectedBy_FR: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    rejectionReason_FR: String,

    dispatchedBy_IMS: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    dispatchedAt_IMS: Date,
    
    dispatchDetails: {
      trackingId: String,
      courierName: String,
      deliveryExpected: Date
    },

    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    receivedAt: Date
  }
]

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

    beforephoto: { type: String },




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
    upiApp:String,
    
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
