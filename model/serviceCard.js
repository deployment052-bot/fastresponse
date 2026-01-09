const mongoose=require('mongoose')

const serviceSchema = new mongoose.Schema(
  {
    
    title: { type: String, required: true },
    cardIcon: { type: String, required: true },
    price: { type: Number, required: true },

    category: {
      type: String,
     
      required: true,
    },

   
    serviceType: { type: String },

 
    specialization: { type: [String], default: [] },
    tags: { type: [String], default: [] },

   
    isMostBooked: { type: Boolean, default: false },
    isTopCategory: { type: Boolean, default: false },

    isNewLaunched: { type: Boolean, default: false },

    
    rating: { type: Number, default: 4.5 },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true, 
  }
);

module.exports = mongoose.model("Service", serviceSchema);
