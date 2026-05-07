const express = require("express");
const app = express();
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const PORT = 3001;


// Routes
const authRoutes = require("./Routes/Userroutes/authroutes");
const vehicleRoutes = require("./Routes/Vehicleroutes/vehicleroutes");
const entryVehicleRoutes = require("./Routes/EntryVehiclesRoutes/entryVehicles");
const vehiclesAvailabilityRoutes = require("./Routes/VehiclesAvailabilityRoutes/vehiclesavailability");
const vehicleModelRoutes = require("./Routes/VehicleModelRoutes/vehiclemodel");
const vehicleModelElectionRoutes = require("./Routes/VehicleModelElectionRoutes/vehicleModelElection");
const vehiclesAvailabilityElectionRoutes = require("./Routes/VehiclesAvailabilityElectionRoutes/vehiclesAvailabilityElection");
const newVehicleRoutes = require("./Routes/vehicleDetailsRoutes/vehicleDetails");
const cartRoutes = require("./Routes/cartRoutes/cart");
const orderRoutes = require("./Routes/OrderRoutes/orderRoutes");
const adminAuthRoutes = require('./Routes/Adminauthroutes/adminroutes');
const employeeAuthRoutes = require('./Routes/Employeeauthroutes/employeeauthroutes');
const vehicleOfferRoutes = require('./Routes/vehicleOfferRoutes/vehicleOffer');
const EnquiryRoutes = require("./Routes/EnquiryRoutes/Enquiry");
const dashboardRoutes = require("./Routes/Dashboard/dashboard");
const productenquiry = require("./Routes/Productenquiry/productenquiry");
const ContactEnquiryRoutes = require("./Routes/ContactEnquiryRoute/ContactEnquiryRoute");
const packageRoutes = require('./Routes/PackageManagementRoutes/packagemanagement');
const adminOrderRoutes = require("./Routes/AdminorderRoutes/AdminorderRoutes");
const locationRoutes = require('./Routes/locationRoutes/locationRoutes');
//Image upload requirements
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    const modelName = req.body.model;

    if (!modelName) {
      return cb(new Error("Model name required"), null);
    }

    const formattedModel = modelName.trim().replace(/\s+/g, "_");

    const uploadPath = path.join(__dirname, "public/uploads", formattedModel);

    // Create folder if not exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },

  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({
  storage: storage,
  limits: { files: 4 },
});

app.use("/uploads", express.static("uploads"));

// // Enhanced CORS configuration
// app.use(cors({
//   origin: [
//     'http://localhost:3000',
//      'http://192.168.2.159:3000',
//      'https://frontend-roadshow.vercel.app'
//     ],
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE','PATCH', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization','X-Requested-With']
// }));

// // Allow all origins for development
// app.use(cors({
//   origin: true,  // This allows any origin
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
// }));

const allowedOrigins = [
  "http://localhost:3000",
  "http://192.168.2.159:3000",
  "https://frontend-roadshow.vercel.app",
  "https://frontend-roadshow-97ae.vercel.app",
  "https://frontend-roadshow-*-your-username.vercel.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        // Allow any vercel.app subdomain for preview deployments
        if (origin.includes(".vercel.app")) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  }),
);

app.use(bodyParser.json());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use("/public", express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "public")));
// ✅ Explicitly handle preflight requests
// app.options('*', cors());

app.use(
  "/images",
  express.static(path.join(__dirname, "../first-app/public/images")),
);
app.use(express.static("public"));

mongoose
  .connect(
    // "mongodb+srv://roadshowAdinn:doAztsUGMfooi5PY@roadshowadinn.sephmyg.mongodb.net/?appName=RoadshowAdinn",
   "mongodb://localhost:27017/Roadshow",

  )

// mongoose
//   .connect("mongodb://127.0.0.1:27017/Roadshow", {
//     useNewUrlParser: true,
//     useUnifiedTopology: true,
//   })
  .then(() => {
    console.log("✅ Roadshow MongoDB Connected Successfully");
  })
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
  });




// ─── Routes ──────────────────────────────────
app.use(newVehicleRoutes);

