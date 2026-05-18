import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Pool } from 'pg';
import { getConfig } from './services/configService.js';
import { calculateScore, detectMTBFRedo, type ScoringInput } from './services/scoringService.js';

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const fastify = Fastify({ logger: true });

// Register CORS
await fastify.register(cors, {
  origin: true,
  credentials: true,
});

// Health check
fastify.get('/health', async (request, reply) => {
  return { status: 'ok' };
});

// Config sync endpoint
fastify.get('/api/config/sync', async (request, reply) => {
  try {
    const config = await getConfig();
    return {
      status: 'success',
      data: config,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return reply.status(500).send({
      status: 'error',
      error: 'Failed to sync config',
      details: (error as Error).message,
    });
  }
});

// Create Work Order
fastify.post('/api/work-orders', async (request, reply) => {
  try {
    const { notes } = request.body as { notes: string };

    if (!notes || notes.trim() === '') {
      return reply.status(400).send({
        error: 'Notes are required',
      });
    }

    const wo_number = `WO-${Date.now()}`;
    const result = await pool.query(
      `INSERT INTO work_orders (wo_number, notes, status, created_at) 
       VALUES ($1, $2, $3, NOW()) 
       RETURNING id, wo_number, notes, status, created_at`,
      [wo_number, notes, 'created']
    );

    const workOrder = result.rows[0];
    return {
      id: workOrder.id,
      wo_number: workOrder.wo_number,
      notes: workOrder.notes,
      status: workOrder.status,
      created_at: workOrder.created_at,
    };
  } catch (error) {
    console.error('Error creating work order:', error);
    return reply.status(500).send({
      error: 'Failed to create work order',
      details: (error as Error).message,
    });
  }
});

// List Work Orders
fastify.get('/api/work-orders', async (request, reply) => {
  try {
    const result = await pool.query(
      `SELECT id, wo_number, notes, status, created_at 
       FROM work_orders 
       ORDER BY created_at DESC`
    );

    return {
      status: 'success',
      data: result.rows,
    };
  } catch (error) {
    console.error('Error fetching work orders:', error);
    return reply.status(500).send({
      error: 'Failed to fetch work orders',
      details: (error as Error).message,
    });
  }
});

// Get Pending Approvals
fastify.get('/api/approvals/pending', async (request, reply) => {
  try {
    const result = await pool.query(
      `SELECT id, wo_number, notes, created_at 
       FROM work_orders 
       WHERE status = 'created' 
       ORDER BY created_at ASC`
    );

    return {
      status: 'success',
      data: result.rows,
    };
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    return reply.status(500).send({
      error: 'Failed to fetch pending approvals',
      details: (error as Error).message,
    });
  }
});

// Submit Approval with Scoring
fastify.post('/api/approvals', async (request, reply) => {
  const client = await pool.connect();

  try {
    const { workOrderId, status, reason, basePoints, unitId, workCondition, actualHours, targetHours } =
      request.body as {
        workOrderId: string;
        status: 'approved' | 'rejected';
        reason?: string;
        basePoints?: number;
        unitId?: string;
        workCondition?: 'normal' | 'difficult' | 'extreme';
        actualHours?: number;
        targetHours?: number;
      };

    if (!workOrderId || !status) {
      return reply.status(400).send({
        error: 'workOrderId and status are required',
      });
    }

    await client.query('BEGIN');

    // Insert approval record
    const approvalResult = await client.query(
      `INSERT INTO approvals (work_order_id, status, reason, created_at) 
       VALUES ($1, $2, $3, NOW()) 
       RETURNING id, work_order_id, status`,
      [workOrderId, status, reason || '']
    );

    const approval = approvalResult.rows[0];

    // Update work order status
    await client.query(`UPDATE work_orders SET status = $1 WHERE id = $2`, [status, workOrderId]);

    let scoringSnapshot = null;

    // If approved and scoring data provided, calculate and store points
    if (status === 'approved' && basePoints && unitId && workCondition && actualHours && targetHours) {
      try {
        // Detect MTBF redo
        const config = await getConfig();
        const mtbfThresholdDays = parseFloat(
          config.baseConfig['MTBF Days Threshold']?.value || '30'
        );
        const isMTBFRedo = await detectMTBFRedo(
          unitId,
          '', // job_code_id - can be added if needed
          mtbfThresholdDays,
          client
        );

        // Calculate score
        const scoringInput: ScoringInput = {
          basePoints,
          unitId,
          workCondition,
          hasSafetyIncident: false, // Can be determined from form/DB
          actualHours,
          targetHours,
          isMTBFRedo,
        };

        const score = await calculateScore(scoringInput);

        // Store scoring snapshot
        const scoreResult = await client.query(
          `INSERT INTO scoring_snapshots 
           (work_order_id, base_points, unit_factor, condition_factor, safety_factor, mtbf_factor, timeliness_factor, final_points, payout_idr, calculated_at) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) 
           RETURNING *`,
          [
            workOrderId,
            score.basePoints,
            score.unitFactor,
            score.conditionFactor,
            score.safetyFactor,
            score.mtbfFactor,
            score.timelinessFactor,
            score.finalPoints,
            score.payoutIDR,
          ]
        );

        scoringSnapshot = scoreResult.rows[0];
        console.log('✅ Scoring calculated and stored:', scoringSnapshot);
      } catch (scoringError) {
        console.warn('⚠️ Warning: Could not calculate scoring:', scoringError);
        // Don't fail approval if scoring fails
      }
    }

    await client.query('COMMIT');

    return {
      status: 'success',
      approval: {
        id: approval.id,
        work_order_id: approval.work_order_id,
        status: approval.status,
      },
      scoring: scoringSnapshot,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error submitting approval:', error);
    return reply.status(500).send({
      error: 'Failed to submit approval',
      details: (error as Error).message,
    });
  } finally {
    client.release();
  }
});

// Start server
const port = parseInt(process.env.PORT || '3001');
try {
  await fastify.listen({ port, host: '0.0.0.0' });
  console.log(`Server running on http://localhost:${port}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
