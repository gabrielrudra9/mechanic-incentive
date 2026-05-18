let cachedConfig: any = null;
let lastFetchTime = 0;
const CACHE_TTL = 60000; // 1 menit

async function fetchFromSheets() {
  try {
    console.log("[CONFIG] Fetching from Google Sheets...");
    const ranges = ["BaseConfig!A:D", "Components!A:J", "Units!A:D", "Mechanics!A:E"];
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEETS_ID}/values:batchGet?ranges=${ranges.join("&ranges=")}&key=${process.env.GOOGLE_SHEETS_API_KEY}`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Status ${response.status}`);
    
    const data = await response.json() as any;
    cachedConfig = {
      baseConfig: {},
      redoConfig: {},
      unitFactors: {},
      workConditionFactors: {},
      timelinessFactors: {},
      safetySettings: {},
      components: data.valueRanges?.[1]?.values?.slice(1) || [],
      units: data.valueRanges?.[2]?.values?.slice(1) || [],
      mechanics: data.valueRanges?.[3]?.values?.slice(1) || [],
      lastUpdated: new Date(),
    };
    lastFetchTime = Date.now();
    console.log("[CONFIG] ? Fetched successfully");
  } catch (error: any) {
    console.error("[CONFIG] Fetch failed:", error.message);
  }
}

export async function getConfig() {
  const now = Date.now();
  if (!cachedConfig || now - lastFetchTime > CACHE_TTL) {
    await fetchFromSheets();
  }
  return cachedConfig || {
    baseConfig: {},
    redoConfig: {},
    unitFactors: {},
    workConditionFactors: {},
    timelinessFactors: {},
    safetySettings: {},
    components: [],
    units: [],
    mechanics: [],
    lastUpdated: new Date(),
  };
}

// Fetch sekali saat startup
fetchFromSheets();

export async function getMTBFThresholdHours(): Promise<number> {
  const config = await getConfig();
  return 90;
}

export async function getUnitFactor(unitId: string): Promise<number> {
  return 1.0;
}

export async function getConditionFactor(condition: string): Promise<number> {
  return 1.0;
}

export async function getBasePointsMultiplier(): Promise<number> {
  return 10;
}

export async function getPointsToIDRRate(): Promise<number> {
  return 50000;
}

export async function getREDOMultiplier(): Promise<number> {
  return 0.8;
}

export async function getNoREDOMultiplier(): Promise<number> {
  return 1.2;
}

export async function isSafetyIncidentPenalty(): Promise<boolean> {
  return false;
}

export async function getComponents() {
  const config = await getConfig();
  return config.components;
}

export async function getUnits() {
  const config = await getConfig();
  return config.units;
}

export async function getMechanics() {
  const config = await getConfig();
  return config.mechanics;
}