app.use("/auth", authRoutes);
app.use("/vehicles", vehicleRoutes);
app.use(entryVehicleRoutes);
app.use(vehiclesAvailabilityRoutes);
app.use(vehicleModelRoutes);
app.use(vehicleModelElectionRoutes);
app.use(vehiclesAvailabilityElectionRoutes);
app.use(cartRoutes);
app.use(orderRoutes);
app.use(adminAuthRoutes);
app.use(employeeAuthRoutes);
app.use('/vehicleoffers', vehicleOfferRoutes);
app.use(EnquiryRoutes);
app.use(dashboardRoutes);
app.use('/productenquiry', productenquiry);
app.use(ContactEnquiryRoutes);
app.use('/packages', packageRoutes);
app.use("/admin", adminOrderRoutes);
app.use('/locations', locationRoutes);


// VEHICLE DETAILS STORED WITH CRUD OPERATIONS
//IMAGE UPLOAD CLOUDINARY CORRECTED CODE
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const { v2: cloudinary } = require("cloudinary");
cloudinary.config({
  cloud_name: "dysuigknj",
  api_key: "133679639417399",
  api_secret: "i4fzWaXH_32kQYkwWb3U-pLxKd4",
  secure: true, // Add this for HTTPS
});
//ORDER MANAGEMENT AND ADD TO CART , ORDER CREATION CODES

const vehicleUpload = multer({
  storage: storage, // reuse existing storage
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
}).fields([
  { name: "mainImage", maxCount: 4 },
  { name: "sideImages", maxCount: 4 },
  { name: "interiorImages", maxCount: 4 },
  { name: "ledDisplayImage", maxCount: 4 },
  { name: "brandingSample", maxCount: 4 },
  { name: "vehicleVideo", maxCount: 4 },
]);
//ORDER MANAGEMENT AND ADD TO CART , ORDER CREATION CODES

// Configure storage for main image upload
const imageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    return {
      folder: "VehicleMainImage",
      allowed_formats: ["jpg", "jpeg", "png"],
      // transformation: [
      //     { width: 1600, height: 1200, crop: 'limit', quality: 'auto' }
      // ]
    };
  },
});

const imageUpload = multer({
  storage: imageStorage,
  // limits: {
  //     fileSize: 5 * 1024 * 1024 // 5MB limit
  // }
});

app.post("/upload", imageUpload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    console.log("Main image URL:", req.file.path);
    console.log("Main image public_id:", req.file.filename);
    res.status(200).json({
      message: "Upload successful",
      imageUrl: req.file.path,
      public_id: req.file.filename,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed" });
  }
});

// Configure storage for additional files
const additionalFileStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const isVideo = file.mimetype.startsWith("video/");
    return {
      folder: isVideo ? "VehicleAddedVideos" : "VehicleAddedImages",
      resource_type: isVideo ? "video" : "image",
      allowed_formats: isVideo
        ? ["mp4", "mov", "avi", "mkv", "webm"]
        : ["jpg", "jpeg", "png", "gif"],
      // format: isVideo ? 'mp4' : 'jpg',
      // transformation: isVideo ? [] : [{ width: 800, height: 800, crop: 'limit' }]
      // transformation: isVideo ?
      //     { quality: 'auto', fetch_format: 'auto' } :
      //     { width: 800, height: 600, crop: 'limit', quality: 'auto' }
    };
  },
});

const additionalFileUpload = multer({
  storage: additionalFileStorage,
});

// Save files endpoint
app.post(
  "/save-videos",
  additionalFileUpload.array("files", 5),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }
      const savedFiles = req.files.map((file) => ({
        url: file.path,
        public_id: file.filename,
        type: file.mimetype.startsWith("video/") ? "video" : "image",
      }));
      console.log("Saved files:", savedFiles);
      res.status(200).json(savedFiles);
    } catch (err) {
      console.error("Error uploading additional files:", err);
      res.status(500).json({ error: "File save failed" });
    }
  },
);

// Delete endpoint
app.post("/delete-video", async (req, res) => {
  try {
    const { public_id, resource_type } = req.body;

    if (!public_id || !resource_type) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const result = await cloudinary.uploader.destroy(public_id, {
      resource_type: resource_type,
    });

    if (result.result === "ok") {
      res.status(200).json({ message: "File deleted successfully" });
    } else {
      res.status(400).json({ error: "File deletion failed" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error during file deletion" });
  }
});


// ===================== Update order pipeline status
//ORDER MANAGEMENT AND ADD TO CART , ORDER CREATION CODES


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
