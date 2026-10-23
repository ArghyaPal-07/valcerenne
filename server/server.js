require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const morgan = require("morgan");

const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");
const dbClient = process.env.DB_CLIENT || "firebase";
const app = express();
const PORT = process.env.PORT || 3000;

// Standard Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

// Serve Static Frontend Files
app.use(express.static(path.join(__dirname, "../public")));

// Firebase is the default. SQL adapters are retained only for legacy verification/migration.
if (dbClient === "firebase") {
  app.use("/api", require("./firebase/routes"));
} else if (["sqlite", "mysql"].includes(dbClient)) {
  app.get("/api/config", (req, res) =>
    res.json({ success: true, provider: "legacy" }),
  );
  const routes = {
    auth: "authRoutes",
    products: "productRoutes",
    categories: "categoryRoutes",
    cart: "cartRoutes",
    wishlist: "wishlistRoutes",
    orders: "orderRoutes",
    coupons: "couponRoutes",
    users: "userRoutes",
    reviews: "reviewRoutes",
  };
  for (const [prefix, module] of Object.entries(routes))
    app.use("/api/" + prefix, require("./routes/" + module));
  app.use("/api", require("./routes/contactRoutes"));
} else throw new Error("Unsupported DB_CLIENT. Use firebase.");

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    database: dbClient,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API 404 handler for unmatched /api routes
app.all("/api/*", notFoundHandler);

// Fallback to 404.html for any unmatched non-API page requests
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "../public/404.html"));
});

// Global Error Handler
app.use(errorHandler);

// Start server after ensuring database is ready
async function startServer() {
  try {
    if (dbClient === "sqlite") await require("../database/init-db")();
    else if (dbClient === "firebase")
      console.log(
        "[DB] Cloud Firestore selected. No local database is used. Configure Firebase using docs/FIREBASE.md.",
      );
    else console.log("[DB] Using legacy MySQL database.");
    app.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(`  Valcerenne E-Commerce Server is running!`);
      console.log(`  Local URL:  http://localhost:${PORT}`);
      console.log(`  API Status: http://localhost:${PORT}/api/health`);
      console.log(`====================================================`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;
