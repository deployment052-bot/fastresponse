const Service = require("../model/serviceCard");

exports.getServices = async (req, res) => {
  try {
    const {
      category,
      isMostBooked,
      isTopCategory,
      isNewLaunched,
      search,
      minPrice,
      maxPrice,
      sort,
      page = 1,
      limit = 20,
    } = req.query;

    let filter = { isActive: true };
    let andConditions = [];

    /* CATEGORY */
    if (category) {
      filter.category = category;
    }

    /* FLAGS */
    if (isMostBooked === "true") filter.isMostBooked = true;
    if (isTopCategory === "true") filter.isTopCategory = true;

    /* NEW LAUNCHED */
    if (isNewLaunched === "true") {
      const days = 15;
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);

      andConditions.push({
        $or: [
          { isNewLaunched: true },
          { createdAt: { $gte: fromDate } },
        ],
      });
    }


    if (search) {
      andConditions.push({
        $or: [
          { title: { $regex: search, $options: "i" } },
          { tags: { $in: [new RegExp(search, "i")] } },
          { specialization: { $in: [new RegExp(search, "i")] } },
        ],
      });
    }

  
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    if (andConditions.length > 0) {
      filter.$and = andConditions;
    }

   
    let sortOption = { createdAt: -1 };
    if (sort === "price_low") sortOption = { price: 1 };
    if (sort === "price_high") sortOption = { price: -1 };
    if (sort === "rating") sortOption = { rating: -1 };

   
    const skip = (page - 1) * limit;

    const services = await Service.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit));

    const total = await Service.countDocuments(filter);

    res.status(200).json({
      success: true,
      total,
      page: Number(page),
      limit: Number(limit),
      services,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};



exports.getCategoriesWithServices = async (req, res) => {
  try {
    const services = await Service.find({ isActive: true })
      .sort({ createdAt: -1 });

    
    const categoryMap = {};

    services.forEach(service => {
      const category = service.category || "Others";

      if (!categoryMap[category]) {
        categoryMap[category] = {
          category,
          services: [],
        };
      }

      categoryMap[category].services.push(service);
    });

    const result = Object.values(categoryMap);

    res.status(200).json({
      success: true,
      totalCategories: result.length,
      categories: result,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
