const mongoose= require('mongoose')
const Work = require("../model/work");
const User = require("../model/user");
const Booking=require("../model/BookOrder")
const axios = require("axios");
const AdminNotification=require('../model/adminnotification')
const Notification=require('../model/Notification');
const work = require('../model/work');


exports.resolveWorkIssue = async (req, res) => {
  try {
    const { workId, issueId } = req.body;
   const adminId =
      req.user && req.user._id ? req.user._id : req.body.adminId;

    const work = await Work.findById(workId);
    if (!work) return res.status(404).json({ message: "Work not found" });

    const issue = work.issues.id(issueId);
    if (!issue) return res.status(404).json({ message: "Issue not found" });

    
    issue.status = "resolved";
    issue.resolvedBy = adminId;
    issue.resolvedAt = new Date();

    //     if (issue.issueType === "need_specialist") {
    //   issue.specialistInfo = {
    //     technicianName: `${work.assignedTechnician.firstName} ${work.assignedTechnician.lastName}`,
    //     technicianPhone: work.assignedTechnician.phone,
    //   };
    // }

   
    work.issueCount = Math.max(0, (work.issueCount || 0) - 1);

   
    const openIssues = work.issues.filter((i) => i.status === "open");
    if (openIssues.length === 0) {
      work.status = "inprogress";
    }

    await work.save();

    res.status(200).json({
      message: "Issue resolved successfully",
      work,
    });

  } catch (error) {
    console.error("Resolve Issue Error:", error);
    res.status(500).json({ message: "Failed to resolve issue" });
  }
};

exports.getTechnicianWorkForAdmin = async (req, res) => {
  try {
    const { technicianId } = req.body;

    if (!technicianId) {
      return res.status(400).json({ message: "Technician ID is required" });
    }

   
    const technician = await User.findById(technicianId).select(
      "firstName lastName email phone"
    );

    if (!technician) {
      return res.status(404).json({ message: "Technician not found" });
    }

 
    const works = await Work.find({ assignedTechnician: technicianId })
      .populate("client", "firstName lastName phone location ")
      .populate("invoice")
      .sort({ createdAt: -1 });

 
    const totalWorkCount = works.length;

    const activeCount = works.filter(w =>
      ["dispatch", "inprogress","approved"].includes(w.status)
    ).length;

    const completedCount = works.filter(w => w.status === "completed").length;

    const rejectedCount = works.filter(w => w.status === "rejected").length;

   
    const totalEarnings = works.reduce((sum, work) => {
      const invoiceTotal = work.invoice?.total || 0;
      const serviceCharge = work.serviceCharge || 0;
      return sum + invoiceTotal + serviceCharge;
    }, 0);

   
    res.status(200).json({
      success: true,
      technician,
      summary: {
        totalWorkCount,
        activeCount,
        completedCount,
        rejectedCount,
        totalEarnings,
      },
      works,  // All work details list
    });

  } catch (error) {
    console.error("Admin Technician Work Summary Error:", error);
    res.status(500).json({
      message: "Failed to fetch technician work summary",
      error: error.message,
    });
  }
};


exports.getAllTechniciansForAdmin = async (req, res) => {
  try {
    
    const technicians = await User.find({ role: "technician" })
      .select("firstName lastName email phone createdAt location specialization responsibility");

    res.status(200).json({
      success: true,
      count: technicians.length,
      technicians,
    });

  } catch (err) {
    console.error("Get All Technicians Error:", err);
    res.status(500).json({
      success: false,
      message: "Unable to fetch technicians",
    });
  }
};

exports.getAllClientForAdmin=async (req,res)=>{
try{
    const client =await User.find ({role:"client"})
  .select("firstName lastName email phone location createdAt");
  res.status(200).json
({
  success:true,
  count:client.length,
  client,
})
}catch(err){
console.error("Get all client error",err)
res.status(500).json
({
  success:false,
  message:"unable to fetch client "
})}

};

