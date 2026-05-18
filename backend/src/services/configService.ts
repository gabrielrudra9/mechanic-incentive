import dotenv from 'dotenv';
import path from 'path';
import fetch from 'node-fetch';

dotenv.config({ path: path.join(process.cwd(), '.env') });

let cachedConfig: any = null;
let lastFetchTime = 0;
const CACHE_TTL = 60000;
let isFetching = false;

async function fetchFromSheets() {
  if (isFetching) return; // Skip if already fetching
  
  isFetching = true;
  try {
    console.log("[CONFIG] Fetching from Google Sheets...");
    const SHEET_ID = process.env.GOOGLE_SHEETS_ID;
    const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
    
    if (!SHEET_ID || !API_KEY) {
      throw new Error("Missing env vars");
    }
    
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Components?key=${API_KEY}`;
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
      components: data.values?.slice(1) || [],
      units: [],
      mechanics: [],
      lastUpdated: new Date(),
    };
    lastFetchTime = Date.now();
    console.log("[CONFIG] ? Success, components:", cachedConfig.components.length);
  } catch (error: any) {
    console.error("[CONFIG] Error:", error.message);
    if (!cachedConfig) {
      cachedConfig = { baseConfig: {}, redoConfig: {}, unitFactors: {}, workConditionFactors: {}, timelinessFactors: {}, safetySettings: {}, components: [], units: [], mechanics: [], lastUpdated: new Date() };
    }
  } finally {
    isFetching = false;
  }
}

export async function getConfig() {
  // Return cache immediately (don't wait for fetch)
  if (!cachedConfig) {
    cachedConfig = { baseConfig: {}, redoConfig: {}, unitFactors: {}, workConditionFactors: {}, timelinessFactors: {}, safetySettings: {}, components: [], units: [], mechanics: [], lastUpdated: new Date() };
  }
  
  // Fetch in background if cache expired
  const now = Date.now();
  if (now - lastFetchTime > CACHE_TTL) {
    fetchFromSheets(); // Don't await!
  }
  
  return cachedConfig;
}

// Initial fetch (don't wait)
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
