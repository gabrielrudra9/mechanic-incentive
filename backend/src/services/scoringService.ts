import { Pool } from 'pg';

export interface ScoringInput {
  basePoints: number;
  unitId: string;
  workCondition: string;
  hasSafetyIncident: boolean;
  actualHours: number;
  targetHours: number;
  isMTBFRedo: boolean;
  mtbfThresholdHours: number;
}

export interface ScoringOutput {
  basePoints: number;
  unitFactor: number;
  conditionFactor: number;
  safetyFactor: number;
  mtbfFactor: number;
  timelinessOverride: number;
  finalPoints: number;
  payoutIDR: number;
}

// Mock config (will be replaced with getConfig later)
const mockConfig = {
  unitFactors: {
    'CAT 320': 1.2,
    'Volvo': 1.0,
    'Komatsu': 0.8,
    'Dozer': 1.1
  },
  workConditionFactors: {
    'normal': 1.0,
    'difficult': 1.1,
    'extreme': 1.2
  },
  timelinessFactors: {
    'Late': 0.5,
    'Normal': 0.8,
    'On-Time': 1.0
  },
  pointsToIDRRate: 50000
};

export async function calculateScore(input: ScoringInput): Promise<ScoringOutput> {
  const {
    basePoints,
    unitId,
    workCondition,
    hasSafetyIncident,
    actualHours,
    targetHours,
    isMTBFRedo,
    mtbfThresholdHours
  } = input;

  // Unit Factor
  const unitFactor = mockConfig.unitFactors[unitId as keyof typeof mockConfig.unitFactors] || 1.0;

  // Condition Factor
  const conditionFactor = mockConfig.workConditionFactors[workCondition as keyof typeof mockConfig.workConditionFactors] || 1.0;

  // Safety Factor (1.0 or 0)
  const safetyFactor = hasSafetyIncident ? 0 : 1.0;

  // MTBF Factor
  const mtbfFactor = isMTBFRedo ? 0.8 : 1.2;

  // Timeliness Factor
  const ratio = actualHours / targetHours;
  let timelinessOverride = 1.0;
  if (ratio > 1.5) {
    timelinessOverride = 0.5; // Late
  } else if (ratio > 1.0) {
    timelinessOverride = 0.8; // Normal
  } else {
    timelinessOverride = 1.0; // On-Time
  }

  // Calculate final points
  const finalPoints = basePoints * unitFactor * conditionFactor * safetyFactor * mtbfFactor * timelinessOverride;

  // Calculate payout
  const payoutIDR = finalPoints * mockConfig.pointsToIDRRate;

  return {
    basePoints,
    unitFactor,
    conditionFactor,
    safetyFactor,
    mtbfFactor,
    timelinessOverride,
    finalPoints,
    payoutIDR
  };
}

export async function detectMTBFRedo(
  mechanicId: string,
  componentId: string,
  thresholdHours: number,
  db: Pool
): Promise<boolean> {
  try {
    const result = await db.query(
      `SELECT COALESCE(SUM(wo.target_hours), 0) as total_hours
       FROM work_orders wo
       WHERE wo.created_by = $1
         AND wo.component_id = $2
         AND wo.status = 'approved'
       ORDER BY wo.created_at DESC`,
      [mechanicId, componentId]
    );

    const totalHours = result.rows[0]?.total_hours || 0;
    
    // If total hours < threshold, it's a redo
    return totalHours < thresholdHours;
  } catch (error) {
    console.error('MTBF detection error:', error);
    return false; // Default to no redo if error
  }
}