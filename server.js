const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);
require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const path = require("path");
const mongoose = require("mongoose");
const { WebSocketServer } = require("ws"); 

// Models
const AlertLog = require("./models/AlertLog");         // <-- ADD THIS

const TelemetryLog = require("./models/TelemetryLog");

const { getWeatherData } = require("./services/weatherService");
const { calculateHydrology, generateShelters } = require("./services/riskEngine");
const { getNews } = require("./services/newsService");

const app = express();
// --- MongoDB Atlas Connection ---
const MONGO_URI = process.env.MONGO_URI;
if (MONGO_URI) {
  mongoose
    .connect(MONGO_URI)
    .then(() => console.log(" Connected to MongoDB Atlas"))
    .catch((err) => console.error(" MongoDB Connection Error:", err.message));
} else {
  console.warn(" Warning: No MONGO_URI found in .env file");
}
// ---------------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files if placed inside public/
app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// WEBSOCKET: Real-Time Early Warning & SOS
// ==========================================
function broadcast(messageObj) {
  const payload = JSON.stringify(messageObj);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // 1 = OPEN
      client.send(payload);
    }
  });
}

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "INIT", message: "Connected to FloodGuard Warning Mesh" }));
});

// ==========================================
// REST API ROUTES
// ==========================================

// 1. Telemetry & Hydrology Analysis
app.get("/api/telemetry", async (req, res) => {
  const { lat, lon, name = "Target Region" } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({ error: "Missing latitude or longitude parameters." });
  }

  try {
    const rawWeather = await getWeatherData(lat, lon);
    const cur = rawWeather.current;
    const rainVal = cur.precipitation ?? 0;
    const soilMoisture = rawWeather.hourly?.soil_moisture_0_to_1cm ? rawWeather.hourly.soil_moisture_0_to_1cm[0] * 100 : 50;

    const analysis = calculateHydrology({
      rainRate: rainVal,
      soilMoisture: soilMoisture,
      baseRiverDepth: 1.8
    });

    const shelters = analysis.isFlooding
      ? generateShelters(lat, lon, name, analysis.emergencyOps.sheltersCount)
      : [];

    res.json({
      location: name,
      lat: parseFloat(lat),
      lon: parseFloat(lon),
      current: {
        temp: cur.temperature_2m,
        humidity: cur.relative_humidity_2m,
        rain: rainVal,
        windSpeed: +(cur.wind_speed_10m / 3.6).toFixed(1),
        windDirection: cur.wind_direction_10m
      },
      hourly: {
        times: rawWeather.hourly.time.slice(0, 8).map(t => t.split("T")[1]),
        rain: rawWeather.hourly.precipitation.slice(0, 8),
      },
      analysis,
      shelters
    });
  } catch (error) {
    console.error("Telemetry error:", error.message);
    res.status(500).json({ error: "Failed to fetch government weather telemetry" });
  }
});

// 2. Simulation Sandbox Calculation
app.post("/api/simulate", (req, res) => {
  const { rainRate, soilMoisture, baseRiverDepth } = req.body;
  const analysis = calculateHydrology({ rainRate, soilMoisture, baseRiverDepth });
  res.json(analysis);
});

// 3. Dispatch Early Warning Broadcast (Triggers Siren Mesh)
app.post("/api/broadcast", (req, res) => {
  const { region, channels, source = "Civil Authority" } = req.body;

  const broadcastEvent = {
    type: "ALERT_DISPATCH",
    region,
    channels: channels || ["Cell Broadcast", "Acoustic Siren"],
    source,
    timestamp: new Date().toISOString()
  };

  broadcast(broadcastEvent);
  res.json({ success: true, event: broadcastEvent });
});

// 4. Global News Feed
app.get("/api/news", async (req, res) => {
  const { location = "Global", category = "all" } = req.query;
  const articles = await getNews({ location, category });
  res.json({ count: articles.length, articles });
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ONLINE", timestamp: new Date().toISOString() });
});
// --- ADMIN DASHBOARD APIs ---

// 1. Get summary counters and high-risk logs
app.get("/api/admin/metrics", async (req, res) => {
  try {
    const totalAlerts = await AlertLog.countDocuments();
    const activeSosCount = await AlertLog.countDocuments({ isCitizenSOS: true });
    const recentTelemetry = await TelemetryLog.find().sort({ recordedAt: -1 }).limit(10);
    const criticalIncidents = await AlertLog.find().sort({ createdAt: -1 }).limit(10);

    res.json({
      metrics: {
        totalAlerts,
        activeSosCount,
        criticalRegions: recentTelemetry.filter(t => t.riskPercent > 70).length
      },
      recentTelemetry,
      criticalIncidents
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load admin metrics: " + err.message });
  }
});

// 2. Resolve / Clear an alert from the database
app.delete("/api/admin/alert/:id", async (req, res) => {
  try {
    await AlertLog.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Incident cleared" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete incident: " + err.message });
  }
});

// 3. Purge historical telemetry data (maintenance)
app.post("/api/admin/purge-telemetry", async (req, res) => {
  try {
    await TelemetryLog.deleteMany({});
    res.json({ success: true, message: "Historical telemetry purged" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Start Server
server.listen(PORT, () => {
  console.log(`FloodGuard Backend Engine listening on http://localhost:${PORT}`);
  console.log(`WebSocket server active on ws://localhost:${PORT}`);
});