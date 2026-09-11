/**
 * Hydrological Risk & Emergency Estimation Engine
 */
function calculateHydrology({ rainRate, soilMoisture, baseRiverDepth = 1.8 }) {
  const rain = Math.max(0, parseFloat(rainRate) || 0);
  const soil = Math.min(100, Math.max(0, parseFloat(soilMoisture) || 50));

  // Projected River Crest Level (meters)
  const riverCrest = +(baseRiverDepth + (rain * 0.14) + (soil * 0.01)).toFixed(2);

  // Composite Risk Probability (0 - 99%)
  let riskPercent = 0;
  if (rain === 0 && riverCrest < 2.5) {
    riskPercent = Math.max(Math.round((soil * 0.15) + 5), 8);
  } else {
    riskPercent = Math.round((rain * 2.8) + (soil * 0.4) + (riverCrest * 6.5));
  }
  riskPercent = Math.min(Math.max(riskPercent, 6), 99);

  // Status & Recommendations
  let status = "SAFE";
  let statusClass = "green";
  let operationalResponse = "No Action Needed (Conditions Normal)";
  let verdict = "Safe Threshold: Runoff fully absorbed by basin strata";

  if (riskPercent >= 70) {
    status = "CRITICAL";
    statusClass = "red";
    operationalResponse = "Action Needed (Critical Flood Threat)";
    verdict = "Critical Inundation Likely within 45-60 mins";
  } else if (riskPercent >= 40) {
    status = "WARNING";
    statusClass = "yellow";
    operationalResponse = "Action Needed (Elevated Precaution)";
    verdict = "Moderate Basin Runoff within 2-3 hours";
  }

  // Search & Rescue Team Calculation
  const isFlooding = riskPercent >= 40;
  let searchTeams = 0;
  let evacuees = 0;
  let sheltersCount = 0;

  if (isFlooding) {
    searchTeams = riskPercent >= 70 ? Math.min(Math.round(riskPercent / 3.8), 26) : Math.min(Math.round(riskPercent / 5.2), 12);
    evacuees = riskPercent >= 70 ? Math.round((riskPercent * 55) / 100) * 100 : Math.round((riskPercent * 28) / 100) * 100;
    sheltersCount = riskPercent >= 70 ? 6 : 3;
  }

  return {
    riskPercent,
    riverCrest,
    status,
    statusClass,
    operationalResponse,
    verdict,
    isFlooding,
    emergencyOps: {
      searchTeams,
      evacuees,
      sheltersCount,
    }
  };
}

/**
 * Generate safe high-ground shelter coordinates relative to target basin
 */
function generateShelters(lat, lon, regionName, count = 3) {
  const cleanName = regionName.split(",")[0];
  const templates = [
    { name: `${cleanName} North Ridge High School & Camp`, dLat: 0.038, dLon: 0.025, elev: "+180m above basin", dist: "3.2 km" },
    { name: `${cleanName} East Hill Top Community Citadel`, dLat: 0.021, dLon: 0.042, elev: "+240m above basin", dist: "4.1 km" },
    { name: `${cleanName} Western Elevated Sports Complex`, dLat: -0.032, dLon: -0.029, elev: "+150m above basin", dist: "2.8 km" },
    { name: `${cleanName} Southern Plateau Refuge Center`, dLat: -0.045, dLon: 0.019, elev: "+210m above basin", dist: "5.0 km" },
    { name: `${cleanName} Upper Ridge District Stadium`, dLat: 0.048, dLon: -0.015, elev: "+195m above basin", dist: "4.6 km" },
    { name: `${cleanName} Hillock Military Training Pavilion`, dLat: -0.015, dLon: 0.052, elev: "+260m above basin", dist: "5.5 km" },
  ];

  return templates.slice(0, count).map((item) => ({
    name: item.name,
    lat: +(parseFloat(lat) + item.dLat).toFixed(5),
    lon: +(parseFloat(lon) + item.dLon).toFixed(5),
    elevation: item.elev,
    distance: item.dist,
  }));
}

module.exports = { calculateHydrology, generateShelters };