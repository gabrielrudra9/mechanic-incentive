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

function arrayToObject(rows: any[][], headers: string[]): any[] {
  return rows.map(row => {
    const obj: any = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

async function fetchFromSheets() {
  if (isFetching) return;
  
  isFetching = true;
  try {
    console.log("[CONFIG] Fetching all sheets from Google Sheets...");
    
    const [componentsRaw, unitsRaw, mechanicsRaw, baseConfigRaw, unitFactorsRaw, workConditionFactorsRaw, timelinessFactorsRaw, safetySettingsRaw, redoConfigRaw] = await Promise.all([
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
    
    // Transform arrays to objects with id field
    const components = componentsRaw.map((row: any[]) => ({
      id: row[0],
      no: row[0],
      componentName: row[1],
      technicalType: row[2],
      loadJob: row[3],
      baseTargetHours: row[4],
      baseTargetDays: row[5],
      basePoints: row[6],
      jobAssignment: row[7],
      teamSize: row[8],
      isActive: row[9],
    }));
    
    const units = unitsRaw.map((row: any[]) => ({
      id: row[1],
      no: row[0],
      unitId: row[1],
      unitName: row[2],
      equipmentType: row[3],
    }));
    
    const mechanics = mechanicsRaw.map((row: any[]) => ({
      id: row[1],
      no: row[0],
      mechanicId: row[1],
      mechanicName: row[2],
      department: row[3],
      status: row[4],
    }));
    
    cachedConfig = {
      baseConfig: baseConfigRaw,
      redoConfig: redoConfigRaw,
      unitFactors: unitFactorsRaw,
      workConditionFactors: workConditionFactorsRaw,
      timelinessFactors: timelinessFactorsRaw,
      safetySettings: safetySettingsRaw,
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
    console.log("  - BaseConfig:", baseConfigRaw.length);
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
