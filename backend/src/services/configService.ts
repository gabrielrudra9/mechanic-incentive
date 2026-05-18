export async function getConfig() {
  console.log('[CONFIG] Using mock config - Google Sheets integration pending');
  return {
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
