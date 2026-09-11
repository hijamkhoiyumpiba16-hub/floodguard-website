require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const path = require("path");
const { WebSocketServer } = require("ws");

const { getWeatherData } = require("./services/weatherService");
const { calculateHydrology, generateShelters } = require("./services/riskEngine");
const { getNews } = require("./services/newsService");

const app = express();
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

// Start Server
server.listen(PORT, () => {
  console.log(`FloodGuard Backend Engine listening on http://localhost:${PORT}`);
  console.log(`WebSocket server active on ws://localhost:${PORT}`);
});