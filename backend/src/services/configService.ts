import dotenv from 'dotenv';
import path from 'path';
import fetch from 'node-fetch';

dotenv.config({ path: path.join(process.cwd(), '.env') });

let cachedConfig: any = null;
let lastFetchTime = 0;
const CACHE_TTL = 60000;
let isFetching = false;

async function fetchSheet(sheetName: string): Promise<any[]> {
  const SHEET_ID = process.env.GOOGLE_SHEETS_ID;
  const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${sheetName}?key=${API_KEY}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[CONFIG] ${sheetName} failed: Status ${response.status}`);
      return [];
    }
    const data = await response.json() as any;
    return data.values?.slice(1) || [];
  } catch (error: any) {
    console.error(`[CONFIG] ${sheetName} error:`, error.message);
    return [];
  }
}

async function fetchFromSheets() {
  if (isFetching) return;
  
  isFetching = true;
  try {
    console.log("[CONFIG] Fetching all sheets from Google Sheets...");
    
    const [components, units, mechanics, baseConfig, unitFactors, workConditionFactors, timelinessFactors, safetySettings, redoConfig] = await Promise.all([
      fetchSheet("Components"),
      fetchSheet("Units"),
      fetchSheet("Mechanics"),
      fetchSheet("BaseConfig"),
      fetchSheet("UnitFactors"),
      fetchSheet("WorkConditionFactors"),
      fetchSheet("TimelinessFactors"),
      fetchSheet("SafetySettings"),
      fetchSheet("RedoConfig"),
    ]);
    
    cachedConfig = {
      baseConfig: baseConfig,
      redoConfig: redoConfig,
      unitFactors: unitFactors,
      workConditionFactors: workConditionFactors,
      timelinessFactors: timelinessFactors,
      safetySettings: safetySettings,
      components: components,
      units: units,
      mechanics: mechanics,
      lastUpdated: new Date(),
    };
    lastFetchTime = Date.now();
    console.log("[CONFIG] ? All sheets fetched:");
    console.log("  - Components:", components.length);
    console.log("  - Units:", units.length);
    console.log("  - Mechanics:", mechanics.length);
    console.log("  - BaseConfig:", baseConfig.length);
  } catch (error: any) {
    console.error("[CONFIG] Error:", error.message);
    if (!cachedConfig) {
      cachedConfig = { baseConfig: [], redoConfig: [], unitFactors: [], workConditionFactors: [], timelinessFactors: [], safetySettings: [], components: [], units: [], mechanics: [], lastUpdated: new Date() };
    }
  } finally {
    isFetching = false;
  }
}

export async function getConfig() {
  if (!cachedConfig) {
    cachedConfig = { baseConfig: [], redoConfig: [], unitFactors: [], workConditionFactors: [], timelinessFactors: [], safetySettings: [], components: [], units: [], mechanics: [], lastUpdated: new Date() };
  }
  
  const now = Date.now();
  if (now - lastFetchTime > CACHE_TTL) {
    fetchFromSheets();
  }
  
  return cachedConfig;
}

fetchFromSheets();

export async function getMTBFThresholdHours(): Promise<number> { return 90; }
export async function getUnitFactor(unitId: string): Promise<number> { return 1.0; }
export async function getConditionFactor(condition: string): Promise<number> { return 1.0; }
export async function getBasePointsMultiplier(): Promise<number> { return 10; }
export async function getPointsToIDRRate(): Promise<number> { return 50000; }
export async function getREDOMultiplier(): Promise<number> { return 0.8; }
export async function getNoREDOMultiplier(): Promise<number> { return 1.2; }
export async function isSafetyIncidentPenalty(): Promise<boolean> { return false; }
export async function getComponents() { const config = await getConfig(); return config.components; }
export async function getUnits() { const config = await getConfig(); return config.units; }
export async function getMechanics() { const config = await getConfig(); return config.mechanics; }