exports.getclientWorkForAdmin = async (req, res) => {
  try {
    const { client } = req.body;

    if (!client) {
      return res.status(400).json({ message: "client ID is required" });
    }

   
    const clientid = await User.findById(client).select(
      "firstName lastName email phone"
    );
     console.log(clientid)
    if (!clientid) {
      return res.status(404).json({ message: "client not found" });
    }

 
    const works = await Work.find({ client: clientid })
      .populate("assignedTechnician", "firstName lastName phone location specialization")
      
      .sort({ createdAt: -1 });

 
    const totalWorkCount = works.length;

    const activeCount = works.filter(w =>
      ["dispatch", "inprogress","approved"].includes(w.status)
    ).length;

    const completedCount = works.filter(w => w.status === "completed").length;

    const rejectedCount = works.filter(w => w.status === "rejected").length;
res.status(200).json({
      success: true,
      clientid,
      summary: {
        totalWorkCount,
        activeCount,
        completedCount,
        rejectedCount,
      
      },
      works,  
    });

  } catch (error) {
    console.error("Admin Technician Work Summary Error:", error);
    res.status(500).json({
      message: "Failed to fetch technician work summary",
      error: error.message,
    });
  }
};


exports.getAllWorkAdmin=async (req,res)=>{
try{
    const work =await Work.find ({})
  .populate("client","firstName lastName email phone location createdAt")
  .populate("assignedTechnician","firstName lastName email phone location")
  .sort({createAt:-1})
  res.status(200).json
({
  success:true,
  count:work.length,
  work,
})
}catch(err){
console.error("Get all work error",err)
res.status(500).json
({
  success:false,
  message:"unable to fetch work "
})}

};



exports.getOpenIssues = async (req, res) => {
  try {
  
    const countResult = await Work.aggregate([
      { $unwind: "$issues" },
      { $match: { "issues.status": "open" } },
      { $count: "count" }
    ]);

    const openIssueCount = countResult.length > 0 ? countResult[0].count : 0;

   
    const worksWithIssues = await Work.find({ "issues.status": "open" })
      .populate("client", "firstName lastName phone location")
      .populate("assignedTechnician", "firstName lastName phone")
      .sort({ createdAt: -1 });

    
    const issuesList = [];

    worksWithIssues.forEach(work => {
      work.issues.forEach(issue => {
        if (issue.status === "open") {
          issuesList.push({
            issueId: issue._id,
            message: issue.message,
            raisedBy: issue.raisedBy,
            raisedAt: issue.raisedAt,
            workId: work._id,
            workStatus: work.status,
            serviceType: work.serviceType,
            client: work.client,
            technician: work.assignedTechnician
          });
        }
      });
    });

    res.status(200).json({
      success: true,
      count: openIssueCount,
      issues: issuesList
    });

  } catch (err) {
    console.error("Open Issues Fetch Error:", err);
    res.status(500).json({ message: "Failed to fetch open issues" });
  }
};

exports.getAllIssues = async (req, res) => {
  try {
    const { status } = req.query; 
    

    const matchStage = {};

    if (status) {
      matchStage["issues.status"] = status;
    }

    const worksWithIssues = await Work.aggregate([
      { $unwind: "$issues" },
      { $match: Object.keys(matchStage).length ? matchStage : {} },
      {
        $project: {
          workId: "$_id",
          serviceType: 1,
          token: 1,
          client: 1,
          assignedTechnician: 1,
          issue: "$issues"
        }
      },
      { $sort: { "issue.raisedAt": -1 } } 
    ]);

  
    const populated = await Promise.all(
      worksWithIssues.map(async (item) => {
        const client = await User.findById(item.client).select(
          "firstName lastName phone"
        );

        const technician = await User.findById(item.assignedTechnician).select(
          "firstName lastName phone"
        );

        return {
          ...item,
          client,
          technician
        };
      })
    );

    res.status(200).json({
      success: true,
      totalIssues: populated.length,
      issues: populated
    });

  } catch (err) {
    console.error("Get All Issues Error:", err);
    res.status(500).json({
      message: "Failed to fetch issues",
      error: err.message,
    });
  }
};
