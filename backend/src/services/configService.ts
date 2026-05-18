import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';

// Load .env FIRST
dotenv.config({ path: path.join(process.cwd(), '.env') });

const SHEET_ID = process.env.GOOGLE_SHEETS_ID!;
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY!;

console.log('[CONFIG_SERVICE] SHEET_ID:', SHEET_ID);
console.log('[CONFIG_SERVICE] API_KEY:', API_KEY?.substring(0, 20) + '...');

interface ConfigCache {
  baseConfig: Record<string, any>;
  redoConfig: Record<string, any>;
  unitFactors: Record<string, number>;
  workConditionFactors: Record<string, number>;
  timelinessFactors: Record<string, number>;
  safetySettings: Record<string, any>;
  components: Record<string, any>[];
  units: Record<string, any>[];
  mechanics: Record<string, any>[];
  lastUpdated: Date;
}

export async function getConfig(): Promise<ConfigCache> {
  console.log('[CONFIG] Fetching FRESH config from Google Sheets (no cache)...');

  try {
    const ranges = [
      'BaseConfig!A:D',
      'RedoConfig!A:D',
      'UnitFactors!A:D',
      'WorkConditionFactors!A:C',
      'TimelinessFactors!A:C',
      'SafetySettings!A:C',
      'Components!A:J',
      'Units!A:D',
      'Mechanics!A:E'
    ];

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchGet?ranges=${ranges.join('&ranges=')}&key=${API_KEY}`;

    console.log('[CONFIG] URL:', url.substring(0, 100) + '...');

    const response = await fetch(url);
    const data = await response.json() as any;

    console.log('[CONFIG] Response status:', response.status);

    if (!response.ok) {
      throw new Error(data.error?.message || 'API Error');
    }

    const baseConfigData = data.valueRanges?.[0]?.values || [];
    const redoConfigData = data.valueRanges?.[1]?.values || [];
    const unitFactorsData = data.valueRanges?.[2]?.values || [];
    const conditionFactorsData = data.valueRanges?.[3]?.values || [];
    const timelinessFactorsData = data.valueRanges?.[4]?.values || [];
    const safetySettingsData = data.valueRanges?.[5]?.values || [];
    const componentsData = data.valueRanges?.[6]?.values || [];
    const unitsData = data.valueRanges?.[7]?.values || [];
    const mechanicsData = data.valueRanges?.[8]?.values || [];

    // Parse BaseConfig
    const baseConfig: Record<string, any> = {};
    baseConfigData.slice(1).forEach((row: any[]) => {
      if (row[0]) {
        baseConfig[row[0]] = { value: row[1], unit: row[2], effectiveDate: row[3] };
      }
    });

    // Parse RedoConfig
    const redoConfig: Record<string, any> = {};
    redoConfigData.slice(1).forEach((row: any[]) => {
      if (row[0]) {
        redoConfig[row[0]] = { value: parseFloat(row[1]) || 1.0, unit: row[2], effectiveDate: row[3] };
      }
    });

    console.log('[CONFIG] RedoConfig:', redoConfig);

    // Parse UnitFactors
    const unitFactors: Record<string, number> = {};
    unitFactorsData.slice(1).forEach((row: any[]) => {
      if (row[0]) unitFactors[row[0]] = parseFloat(row[2]) || 1.0;
    });

    // Parse WorkConditionFactors
    const workConditionFactors: Record<string, number> = {};
    conditionFactorsData.slice(1).forEach((row: any[]) => {
      if (row[0]) workConditionFactors[row[0]] = parseFloat(row[1]) || 1.0;
    });

    // Parse TimelinessFactors
    const timelinessFactors: Record<string, number> = {};
    timelinessFactorsData.slice(1).forEach((row: any[]) => {
      if (row[0]) timelinessFactors[row[0]] = parseFloat(row[1]) || 1.0;
    });

    // Parse SafetySettings
    const safetySettings: Record<string, any> = {};
    safetySettingsData.slice(1).forEach((row: any[]) => {
      if (row[0]) safetySettings[row[0]] = row[1];
    });

    // Parse Components
    const components: Record<string, any>[] = [];
    componentsData.slice(1).forEach((row: any[]) => {
      if (row[0] && row[1]) {
        components.push({
          no: row[0],
          componentName: row[1],
          technicalType: row[2],
          loadJob: row[3],
          baseTargetHours: parseFloat(row[4]) || 0,
          baseTargetDays: parseInt(row[5]) || 1,
          basePoints: parseFloat(row[6]) || 0,
          jobAssignment: row[7] || 'solo',
          teamSize: parseInt(row[8]) || 1,
          isActive: row[9] === 'true' ? true : false
        });
      }
    });

    // Parse Units
    const units: Record<string, any>[] = [];
    unitsData.slice(1).forEach((row: any[]) => {
      if (row[1]) {
        units.push({
          no: row[0],
          unitId: row[1],
          unitName: row[2],
          equipmentType: row[3]
        });
      }
    });

    // Parse Mechanics (NEW!)
    const mechanics: Record<string, any>[] = [];
    mechanicsData.slice(1).forEach((row: any[]) => {
      if (row[1]) {
        mechanics.push({
          no: row[0],
          mechanicId: row[1],
          mechanicName: row[2],
          department: row[3],
          status: row[4]
        });
      }
    });

    const config = {
      baseConfig,
      redoConfig,
      unitFactors,
      workConditionFactors,
      timelinessFactors,
      safetySettings,
      components,
      units,
      mechanics,
      lastUpdated: new Date(),
    };

    console.log('[CONFIG] ✅ Loaded FRESH successfully');
    console.log('[CONFIG] Components count:', components.length);
    console.log('[CONFIG] Units count:', units.length);
    console.log('[CONFIG] Mechanics count:', mechanics.length);
    return config;
  } catch (error: any) {
    console.error('[CONFIG] ❌ Error:', error.message);
    throw error;
  }
}

export async function getUnitFactor(unitId: string): Promise<number> {
  const config = await getConfig();
  return config.unitFactors[unitId] || 1.0;
}

export async function getConditionFactor(condition: string): Promise<number> {
  const config = await getConfig();
  return config.workConditionFactors[condition] || 1.0;
}

export async function getTimelinessFactors(): Promise<Record<string, number>> {
  const config = await getConfig();
  return config.timelinessFactors;
}

export async function getBasePointsMultiplier(): Promise<number> {
  const config = await getConfig();
  return parseFloat(config.baseConfig['Base Points Multiplier']?.value) || 10;
}

export async function getPointsToIDRRate(): Promise<number> {
  const config = await getConfig();
  return parseFloat(config.baseConfig['Points to IDR Rate']?.value) || 50000;
}

export async function getMTBFThresholdHours(): Promise<number> {
  const config = await getConfig();
  return parseFloat(config.baseConfig['MTBF Days Threshold']?.value) || 90;
}

// ✅ NEW: Get REDO Multiplier
export async function getREDOMultiplier(): Promise<number> {
  const config = await getConfig();
  return config.redoConfig['REDO Multiplier']?.value || 0.8;
}

// ✅ NEW: Get NO REDO Multiplier
export async function getNoREDOMultiplier(): Promise<number> {
  const config = await getConfig();
  return config.redoConfig['NO REDO Multiplier']?.value || 1.2;
}

export async function isSafetyIncidentPenalty(): Promise<boolean> {
  const config = await getConfig();
  return config.safetySettings['Safety Incident = 0 Pts'] === 'Yes';
}

export async function getComponents(): Promise<Record<string, any>[]> {
  const config = await getConfig();
  return config.components;
}

export async function getComponentByName(name: string): Promise<Record<string, any> | undefined> {
  const config = await getConfig();
  return config.components.find(c => c.componentName === name);
}

export async function getComponentByNo(no: string | number): Promise<Record<string, any> | undefined> {
  const config = await getConfig();
  return config.components.find(c => c.no === no);
}

export async function getUnits(): Promise<Record<string, any>[]> {
  const config = await getConfig();
  return config.units;
}

export async function getMechanics(): Promise<Record<string, any>[]> {
  const config = await getConfig();
  return config.mechanics;
}