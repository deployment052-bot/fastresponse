const User = require('../../model/user');
const Work = require('../../model/work');
const Bill = require('../../model/Bill');

exports.getAllWorks = async (req, res) => {
  try {
    // const clientId = req.user._id;
        const {clientId}=req.body;
    const works = await Work.find({ client: clientId })
      .populate("client", "name email phone")
      .populate("assignedTechnician", "firstName lastName email phone specialization ratings")
      .sort({ createdAt: -1 });

    if (!works.length) {
      return res.status(200).json({ message: "No work requests found for this client" });
    }

   
    const formattedWorks = await Promise.all(
      works.map(async (work) => {
        const bill = await Bill.findOne({ work: work._id }); 

        return {
          id: work._id,
          serviceType: work.serviceType,
          date: work.date,
          status: work.status,
          token: work.token,
          createdAt: work.createdAt,
          totalAmount: bill?.totalAmount || 0, 
        };
      })
    );

    res.status(200).json({
      message: "All work requests retrieved for this client",
      totalWorks: works.length,
      works: formattedWorks,
    });
  } catch (err) {
    console.error("Get All Works Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


exports.getClientWorkStatus = async (req, res) => {
  try {
    const { workId } = req.params;
    const clientId = req.user._id;

    const work = await Work.findById(workId)
      .populate("assignedTechnician", "name phone email technicianStatus coordinates lastLocationUpdate")
      .populate("client", "name phone email coordinates");

    if (!work) {
      return res.status(404).json({ message: "Work not found" });
    }

    if (String(work.client._id) !== String(clientId)) {
      return res.status(403).json({ message: "Not authorized to view this work" });
    }

 
    const technician = work.assignedTechnician;
    let eta = "ETA not available";

    if (technician?.coordinates?.lat && technician?.coordinates?.lng && work.coordinates?.lat && work.coordinates?.lng) {
      try {
        const orsKey = process.env.ORS_KEY;
        const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${orsKey}&start=${technician.coordinates.lng},${technician.coordinates.lat}&end=${work.coordinates.lng},${work.coordinates.lat}`;
        const response = await axios.get(url);
        const seconds = response.data.features[0].properties.summary.duration;
        const minutes = Math.round(seconds / 60);
        eta = `${minutes} minutes`;
      } catch (err) {
        console.log("ETA calc failed:", err.message);
      }
    }

    const workStatus = {
      workId: work._id,
      token: work.token,
      serviceType: work.serviceType,
      specialization: work.specialization,
      description: work.description,
      location: work.location,
      status: work.status,
      createdAt: work.createdAt,
      startedAt: work.startedAt,
      completedAt: work.completedAt,
      client: {
        name: work.client.name,
        phone: work.client.phone,
        email: work.client.email,
      },
      technician: technician
        ? {
            name: technician.name,
            phone: technician.phone,
            email: technician.email,
            status: technician.technicianStatus,
            coordinates: technician.coordinates,
            lastUpdate: technician.lastLocationUpdate,
          }
        : null,
      eta,
    };

    res.status(200).json({
      message: "Work status fetched successfully",
      workStatus,
    });
  } catch (err) {
    console.error("Client Work Status Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
