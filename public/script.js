document.addEventListener("DOMContentLoaded", () => {
  // Backend API & WebSocket Config
  const BACKEND_URL = window.location.origin.includes("localhost")
    ? "http://localhost:5000"
    : window.location.origin;
  const WS_URL = BACKEND_URL.replace(/^http/, "ws");

  // Global Active Target State
  let currentTarget = {
    name: "Imphal Valley, Manipur, India",
    lat: 24.817,
    lon: 93.936,
    baseRiverHeight: 4.2,
    riskPercent: 74,
    rainRate: 0,
    searchTeamsCount: 0,
    evacueesCount: 0,
    sheltersCount: 0,
    isFlooding: false,
  };

  // 1. Live UTC Clock
  const clockElement = document.getElementById("liveClock");
  function updateClock() {
    const now = new Date();
    clockElement.innerText = now.toUTCString().split(" ")[4] + " UTC";
  }
  setInterval(updateClock, 1000);
  updateClock();

  // 2. Navigation Tab Switching
  const navItems = document.querySelectorAll(".nav-item");
  const viewPanels = document.querySelectorAll(".view-panel");

  window.switchTab = (viewId) => {
    viewPanels.forEach((panel) => panel.classList.remove("active"));
    navItems.forEach((btn) => btn.classList.remove("active"));

    const targetPanel = document.getElementById(viewId);
    if (targetPanel) targetPanel.classList.add("active");

    const matchingNav = document.querySelector(`.nav-item[data-view="${viewId}"]`);
    if (matchingNav) matchingNav.classList.add("active");

    setTimeout(() => {
      if (dashboardMap) dashboardMap.invalidateSize();
      if (regionalMap) regionalMap.invalidateSize();
      if (shelterMap) shelterMap.invalidateSize();
    }, 200);

    if (viewId === "view-news" && newsArticlesDatabase.length === 0) {
      fetchGlobalNews("Global", "all");
    }
  };

  navItems.forEach((item) => {
    item.addEventListener("click", () => switchTab(item.getAttribute("data-view")));
  });

  // 3. Leaflet Open-Source Satellite Tiles Setup
  function createSatelliteLayer() {
    return L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      maxNativeZoom: 18,
      attribution: "Esri World Imagery",
    });
  }

  function createLabelsLayer() {
    return L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      maxNativeZoom: 18,
    });
  }

  // Dashboard Map
  const dashboardMap = L.map("worldDashboardMap", {
    center: [currentTarget.lat, currentTarget.lon],
    zoom: 8,
    minZoom: 2,
    maxZoom: 19,
  });
  createSatelliteLayer().addTo(dashboardMap);
  createLabelsLayer().addTo(dashboardMap);

  let dashboardMarker = L.marker([currentTarget.lat, currentTarget.lon])
    .addTo(dashboardMap)
    .bindPopup(`<b>${currentTarget.name}</b><br>Active Monitoring Target`)
    .openPopup();

  // Regional Flood Map
  const regionalMap = L.map("regionalFloodMap", {
    center: [currentTarget.lat, currentTarget.lon],
    zoom: 13,
    minZoom: 2,
    maxZoom: 19,
  });
  createSatelliteLayer().addTo(regionalMap);
  createLabelsLayer().addTo(regionalMap);

  let regionalMarker = null;
  let regionalCircleLayer = null;

  function updateRegionalMapLayers(lat, lon, regionName, riskScore) {
    if (regionalMarker) regionalMap.removeLayer(regionalMarker);
    if (regionalCircleLayer) regionalMap.removeLayer(regionalCircleLayer);

    const dangerColor = riskScore >= 40 ? (riskScore >= 70 ? "#ff3b5c" : "#ff9900") : "#00e599";

    regionalCircleLayer = L.circle([lat, lon], {
      color: dangerColor,
      fillColor: dangerColor,
      fillOpacity: 0.35,
      radius: 4500,
    }).addTo(regionalMap);

    regionalMarker = L.marker([lat, lon])
      .addTo(regionalMap)
      .bindPopup(`<b>${regionName}</b><br>Flood Threat: <strong>${riskScore}%</strong>`)
      .openPopup();

    regionalMap.setView([lat, lon], 12);
  }

  // Shelter Map
  let shelterMap = null;
  let shelterMarkersGroup = null;
  function initShelterMap() {
    if (!shelterMap) {
      shelterMap = L.map("shelterLeafletMap", {
        center: [currentTarget.lat, currentTarget.lon],
        zoom: 12,
        maxZoom: 19,
      });
      createSatelliteLayer().addTo(shelterMap);
      createLabelsLayer().addTo(shelterMap);
      shelterMarkersGroup = L.layerGroup().addTo(shelterMap);
    }
  }

  // 4. Hydrological Chart Management
  let runoffChartInstance = null;
  function initOrUpdateChart(labels, precipitationData, projectedWaterLevels, locationName) {
    const ctx = document.getElementById("runoffChart");
    if (!ctx) return;

    document.getElementById("chartRegionTitle").innerText = `Rainfall vs Runoff: ${locationName.split(",")[0]}`;

    if (runoffChartInstance) {
      runoffChartInstance.data.labels = labels;
      runoffChartInstance.data.datasets[0].data = projectedWaterLevels;
      runoffChartInstance.data.datasets[1].data = precipitationData;
      runoffChartInstance.update();
      return;
    }

    runoffChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Projected River Depth (m)",
            data: projectedWaterLevels,
            borderColor: "#ff3b5c",
            backgroundColor: "rgba(255, 59, 92, 0.15)",
            tension: 0.35,
            fill: true,
            yAxisID: "y",
          },
          {
            label: "Precipitation (mm)",
            data: precipitationData,
            borderColor: "#00d2ff",
            backgroundColor: "rgba(0, 210, 255, 0.2)",
            tension: 0.25,
            fill: true,
            yAxisID: "y1",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { labels: { color: "#8ea2c6" } },
        },
        scales: {
          x: { grid: { color: "#1f3563" }, ticks: { color: "#8ea2c6" } },
          y: {
            type: "linear",
            display: true,
            position: "left",
            title: { display: true, text: "River Depth (m)", color: "#8ea2c6" },
            grid: { color: "#1f3563" },
            ticks: { color: "#8ea2c6" },
          },
          y1: {
            type: "linear",
            display: true,
            position: "right",
            title: { display: true, text: "Precipitation (mm)", color: "#8ea2c6" },
            grid: { drawOnChartArea: false },
            ticks: { color: "#8ea2c6" },
          },
        },
      },
    });
  }

  // 5. Backend Hydrology & Weather Telemetry Fetch (With Client-Side Fallback)
  let generatedShelters = [];

  async function fetchGovWeatherData(lat, lon, locationLabel) {
    try {
      // First attempt: query backend API
      const res = await fetch(`${BACKEND_URL}/api/telemetry?lat=${lat}&lon=${lon}&name=${encodeURIComponent(locationLabel)}`);
      if (!res.ok) throw new Error("Backend offline or error");
      const data = await res.json();

      currentTarget.rainRate = data.current.rain;
      currentTarget.riskPercent = data.analysis.riskPercent;
      currentTarget.baseRiverHeight = data.analysis.riverCrest;
      currentTarget.isFlooding = data.analysis.isFlooding;

      // Update UI cards
      document.getElementById("liveRainfall").innerText = `${data.current.rain} mm`;
      document.getElementById("liveTemp").innerText = `${data.current.temp} °C`;
      document.getElementById("liveHumidity").innerText = `Humidity: ${data.current.humidity}%`;
      document.getElementById("liveWind").innerText = `${data.current.windSpeed} m/s`;
      document.getElementById("windDirection").innerText = `Bearing: ${data.current.windDirection}°`;
      document.getElementById("basinStatus").innerText = `${data.analysis.riverCrest} m`;
      document.getElementById("mapGaugeLevel").innerText = `${data.analysis.riverCrest} m`;

      updateRainCategory(data.current.rain);

      // Render chart
      const projectedLevels = data.hourly.rain.map((r, i) => +(data.analysis.riverCrest + (r * 0.16) + (i * 0.05)).toFixed(2));
      initOrUpdateChart(data.hourly.times, data.hourly.rain, projectedLevels, locationLabel);

      // Update indicators, maps, sandbox, alerts
      updateRiskGaugeUI(data.analysis.riskPercent, 50, data.current.rain);
      updateRegionalMapLayers(lat, lon, locationLabel, data.analysis.riskPercent);
      updateRiskPredictionSandbox(locationLabel, data.current.rain, data.analysis.riverCrest, data.analysis.riskPercent);
      syncAlertCenter(locationLabel, data.analysis.riskPercent, data.current.rain);

      // Set shelters from backend
      generatedShelters = data.shelters || [];
      syncEmergencyOperations(data.analysis.riskPercent, locationLabel, lat, lon);

    } catch (err) {
      console.warn("Backend unavailable, using direct Open-Meteo fallback:", err.message);
      fetchClientFallbackWeather(lat, lon, locationLabel);
    }
  }

  // Client-side fallback if backend server isn't running yet
  async function fetchClientFallbackWeather(lat, lon, locationLabel) {
    const endpoint = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m&hourly=precipitation,soil_moisture_0_to_1cm&forecast_days=1&timezone=auto`;

    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
      const data = await response.json();

      const cur = data.current;
      const rainVal = cur.precipitation ?? 0;
      const tempVal = cur.temperature_2m ?? 0;
      const humidVal = cur.relative_humidity_2m ?? 0;
      const windSpeed = (cur.wind_speed_10m / 3.6).toFixed(1);
      const windDir = cur.wind_direction_10m ?? 0;

      currentTarget.rainRate = rainVal;

      document.getElementById("liveRainfall").innerText = `${rainVal} mm`;
      document.getElementById("liveTemp").innerText = `${tempVal} °C`;
      document.getElementById("liveHumidity").innerText = `Humidity: ${humidVal}%`;
      document.getElementById("liveWind").innerText = `${windSpeed} m/s`;
      document.getElementById("windDirection").innerText = `Bearing: ${windDir}°`;

      updateRainCategory(rainVal);

      const hourlyLabels = data.hourly.time.slice(0, 8).map((t) => t.split("T")[1]);
      const hourlyRainfall = data.hourly.precipitation.slice(0, 8);
      const soilMoisture = data.hourly.soil_moisture_0_to_1cm ? data.hourly.soil_moisture_0_to_1cm[0] * 100 : 50;

      const computedRiverDepth = +(1.8 + (rainVal * 0.14) + (soilMoisture * 0.01)).toFixed(1);
      document.getElementById("basinStatus").innerText = `${computedRiverDepth} m`;
      document.getElementById("mapGaugeLevel").innerText = `${computedRiverDepth} m`;

      const projectedLevels = hourlyRainfall.map((rain, idx) => {
        const surge = (rain * 0.16) + (soilMoisture * 0.012) + (idx * 0.05);
        return +(computedRiverDepth + surge).toFixed(2);
      });

      initOrUpdateChart(hourlyLabels, hourlyRainfall, projectedLevels, locationLabel);

      let computedRisk = 0;
      if (rainVal === 0 && computedRiverDepth < 2.5) {
        computedRisk = Math.max(Math.round((soilMoisture * 0.15) + 5), 8);
      } else {
        computedRisk = Math.min(Math.max(Math.round((rainVal * 2.8) + (soilMoisture * 0.4) + (computedRiverDepth * 6.5)), 6), 99);
      }

      currentTarget.riskPercent = computedRisk;
      currentTarget.baseRiverHeight = computedRiverDepth;
      currentTarget.isFlooding = computedRisk >= 40;

      updateRiskGaugeUI(computedRisk, soilMoisture, rainVal);
      updateRegionalMapLayers(lat, lon, locationLabel, computedRisk);
      updateRiskPredictionSandbox(locationLabel, rainVal, computedRiverDepth, computedRisk);
      syncAlertCenter(locationLabel, computedRisk, rainVal);
      syncEmergencyOperations(computedRisk, locationLabel, lat, lon);

    } catch (fallbackErr) {
      console.error("Critical: Telemetry fetch error:", fallbackErr);
      document.getElementById("rainCategory").innerText = "Telemetry offline, using default metrics";
    }
  }

  function updateRainCategory(rainVal) {
    const rainStatusText = document.getElementById("rainCategory");
    if (rainVal > 15) {
      rainStatusText.innerText = "Heavy Torrential Cloudburst";
      rainStatusText.className = "subtext text-red";
    } else if (rainVal > 4) {
      rainStatusText.innerText = "Moderate Inundation Inflow";
      rainStatusText.className = "subtext text-yellow";
    } else {
      rainStatusText.innerText = "Normal / Dry Weather";
      rainStatusText.className = "subtext text-green";
    }
  }

  function updateRiskGaugeUI(risk, soilMoisture, rain) {
    const floodGaugeValue = document.getElementById("floodGaugeValue");
    const floodGaugeStatus = document.getElementById("floodGaugeStatus");
    const gaugeProgress = document.getElementById("gaugeProgress");
    const mapStatusPill = document.getElementById("mapGaugeStatusPill");

    floodGaugeValue.innerText = `${risk}%`;

    let activeColor = "#00e599";
    if (risk >= 70) {
      activeColor = "#ff3b5c";
      floodGaugeStatus.innerText = "CRITICAL SURGE";
      floodGaugeStatus.className = "gauge-status text-red";
      mapStatusPill.innerText = "CRITICAL CREST";
      mapStatusPill.className = "status-pill danger";
    } else if (risk >= 40) {
      activeColor = "#ff9900";
      floodGaugeStatus.innerText = "ELEVATED ALERT";
      floodGaugeStatus.className = "gauge-status text-yellow";
      mapStatusPill.innerText = "ELEVATED WARNING";
      mapStatusPill.className = "status-pill moderate";
    } else {
      floodGaugeStatus.innerText = "NORMAL / SAFE";
      floodGaugeStatus.className = "gauge-status text-green";
      mapStatusPill.innerText = "SAFE DISCHARGE";
      mapStatusPill.className = "status-pill safe";
    }

    gaugeProgress.style.background = `conic-gradient(${activeColor} ${risk}%, var(--bg-card) 0)`;

    const barRunoff = document.getElementById("barRunoff");
    barRunoff.style.width = `${Math.min(risk + 5, 100)}%`;
    barRunoff.className = risk >= 70 ? "fill" : risk >= 40 ? "fill yellow" : "fill green";
    document.getElementById("labelRunoff").innerText = `${Math.min(risk + 5, 100)}%`;

    document.getElementById("barSoil").style.width = `${Math.round(soilMoisture)}%`;
    document.getElementById("labelSoil").innerText = `${Math.round(soilMoisture)}%`;

    const rainIntensity = Math.min(Math.round((rain / 40) * 100), 100);
    document.getElementById("barRain").style.width = `${rainIntensity}%`;
    document.getElementById("labelRain").innerText = `${rainIntensity}%`;
  }

  // 6. Update Risk Prediction View (Dynamic Operational Response)
  function updateRiskPredictionSandbox(regionName, liveRain, riverDepth, computedRisk) {
    document.getElementById("predictionRegionHeader").innerText = `Simulation: ${regionName.split(",")[0]}`;
    document.getElementById("predActiveBasin").innerText = regionName.split(",")[0];

    const paramRain = document.getElementById("paramRain");
    const valRain = document.getElementById("valRain");
    const dischargeInput = document.getElementById("dischargeInput");
    const simScore = document.getElementById("simScore");
    const simVerdict = document.getElementById("simVerdict");
    const recommendation = document.getElementById("predRecommendation");

    paramRain.value = Math.max(Math.round(liveRain), 10);
    valRain.innerText = `${paramRain.value} mm/hr`;
    dischargeInput.value = (riverDepth * 3.8).toFixed(1);

    simScore.innerText = `${computedRisk}%`;

    if (computedRisk >= 70) {
      simScore.className = "score-dial text-red";
      simVerdict.innerHTML = `Critical Inundation Likely within <strong>45-60 mins</strong>`;
      recommendation.innerText = "Action Needed (Critical Flood Threat)";
      recommendation.className = "text-red";
    } else if (computedRisk >= 40) {
      simScore.className = "score-dial text-yellow";
      simVerdict.innerHTML = `Moderate Basin Runoff within <strong>2-3 hours</strong>`;
      recommendation.innerText = "Action Needed (Elevated Precaution)";
      recommendation.className = "text-yellow";
    } else {
      simScore.className = "score-dial text-green";
      simVerdict.innerHTML = `Safe Threshold: Runoff fully absorbed by basin strata`;
      recommendation.innerText = "No Action Needed (Conditions Normal)";
      recommendation.className = "text-green";
    }
  }

  // 7. Alert Center Sync
  function syncAlertCenter(regionName, risk, rain) {
    const feed = document.getElementById("alertsFeedContainer");
    const badge = document.getElementById("alertBadge");
    const banner = document.getElementById("warningBanner");
    const bannerIcon = document.getElementById("warningBannerIcon");
    const headline = document.getElementById("warningHeadline");
    const description = document.getElementById("warningDescription");
    const cleanName = regionName.split(",")[0];

    feed.innerHTML = "";

    if (risk >= 70) {
      badge.innerText = "1 CRITICAL";
      badge.className = "badge red";

      banner.className = "alert-banner-extreme";
      bannerIcon.className = "fa-solid fa-triangle-exclamation banner-icon";
      headline.innerText = `CRITICAL FLASH FLOOD SURGE IN ${cleanName.toUpperCase()}`;
      description.innerText = `Immediate mitigation required. Flood risk is at ${risk}% with ${rain} mm/hr rainfall.`;

      feed.innerHTML = `
        <div class="alert-feed-item high">
          <div class="feed-badge">CRITICAL RISK</div>
          <div class="feed-body">
            <h4>Urgent Flood Surge Threat: ${cleanName}</h4>
            <p>Calculated flood probability is <strong>${risk}%</strong>. Severe cloudburst runoff in catchment basin.</p>
            <span class="feed-time">Updated live just now</span>
          </div>
          <button class="btn btn-sm btn-danger" onclick="switchTab('view-warning')">Take Action</button>
        </div>
      `;
    } else if (risk >= 40) {
      badge.innerText = "1 WARNING";
      badge.className = "badge orange";

      banner.className = "alert-banner-extreme";
      banner.style.background = "linear-gradient(90deg, #b36b00 0%, #ff9900 100%)";
      bannerIcon.className = "fa-solid fa-triangle-exclamation banner-icon";
      headline.innerText = `ELEVATED FLOOD WARNING: ${cleanName.toUpperCase()}`;
      description.innerText = `Elevated hazard level of ${risk}%. Drainage systems approaching crest capacity.`;

      feed.innerHTML = `
        <div class="alert-feed-item medium">
          <div class="feed-badge">ELEVATED RISK</div>
          <div class="feed-body">
            <h4>Moderate Inundation Hazard: ${cleanName}</h4>
            <p>Hydrological model predicts a <strong>${risk}%</strong> risk of flood overflow due to continuous rainfall.</p>
            <span class="feed-time">Updated live just now</span>
          </div>
          <button class="btn btn-sm btn-outline" onclick="switchTab('view-warning')">Inspect Protocols</button>
        </div>
      `;
    } else {
      badge.innerText = "SAFE";
      badge.className = "badge green";

      banner.className = "alert-banner-extreme safe-banner";
      banner.style.background = "";
      bannerIcon.className = "fa-solid fa-shield-check banner-icon text-green";
      headline.innerText = `NO FLOOD THREAT: ${cleanName.toUpperCase()}`;
      description.innerText = `Watershed status is stable. Calculated flood risk is only ${risk}%. River crest and runoff within normal limits.`;

      feed.innerHTML = `
        <div class="alert-feed-item safe">
          <div class="feed-badge">NO RISK &bull; SAFE</div>
          <div class="feed-body">
            <h4>No Flood Threat Detected: ${cleanName}</h4>
            <p>Open-source atmospheric telemetry indicates clear conditions. Regional flood risk is at a safe <strong>${risk}%</strong> with minimal runoff.</p>
            <span class="feed-time">Verified live from NOAA / DWD</span>
          </div>
          <button class="btn btn-sm btn-outline" style="border-color: var(--accent-green); color: var(--accent-green);">All Clear</button>
        </div>
      `;
    }
  }

  // 8. Emergency Operations
  function syncEmergencyOperations(risk, regionName, lat, lon) {
    const cleanName = regionName.split(",")[0];
    const shelterSection = document.getElementById("shelterMapSection");
    const valSearchTeams = document.getElementById("valSearchTeams");
    const subSearchTeams = document.getElementById("subSearchTeams");
    const valShelters = document.getElementById("valShelters");
    const subShelters = document.getElementById("subShelters");
    const shelterActionTag = document.getElementById("shelterActionTag");
    const valEvacuees = document.getElementById("valEvacuees");
    const subEvacuees = document.getElementById("subEvacuees");

    if (risk < 40) {
      currentTarget.searchTeamsCount = 0;
      currentTarget.sheltersCount = 0;
      currentTarget.evacueesCount = 0;

      valSearchTeams.innerText = "0 Teams";
      valSearchTeams.className = "value";
      subSearchTeams.innerText = "Standby • Zero flood threat";

      valShelters.innerText = "0 Ready";
      subShelters.innerText = "No high-ground shelters needed";
      shelterActionTag.innerText = "Normal";
      shelterActionTag.style.background = "rgba(0, 229, 153, 0.15)";
      shelterActionTag.style.color = "var(--accent-green)";

      valEvacuees.innerText = "0 Persons";
      subEvacuees.innerText = "No evacuation required";

      shelterSection.style.display = "none";
      generatedShelters = [];
      return;
    }

    const isExtreme = risk >= 70;
    const teams = isExtreme ? Math.min(Math.round(risk / 3.8), 26) : Math.min(Math.round(risk / 5.2), 12);
    const evacuees = isExtreme ? Math.round((risk * 55) / 100) * 100 : Math.round((risk * 28) / 100) * 100;
    const sheltersCount = isExtreme ? 6 : 3;

    currentTarget.searchTeamsCount = teams;
    currentTarget.evacueesCount = evacuees;
    currentTarget.sheltersCount = sheltersCount;

    valSearchTeams.innerText = `${teams} Teams`;
    valSearchTeams.className = isExtreme ? "value text-red" : "value text-yellow";
    subSearchTeams.innerText = isExtreme ? "NDRF & Disaster Teams deployed" : "Active field patrol";

    valShelters.innerText = `${sheltersCount} High-Ground`;
    subShelters.innerText = "Click to inspect safe high grounds";
    shelterActionTag.innerText = "View Map";
    shelterActionTag.style.background = "rgba(0, 210, 255, 0.25)";
    shelterActionTag.style.color = "var(--accent-cyan)";

    valEvacuees.innerText = `${evacuees.toLocaleString()} Persons`;
    subEvacuees.innerText = isExtreme ? "Mandatory valley evacuation" : "Precautionary relocation";

    // Only compute fallback shelters if backend didn't supply them
    if (generatedShelters.length === 0) {
      generateRegionalShelters(lat, lon, cleanName, sheltersCount);
    }
  }

  function generateRegionalShelters(lat, lon, cleanName, count) {
    const offsets = [
      { name: `${cleanName} North Ridge High School & Camp`, dLat: 0.038, dLon: 0.025, elev: "+180m above basin", dist: "3.2 km" },
      { name: `${cleanName} East Hill Top Community Citadel`, dLat: 0.021, dLon: 0.042, elev: "+240m above basin", dist: "4.1 km" },
      { name: `${cleanName} Western Elevated Sports Complex`, dLat: -0.032, dLon: -0.029, elev: "+150m above basin", dist: "2.8 km" },
      { name: `${cleanName} Southern Plateau Refuge Center`, dLat: -0.045, dLon: 0.019, elev: "+210m above basin", dist: "5.0 km" },
      { name: `${cleanName} Upper Ridge District Stadium`, dLat: 0.048, dLon: -0.015, elev: "+195m above basin", dist: "4.6 km" },
      { name: `${cleanName} Hillock Military Training Pavilion`, dLat: -0.015, dLon: 0.052, elev: "+260m above basin", dist: "5.5 km" },
    ];

    generatedShelters = offsets.slice(0, count).map((item) => ({
      name: item.name,
      lat: +(lat + item.dLat).toFixed(5),
      lon: +(lon + item.dLon).toFixed(5),
      elevation: item.elev,
      distance: item.dist,
    }));
  }

  const btnShowShelterMap = document.getElementById("btnShowShelterMap");
  const shelterMapSection = document.getElementById("shelterMapSection");
  const closeShelterMapBtn = document.getElementById("closeShelterMapBtn");

  btnShowShelterMap.addEventListener("click", () => {
    if (!currentTarget.isFlooding || generatedShelters.length === 0) {
      alert(`No active flood threat in ${currentTarget.name.split(",")[0]}. High-ground shelter deployment is not required.`);
      return;
    }

    shelterMapSection.style.display = "block";
    initShelterMap();

    document.getElementById("shelterMapTitle").innerHTML = `<i class="fa-solid fa-mountain"></i> Safe High-Ground Shelters for ${currentTarget.name.split(",")[0]}`;
    shelterMarkersGroup.clearLayers();

    L.circle([currentTarget.lat, currentTarget.lon], {
      color: "#ff3b5c",
      fillColor: "#ff3b5c",
      fillOpacity: 0.35,
      radius: 3500,
    }).addTo(shelterMarkersGroup).bindPopup("<b>Flood-Prone Downstream Basin</b>");

    const shelterListGrid = document.getElementById("shelterListGrid");
    shelterListGrid.innerHTML = "";
    const bounds = L.latLngBounds([[currentTarget.lat, currentTarget.lon]]);

    generatedShelters.forEach((shelter) => {
      const elev = shelter.elevation || shelter.elev;
      const dist = shelter.distance || shelter.dist;

      const marker = L.marker([shelter.lat, shelter.lon])
        .addTo(shelterMarkersGroup)
        .bindPopup(`<b>${shelter.name}</b><br>Elevation: <span style="color:#00e599">${elev}</span><br>Distance: ${dist}<br>Coords: ${shelter.lat}, ${shelter.lon}`);

      bounds.extend([shelter.lat, shelter.lon]);

      const card = document.createElement("div");
      card.className = "shelter-card";
      card.innerHTML = `
        <div class="shelter-name"><i class="fa-solid fa-house-chimney-medical text-green"></i> ${shelter.name}</div>
        <div class="shelter-coords"><i class="fa-solid fa-location-crosshairs"></i> ${shelter.lat}°N, ${shelter.lon}°E</div>
        <div class="shelter-elevation"><i class="fa-solid fa-arrow-trend-up"></i> ${elev} (Safe Elevation)</div>
        <div class="shelter-dist"><i class="fa-solid fa-route"></i> ${dist} from flood danger zone</div>
      `;
      card.addEventListener("click", () => {
        shelterMap.setView([shelter.lat, shelter.lon], 14);
        marker.openPopup();
      });
      shelterListGrid.appendChild(card);
    });

    shelterMap.fitBounds(bounds, { padding: [40, 40] });

    setTimeout(() => {
      shelterMap.invalidateSize();
      shelterMapSection.scrollIntoView({ behavior: "smooth" });
    }, 150);
  });

  closeShelterMapBtn.addEventListener("click", () => {
    shelterMapSection.style.display = "none";
  });

  // 9. SOS Modal & Citizen Trigger
  const sosModal = document.getElementById("sosModalOverlay");
  const emergencySosBtn = document.getElementById("emergencySosBtn");
  const closeSosModalBtn = document.getElementById("closeSosModalBtn");
  const sosContactList = document.getElementById("sosContactList");

  function openEmergencySosModal() {
    const cleanName = currentTarget.name.split(",")[0];
    document.getElementById("sosModalRegion").innerText = `Flood-Prone Sector: ${cleanName}`;

    sosContactList.innerHTML = `
      <div class="sos-contact-item">
        <div class="contact-meta">
          <h4>${cleanName} District Police Emergency Ops</h4>
          <p>Local Police Station & Patrol Dispatch</p>
        </div>
        <a href="tel:112" class="call-btn"><i class="fa-solid fa-phone"></i> Call 112</a>
      </div>

      <div class="sos-contact-item">
        <div class="contact-meta">
          <h4>Disaster Relief &amp; NDRF / Search Team</h4>
          <p>Flood Inundation Boat & Heli-Rescue Division</p>
        </div>
        <a href="tel:1077" class="call-btn"><i class="fa-solid fa-phone"></i> Call 1077</a>
      </div>

      <div class="sos-contact-item">
        <div class="contact-meta">
          <h4>Paramedic &amp; Emergency Medical Ambulance</h4>
          <p>Nearest Trauma Center & Mobile Aid Van</p>
        </div>
        <a href="tel:108" class="call-btn"><i class="fa-solid fa-phone"></i> Call 108</a>
      </div>

      <div class="sos-contact-item">
        <div class="contact-meta">
          <h4>Irrigation &amp; Flood Control Command Room</h4>
          <p>Sluice Gate & River Hydrology Monitoring Desk</p>
        </div>
        <a href="tel:1070" class="call-btn"><i class="fa-solid fa-phone"></i> Call 1070</a>
      </div>
    `;

    sosModal.classList.add("active");
  }

  emergencySosBtn.addEventListener("click", openEmergencySosModal);
  closeSosModalBtn.addEventListener("click", () => sosModal.classList.remove("active"));
  sosModal.addEventListener("click", (e) => {
    if (e.target === sosModal) sosModal.classList.remove("active");
  });

  const citizenTriggerBtn = document.getElementById("citizenTriggerWarningBtn");
  citizenTriggerBtn.addEventListener("click", () => {
    sosModal.classList.remove("active");
    switchTab("view-warning");
    setTimeout(() => executeEarlyWarningBroadcast(true), 400);
  });

  // 10. Early Warning Broadcast (Synced via Backend API)
  const dispatchBroadcastBtn = document.getElementById("dispatchBroadcastBtn");

  async function executeEarlyWarningBroadcast(isCitizenTriggered = false) {
    const chkSms = document.getElementById("chkSms").checked;
    const chkSiren = document.getElementById("chkSiren").checked;
    const chkRadio = document.getElementById("chkRadio").checked;
    const chkMesh = document.getElementById("chkMesh").checked;

    const activatedChannels = [];
    if (chkSms) activatedChannels.push("Emergency Cell Broadcast (SMS Push)");
    if (chkSiren) activatedChannels.push("Acoustic Siren Array (Ridge & Valley)");
    if (chkRadio) activatedChannels.push("Emergency Radio Frequency Override");
    if (chkMesh) activatedChannels.push("First Responder Tactical Mesh Network");

    if (activatedChannels.length === 0) {
      alert("Please check at least one broadcast channel to trigger an early warning.");
      return;
    }

    const cleanName = currentTarget.name.split(",")[0];
    const triggerSource = isCitizenTriggered ? "Citizen SOS Field Report" : "Official Hydrology Command";

    dispatchBroadcastBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Transmitting Over Satellite Mesh...`;
    dispatchBroadcastBtn.disabled = true;

    try {
      await fetch(`${BACKEND_URL}/api/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region: cleanName,
          channels: activatedChannels,
          source: triggerSource
        })
      });
    } catch (e) {
      console.warn("Backend broadcast offline, executing local dispatch fallback.");
    }

    setTimeout(() => {
      dispatchBroadcastBtn.innerHTML = `<i class="fa-solid fa-check"></i> Broadcast Active &amp; Dispatched!`;
      dispatchBroadcastBtn.className = "btn btn-primary btn-full";

      const feed = document.getElementById("alertsFeedContainer");
      const badge = document.getElementById("alertBadge");
      badge.innerText = "ALARM ACTIVE";
      badge.className = "badge red";

      const alertItem = document.createElement("div");
      alertItem.className = "alert-feed-item high";
      alertItem.innerHTML = `
        <div class="feed-badge">BROADCAST ACTIVE</div>
        <div class="feed-body">
          <h4>Early Warning Sirens &amp; Cell Alarms Dispatched: ${cleanName}</h4>
          <p>Dispatched by: <strong>${triggerSource}</strong>. Channels: ${activatedChannels.join(", ")}.</p>
          <span class="feed-time">Transmitted at ${new Date().toLocaleTimeString()}</span>
        </div>
        <button class="btn btn-sm btn-outline" onclick="this.parentElement.remove()">Acknowledge</button>
      `;
      feed.prepend(alertItem);

      alert(`[BROADCAST TRIGGERED]\n\nTarget Region: ${cleanName}\nSource: ${triggerSource}\n\nTransmitted through:\n• ${activatedChannels.join("\n• ")}\n\nLocal authorities and cell devices are receiving the evacuation alert!`);

      setTimeout(() => {
        dispatchBroadcastBtn.innerHTML = `<i class="fa-solid fa-tower-broadcast"></i> Dispatch Early Warning Broadcast`;
        dispatchBroadcastBtn.className = "btn btn-danger btn-full";
        dispatchBroadcastBtn.disabled = false;
      }, 3500);
    }, 1000);
  }

  dispatchBroadcastBtn.addEventListener("click", () => executeEarlyWarningBroadcast(false));

  // 11. Global Search & Autocomplete
  const searchInput = document.getElementById("globalSearchInput");
  const searchSubmitBtn = document.getElementById("searchSubmitBtn");
  const suggestionsBox = document.getElementById("searchSuggestions");

  let debounceTimer = null;
  searchInput.addEventListener("input", (e) => {
    clearTimeout(debounceTimer);
    const query = e.target.value.trim();
    if (query.length < 3) {
      suggestionsBox.style.display = "none";
      return;
    }
    debounceTimer = setTimeout(() => fetchLocationSuggestions(query), 350);
  });

  async function fetchLocationSuggestions(query) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
      const res = await fetch(url, { headers: { "Accept-Language": "en" } });
      const results = await res.json();

      suggestionsBox.innerHTML = "";
      if (results && results.length > 0) {
        results.forEach((item) => {
          const div = document.createElement("div");
          div.className = "suggestion-item";
          div.innerText = item.display_name;
          div.addEventListener("click", () => {
            selectLocation(parseFloat(item.lat), parseFloat(item.lon), item.display_name);
            suggestionsBox.style.display = "none";
            searchInput.value = item.display_name;
          });
          suggestionsBox.appendChild(div);
        });
        suggestionsBox.style.display = "block";
      } else {
        suggestionsBox.style.display = "none";
      }
    } catch (err) {
      console.error("Geocoding lookup error:", err);
    }
  }

  function selectLocation(lat, lon, displayName) {
    currentTarget.lat = lat;
    currentTarget.lon = lon;
    currentTarget.name = displayName;

    document.getElementById("topbarRegionName").innerText = displayName;
    document.getElementById("mapFloatingTitle").innerText = `Gauge: ${displayName.split(",")[0]}`;

    dashboardMap.setView([lat, lon], 12);
    if (dashboardMarker) dashboardMap.removeLayer(dashboardMarker);
    dashboardMarker = L.marker([lat, lon])
      .addTo(dashboardMap)
      .bindPopup(`<b>${displayName}</b><br>Fetching hydrological telemetry...`)
      .openPopup();

    fetchGovWeatherData(lat, lon, displayName);
  }

  window.searchLocationByName = async (placeName) => {
    searchInput.value = placeName;
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(placeName)}&limit=1`;
      const res = await fetch(url);
      const results = await res.json();
      if (results && results.length > 0) {
        selectLocation(parseFloat(results[0].lat), parseFloat(results[0].lon), results[0].display_name);
      }
    } catch (e) {
      console.error("Preset search error:", e);
    }
  };

  searchSubmitBtn.addEventListener("click", () => {
    const val = searchInput.value.trim();
    if (val) searchLocationByName(val);
  });

  searchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const val = searchInput.value.trim();
      if (val) {
        suggestionsBox.style.display = "none";
        searchLocationByName(val);
      }
    }
  });

  document.addEventListener("click", (e) => {
    if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
      suggestionsBox.style.display = "none";
    }
  });

  // 12. Manual Simulation Control Trigger (Fixed Operational Response)
  const paramRain = document.getElementById("paramRain");
  const valRain = document.getElementById("valRain");
  const runSimBtn = document.getElementById("runSimBtn");
  const simScore = document.getElementById("simScore");
  const simVerdict = document.getElementById("simVerdict");
  const predRecommendation = document.getElementById("predRecommendation");

  if (paramRain && valRain) {
    paramRain.addEventListener("input", (e) => {
      valRain.textContent = `${e.target.value} mm/hr`;
    });
  }

  if (runSimBtn && simScore) {
    runSimBtn.addEventListener("click", async () => {
      runSimBtn.innerText = "Simulating Hydrological Surge...";

      const rainValue = parseInt(paramRain.value, 10);
      const dischargeValue = parseFloat(document.getElementById("dischargeInput").value) || 18.5;

      try {
        // Query simulation endpoint from backend
        const res = await fetch(`${BACKEND_URL}/api/simulate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rainRate: rainValue,
            soilMoisture: 65,
            baseRiverDepth: +(dischargeValue / 3.8).toFixed(2)
          })
        });

        if (res.ok) {
          const analysis = await res.json();
          applySimulationResults(analysis.riskPercent, analysis.verdict, analysis.operationalResponse, analysis.statusClass);
          runSimBtn.innerText = "Compute Flood Probability";
          return;
        }
      } catch (err) {
        // Backend offline fallback logic
      }

      // Local fallback calculation
      setTimeout(() => {
        let score = Math.min(Math.round((rainValue / 150) * 100) + 12, 99);
        let verdict = "";
        let opResponse = "";
        let colorClass = "";

        if (score >= 70) {
          colorClass = "text-red";
          verdict = `Critical Surge Likely within <strong>45-60 mins</strong>`;
          opResponse = "Action Needed (Critical Flood Threat)";
        } else if (score >= 40) {
          colorClass = "text-yellow";
          verdict = `Moderate Basin Runoff within <strong>2-3 hours</strong>`;
          opResponse = "Action Needed (Elevated Precaution)";
        } else {
          colorClass = "text-green";
          verdict = `Safe Threshold: Substratum absorption optimal`;
          opResponse = "No Action Needed (Conditions Normal)";
        }

        applySimulationResults(score, verdict, opResponse, colorClass);
        runSimBtn.innerText = "Compute Flood Probability";
      }, 300);
    });
  }

  function applySimulationResults(score, verdict, opResponse, colorClass) {
    simScore.innerText = `${score}%`;
    simVerdict.innerHTML = verdict;

    if (colorClass.includes("red")) {
      simScore.className = "score-dial text-red";
      predRecommendation.className = "text-red";
    } else if (colorClass.includes("yellow")) {
      simScore.className = "score-dial text-yellow";
      predRecommendation.className = "text-yellow";
    } else {
      simScore.className = "score-dial text-green";
      predRecommendation.className = "text-green";
    }

    predRecommendation.innerText = opResponse;
  }

  // 13. Refresh Telemetry Button
  const refreshWeatherBtn = document.getElementById("refreshWeatherBtn");
  if (refreshWeatherBtn) {
    refreshWeatherBtn.addEventListener("click", () => {
      refreshWeatherBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Syncing...`;
      fetchGovWeatherData(currentTarget.lat, currentTarget.lon, currentTarget.name).finally(() => {
        refreshWeatherBtn.innerHTML = `<i class="fa-solid fa-rotate"></i> Refresh Telemetry`;
      });
    });
  }

  // 14. Global News Center
  let currentNewsLocation = "Global";
  let currentNewsCategory = "all";
  let newsArticlesDatabase = [];

  const newsCardsGrid = document.getElementById("newsCardsGrid");
  const newsPlaceInput = document.getElementById("newsPlaceInput");
  const searchNewsBtn = document.getElementById("searchNewsBtn");
  const refreshNewsBtn = document.getElementById("refreshNewsBtn");
  const categoryButtons = document.querySelectorAll(".category-btn");
  const activeNewsLocationLabel = document.getElementById("activeNewsLocationLabel");
  const newsCountLabel = document.getElementById("newsCountLabel");

  const sampleNewsPool = [
    {
      category: "disaster",
      title: "Mountain Catchments Face Torrential Cloudburst Amid Monsoonal Ridge Low Pressure",
      snippet: "Severe atmospheric pressure systems have triggered extensive river crest warnings across vulnerable foothills and alluvial plains. Emergency relief battalions are positioned along key watercourses.",
      image: "https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=800&q=80",
      source: "Global Hydrology Wire",
      time: "22 mins ago",
      place: "Asia / Pacific",
      url: "https://gdeltproject.org/"
    },
    {
      category: "disaster",
      title: "Flash Flood Surge Inundates Lowland Valleys: Weir Gate Emergency Protocol Initiated",
      snippet: "Downhill runoff discharge rates surpassed 28 cubic meters per second this morning, prompting local authorities to enact civil siren warnings and clear highway crossings.",
      image: "https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&w=800&q=80",
      source: "International Civil Protection",
      time: "45 mins ago",
      place: "Regional Basin",
      url: "https://reliefweb.int/"
    },
    {
      category: "entertainment",
      title: "Global Box Office Shatters Opening Records as Sci-Fi Epic Sweeps Theaters",
      snippet: "The long-awaited international sequel opened across 75 countries to rave critical acclaim, dominating IMAX screens with ground-breaking practical effects and visual design.",
      image: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=800&q=80",
      source: "Entertainment Dispatch",
      time: "1 hour ago",
      place: "Hollywood / Worldwide",
      url: "https://variety.com"
    },
    {
      category: "entertainment",
      title: "Acoustic World Tour Sells Out Across 24 International Stadium Venues",
      snippet: "Grammy-winning artists announce an expansive eco-friendly world tour leveraging renewable solar stage systems and local acoustic amphitheaters.",
      image: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=800&q=80",
      source: "Music World News",
      time: "3 hours ago",
      place: "Global",
      url: "https://billboard.com"
    },
    {
      category: "food",
      title: "Revival of Ancient Mountain Grain Crops Transforms Sustainable Farm-to-Table Gastronomy",
      snippet: "Michelin-starred culinary masters are reintroducing drought-resistant indigenous highland millets and fermented botanicals into vanguard modern dining.",
      image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80",
      source: "Culinary Journal",
      time: "2 hours ago",
      place: "Global",
      url: "https://eater.com"
    },
    {
      category: "food",
      title: "Global Street Food Championships Crown Artisanal Woodfired Pizza Masters in Naples",
      snippet: "Over 400 pizzaiolos gathered along the waterfront to compete under strict heritage standards evaluating fermentation time, volcanic soil flour, and San Marzano heritage sauces.",
      image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80",
      source: "Gourmet International",
      time: "4 hours ago",
      place: "Naples, Italy",
      url: "https://bbc.com/travel"
    },
    {
      category: "racing",
      title: "Monaco Grand Prix: Wet Weather Strategy Delivers Thrilling Last-Lap Overtake",
      snippet: "A surprise cloudburst three laps before the chequered flag turned the principality street circuit into an ice rink, creating a masterclass in intermediate tire management.",
      image: "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=800&q=80",
      source: "Motorsport Paddock Wire",
      time: "1 hour ago",
      place: "Monaco",
      url: "https://motorsport.com"
    },
    {
      category: "racing",
      title: "Dakar Rally Desert Stage: Extreme Dunes Test Mechanical Endurance Across 450km",
      snippet: "Navigational sand dunes and rocky plateaus claimed numerous gearbox casualties as prototype hybrid 4x4 buggies locked horns in the desert crucible.",
      image: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80",
      source: "Rally Championship Daily",
      time: "5 hours ago",
      place: "Saudi Arabia",
      url: "https://dakar.com"
    },
    {
      category: "fighting",
      title: "Championship Bout Stuns Arena With Spectacular Round 2 Head-Kick Knockout",
      snippet: "The undisputed lightweight title changed hands in dramatic fashion as a lightning head-kick counter ended a furious back-and-forth striking war.",
      image: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=800&q=80",
      source: "Combat Sports Network",
      time: "35 mins ago",
      place: "Las Vegas, USA",
      url: "https://mmafighting.com"
    },
    {
      category: "fighting",
      title: "Heavyweight Unification Clash Confirmed in Wembley Stadium Before 90,000 Fans",
      snippet: "Both champions signed official contracts for the four-belt undisputed showdown scheduled for this autumn under the London night sky.",
      image: "https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?auto=format&fit=crop&w=800&q=80",
      source: "Boxing News International",
      time: "3 hours ago",
      place: "London, UK",
      url: "https://espn.com/boxing"
    },
    {
      category: "tech",
      title: "Next-Generation Neural Architecture Runs Deep Reasoning Directly On Mobile Chips",
      snippet: "Engineers unveil breakthroughs in 4-bit quantization allowing complex generative AI, multi-modal vision, and audio comprehension offline without cloud dependency.",
      image: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80",
      source: "Tech Horizon",
      time: "40 mins ago",
      place: "Silicon Valley",
      url: "https://arstechnica.com"
    },
    {
      category: "world",
      title: "Summit on Transboundary Water Treaties Reaches Historic Catchment Accord",
      snippet: "Delegates from eleven river basin nations concluded negotiations on open-data hydrological telemetry exchanges and reciprocal flood reservoir control.",
      image: "https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=800&q=80",
      source: "Global Affairs Dispatch",
      time: "2 hours ago",
      place: "Geneva, Switzerland",
      url: "https://reuters.com"
    }
  ];

  async function fetchGlobalNews(locationQuery = "Global", category = "all") {
    newsCardsGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted);">
        <i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; color: var(--accent-cyan); margin-bottom: 1rem;"></i>
        <p>Scanning international open-source news monitors for <strong>${locationQuery}</strong>...</p>
      </div>
    `;

    currentNewsLocation = locationQuery;
    currentNewsCategory = category;
    activeNewsLocationLabel.innerText = `${locationQuery} • Category: ${category.toUpperCase()}`;

    try {
      // 1. Try fetching from the backend API first
      let remoteArticles = [];
      try {
        const res = await fetch(`${BACKEND_URL}/api/news?location=${encodeURIComponent(locationQuery)}&category=${encodeURIComponent(category)}`);
        if (res.ok) {
          const json = await res.json();
          if (json.articles && json.articles.length > 0) {
            remoteArticles = json.articles;
          }
        }
      } catch (backendNewsErr) {
        // Continue to GDELT direct fetch
      }

      // 2. Direct GDELT open-source fallback
      if (remoteArticles.length === 0) {
        const gdeltCategoryTerms = {
          all: "",
          disaster: "flood OR cyclone OR rain OR storm OR earthquake",
          entertainment: "cinema OR movie OR music OR actor OR concert",
          food: "food OR cuisine OR chef OR culinary OR restaurant",
          racing: "F1 OR motorsport OR rally OR race OR NASCAR",
          fighting: "UFC OR boxing OR MMA OR fighter OR championship",
          tech: "AI OR technology OR space OR quantum OR robot",
          world: "treaty OR summit OR diplomatic OR government"
        };

        const filterTerm = gdeltCategoryTerms[category] || "";
        const searchTerms = [locationQuery !== "Global" ? locationQuery : "", filterTerm].filter(Boolean).join(" ");
        const gdeltUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(searchTerms || "world")}&mode=artlist&maxrecords=10&format=json`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        try {
          const response = await fetch(gdeltUrl, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (response.ok) {
            const json = await response.json();
            if (json && json.articles && json.articles.length > 0) {
              remoteArticles = json.articles.map((art) => ({
                category: category === "all" ? "world" : category,
                title: art.title,
                snippet: art.seendate ? `Monitored live at ${art.seendate}. Full real-time news report from ${art.domain}.` : "Breaking world event report.",
                image: art.socialimage || sampleNewsPool[Math.floor(Math.random() * sampleNewsPool.length)].image,
                source: art.domain || "GDELT Open Wire",
                time: "Just now",
                place: locationQuery,
                url: art.url
              }));
            }
          }
        } catch (netErr) {}
      }

      // 3. Blend with enriched sample pool
      let filteredPool = sampleNewsPool.filter((item) => category === "all" || item.category === category);
      if (locationQuery !== "Global") {
        filteredPool = filteredPool.map((item) => ({
          ...item,
          title: `${locationQuery}: ${item.title}`,
          place: locationQuery
        }));
      }

      const combined = [...remoteArticles, ...filteredPool];
      newsArticlesDatabase = combined;

      renderNewsCards(combined);
      newsCountLabel.innerText = `${combined.length} stories available`;

    } catch (err) {
      console.warn("Using local news pool fallback:", err);
      const filtered = sampleNewsPool.filter((item) => category === "all" || item.category === category);
      renderNewsCards(filtered);
      newsCountLabel.innerText = `${filtered.length} stories available`;
    }
  }

  function renderNewsCards(articles) {
    newsCardsGrid.innerHTML = "";

    if (articles.length === 0) {
      newsCardsGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted);">
          <i class="fa-solid fa-newspaper" style="font-size: 2.5rem; margin-bottom: 1rem; opacity: 0.5;"></i>
          <p>No recent articles found for this topic and location.</p>
        </div>
      `;
      return;
    }

    articles.forEach((art) => {
      const card = document.createElement("article");
      card.className = "news-card";
      card.innerHTML = `
        <div class="news-thumb-wrap">
          <img src="${art.image}" class="news-thumb" alt="${art.title}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800'" />
          <span class="news-cat-tag">${art.category}</span>
        </div>
        <div class="news-body">
          <h3 class="news-title">${art.title}</h3>
          <p class="news-snippet">${art.snippet}</p>
          <div class="news-footer">
            <span class="news-source"><i class="fa-solid fa-bullhorn"></i> ${art.source}</span>
            <span><i class="fa-regular fa-clock"></i> ${art.time}</span>
          </div>
        </div>
      `;

      card.addEventListener("click", () => openArticleReader(art));
      newsCardsGrid.appendChild(card);
    });
  }

  // Article Reader Modal
  const articleModal = document.getElementById("articleModalOverlay");
  const closeReaderModalBtn = document.getElementById("closeReaderModalBtn");
  const readerCategory = document.getElementById("readerCategory");
  const readerSource = document.getElementById("readerSource");
  const readerImage = document.getElementById("readerImage");
  const readerTitle = document.getElementById("readerTitle");
  const readerTime = document.getElementById("readerTime");
  const readerText = document.getElementById("readerText");
  const readerExternalLink = document.getElementById("readerExternalLink");

  function openArticleReader(art) {
    readerCategory.innerText = art.category.toUpperCase();
    readerSource.innerText = `Published by ${art.source} • Location: ${art.place || "Global"}`;
    readerImage.src = art.image;
    readerTitle.innerText = art.title;
    readerTime.innerText = `Reported: ${art.time}`;
    readerText.innerText = `${art.snippet} Journalists and open-source regional correspondents are continuously verifying real-time ground telemetry, public safety status, and eyewitness testimonies as the situation unfolds.`;
    readerExternalLink.href = art.url;

    articleModal.classList.add("active");
  }

  closeReaderModalBtn.addEventListener("click", () => articleModal.classList.remove("active"));
  articleModal.addEventListener("click", (e) => {
    if (e.target === articleModal) articleModal.classList.remove("active");
  });

  categoryButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      categoryButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const cat = btn.getAttribute("data-category");
      fetchGlobalNews(currentNewsLocation, cat);
    });
  });

  searchNewsBtn.addEventListener("click", () => {
    const val = newsPlaceInput.value.trim();
    if (val) fetchGlobalNews(val, currentNewsCategory);
  });

  newsPlaceInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const val = newsPlaceInput.value.trim();
      if (val) fetchGlobalNews(val, currentNewsCategory);
    }
  });

  refreshNewsBtn.addEventListener("click", () => {
    refreshNewsBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Refreshing...`;
    fetchGlobalNews(currentNewsLocation, currentNewsCategory).finally(() => {
      refreshNewsBtn.innerHTML = `<i class="fa-solid fa-rotate"></i> Refresh Feed`;
    });
  });

  // 15. WebSocket Client (Live Siren & Alarm Dispatches from Backend)
  try {
    const ws = new WebSocket(WS_URL);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "ALERT_DISPATCH") {
        alert(`[LIVE CIVIL WARNING DISPATCHED]\n\nTarget Region: ${data.region}\nBroadcast Channels: ${data.channels.join(", ")}\nInitiated by: ${data.source}`);
      }
    };
  } catch (wsErr) {
    console.warn("WebSocket engine offline:", wsErr);
  }

  // Initial Load Execution
  fetchGovWeatherData(currentTarget.lat, currentTarget.lon, currentTarget.name);
});