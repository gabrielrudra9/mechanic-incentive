import fetch from "node-fetch";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const SHEET_ID = process.env.GOOGLE_SHEETS_ID!;
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY!;

export async function getConfig() {
  try {
    console.log("[CONFIG] Fetching from Google Sheets...");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const ranges = ["BaseConfig!A:D", "Components!A:J", "Units!A:D", "Mechanics!A:E"];
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchGet?ranges=${ranges.join("&ranges=")}&key=${API_KEY}`;

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) throw new Error(`Google Sheets API error: ${response.status}`);

    const data = await response.json() as any;
    console.log("[CONFIG] ? Fetched successfully");

    return {
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
  } catch (error: any) {
    console.error("[CONFIG] ? Error:", error.message);
    console.log("[CONFIG] Falling back to empty config");
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
}
