import dotenv from 'dotenv';
import path from 'path';

// Load .env FIRST
dotenv.config({ path: path.join(process.cwd(), '.env') });

console.log('[INIT] Environment loaded');
console.log('[INIT] GOOGLE_SHEETS_API_KEY:', process.env.GOOGLE_SHEETS_API_KEY?.substring(0, 20) + '...');
console.log('[INIT] GOOGLE_SHEETS_ID:', process.env.GOOGLE_SHEETS_ID);

import Fastify from 'fastify';
import cors from '@fastify/cors';
import pg from 'pg';
import { getConfig, getMTBFThresholdHours } from './services/configService.js';
import { calculateScore, detectMTBFRedo } from './services/scoringService.js';

const { Pool } = pg;

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const fastify = Fastify({
  logger: true,
});

await fastify.register(cors, {
  origin: '*', credentials: false
});

// Health check
fastify.get('/health', async (request, reply) => {
  return { status: 'ok' };
});

// Get all components
fastify.get('/api/components', async (request, reply) => {
  try {
    const config = await getConfig();
    return reply.status(200).send({
      status: 'success',
      data: config.components,
      timestamp: new Date(),
    });
  } catch (error: any) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Failed to fetch components', details: error.message });
  }
});

// Create WO (ENHANCED with adjusted values)
fastify.post('/api/work-orders', async (request, reply) => {
  const body = request.body as any;
  const { 
    componentNo, 
    isOthersJob, 
    othersDescription,
    teamMembers,
    workCondition,
    unitId,
    notes,
    // ADJUSTED VALUES from frontend
    basePoints: adjustedBasePoints,
    baseTargetHours: adjustedTargetHours,
    loadJob: adjustedLoadJob,
    jobType: adjustedJobType,
    teamSize: adjustedTeamSize
  } = body;

  try {
    let basePoints = adjustedBasePoints || 0;
    let baseTargetHours = adjustedTargetHours || 0;
    let baseTargetDays = 1;
    let teamSize = adjustedTeamSize || 1;
    let loadJob = adjustedLoadJob || '';
    let jobType = adjustedJobType || '';

    // Get master values from component if not "Others" (untuk reference saja)
    if (!isOthersJob && componentNo) {
      const config = await getConfig();
      const component = config.components.find((c: any) => c.no === componentNo);
      if (component) {
        baseTargetDays = component.baseTargetDays;
        // Use adjusted values if provided, otherwise use master
        if (!adjustedBasePoints) basePoints = component.basePoints;
        if (!adjustedTargetHours) baseTargetHours = component.baseTargetHours;
        if (!adjustedLoadJob) loadJob = component.loadJob;
        if (!adjustedJobType) jobType = component.jobAssignment;
        if (!adjustedTeamSize) teamSize = component.teamSize;
      }
    }

    // Insert work order dengan adjusted values
    const result = await db.query(
      `INSERT INTO work_orders (
        wo_number, 
        component_id, 
        is_others_job, 
        others_description,
        base_points,
        target_hours,
        load_job,
        job_type,
        team_size,
        work_condition,
        unit_id,
        notes,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [
        `WO-${Date.now()}`,
        componentNo || null,
        isOthersJob || false,
        othersDescription || null,
        basePoints,
        baseTargetHours,
        loadJob,
        jobType,
        teamMembers?.length || teamSize,
        workCondition || 'normal',
        unitId || null,
        notes || null,
        'created'
      ]
    );

    const woId = result.rows[0].id;

    // Insert team members if provided
    if (teamMembers && teamMembers.length > 0) {
      for (const member of teamMembers) {
        await db.query(
          `INSERT INTO work_order_team (
            work_order_id, 
            mechanic_id, 
            role_name,
            is_lead
          ) VALUES ($1, $2, $3, $4)`,
          [woId, member.name, member.name, member.isLead || false]
        );
      }
    }

    return reply.status(201).send(result.rows[0]);
  } catch (error: any) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Failed to create work order', details: error.message });
  }
});

// List WO
fastify.get('/api/work-orders', async (request, reply) => {
  try {
    const result = await db.query('SELECT * FROM work_orders ORDER BY created_at DESC LIMIT 100');
    return result.rows;
  } catch (error: any) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Failed to fetch work orders' });
  }
});

// Get single work order by ID
fastify.get('/api/work-orders/:id', async (request, reply) => {
  try {
    const { id } = request.params as any;
    const result = await db.query('SELECT * FROM work_orders WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Work order not found' });
    }
    return reply.status(200).send(result.rows[0]);
  } catch (error: any) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Failed to fetch work order', details: error.message });
  }
});

// Get team members for WO
fastify.get('/api/work-orders/:id/team', async (request, reply) => {
  try {
    const { id } = request.params as any;
    const result = await db.query(
      'SELECT mechanic_id, role_name, is_lead FROM work_order_team WHERE work_order_id = $1 ORDER BY is_lead DESC',
      [id]
    );
    return result.rows;
  } catch (error: any) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Failed to fetch team members' });
  }
});

// Get WOs assigned to mechanic (WITH COMPONENT DESCRIPTION - FIXED)
fastify.get('/api/work-orders/mechanic/:mechanicName', async (request, reply) => {
  try {
    const { mechanicName } = request.params as any;

    const result = await db.query(
      `SELECT DISTINCT wo.* FROM work_orders wo
       LEFT JOIN work_order_team wot ON wo.id = wot.work_order_id
       WHERE wo.status = 'created' AND (wot.mechanic_id = $1 OR wot.role_name = $1)
       ORDER BY wo.created_at DESC`,
      [mechanicName]
    );

    // Enrich dengan component description dari config
    const config = await getConfig();
    const enrichedWOs = result.rows.map((wo: any) => {
      let componentDescription = wo.component_id || 'Others Job';
      
      // Try to find component in config
      if (wo.component_id && config.components) {
        const component = config.components.find((c: any) => c.no === wo.component_id);
        if (component && component.componentName) {
          // Found dengan componentName (BUKAN name!)
          componentDescription = `${component.no} - ${component.componentName}`;
        } else if (component) {
          // Found tapi componentName kosong - fallback ke component_id saja
          componentDescription = `${component.no}`;
        } else {
          // Tidak ketemu di config - gunakan component_id
          componentDescription = `${wo.component_id}`;
        }
      } else if (wo.is_others_job && wo.others_description) {
        // Others job - gunakan description
        componentDescription = wo.others_description;
      }

      return {
        ...wo,
        componentDescription // Add enriched description
      };
    });

    return enrichedWOs;
  } catch (error: any) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Failed to fetch mechanic work orders' });
  }
});

// Approvals
fastify.post('/api/approvals', async (request, reply) => {
  const body = request.body as any;
  const { workOrderId, status, reason } = body;
  
  try {
    const approvalResult = await db.query(
      'INSERT INTO approvals (work_order_id, approval_stage, status, override_reason) VALUES ($1, $2, $3, $4) RETURNING *',
      [workOrderId, 'supervisor', status, reason]
    );

    await db.query(
      'UPDATE work_orders SET status = $1 WHERE id = $2',
      [status === 'approved' ? 'approved' : 'rejected', workOrderId]
    );

    return reply.status(201).send(approvalResult.rows[0]);
  } catch (error: any) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Failed to create approval' });
  }
});

// Pending approvals
fastify.get('/api/approvals/pending', async (request, reply) => {
  try {
    const result = await db.query(
      `SELECT wo.*, a.id as approval_id, 
              STRING_AGG(DISTINCT wot.mechanic_id, ', ') as team_members
       FROM work_orders wo 
       LEFT JOIN approvals a ON wo.id = a.work_order_id
       LEFT JOIN work_order_team wot ON wo.id = wot.work_order_id
       WHERE wo.status IN ($1, $2) 
       GROUP BY wo.id, a.id
       ORDER BY wo.created_at ASC`,
      ['created', 'wait_mtbf']
    );
    return result.rows;
  } catch (error: any) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Failed to fetch pending approvals' });
  }
});

// Update work order with approval data
fastify.post('/api/approvals/submit', async (request, reply) => {
  const body = request.body as any;
  const { 
    workOrderId, 
    status, 
    completedAt,
    actualHours,
    timelinessRatio,
    timelinessStatus,
    safetyIncident,
    finalPoints,
    pointsPerMechanic,
    reason
  } = body;

  try {
    // Get work order details first
    const woResult = await db.query(
      'SELECT * FROM work_orders WHERE id = $1',
      [workOrderId]
    );
    
    if (woResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Work order not found' });
    }

    const workOrder = woResult.rows[0];

    // Update work_orders table
    const result = await db.query(
      `UPDATE work_orders SET 
        status = $1,
        completed_at = $2,
        actual_hours = $3,
        timeliness_ratio = $4,
        mtbf_status = $5,
        safety_incident = $6,
        final_points = $7,
        points_per_mechanic = $8,
        updated_at = NOW()
      WHERE id = $9 RETURNING *`,
      [
        status === 'approved' ? 'approved' : 'rejected',
        completedAt || null,
        actualHours || null,
        timelinessRatio || null,
        timelinessStatus || 'waiting',
        safetyIncident || false,
        finalPoints || null,
        pointsPerMechanic || null,
        workOrderId
      ]
    );

    // Update approvals table
    await db.query(
      `UPDATE approvals SET status = $1, override_reason = $2 WHERE work_order_id = $3`,
      [status === 'approved' ? 'approved' : 'rejected', reason || null, workOrderId]
    );

    // DEBUG
    fastify.log.info({ status, finalPoints, workOrderId, statusType: typeof status, finalPointsType: typeof finalPoints }, 'DEBUG APPROVAL');
    fastify.log.info({ isApproved: status === 'approved', hasFinalPoints: !!finalPoints }, 'Condition check');

    // If APPROVED, insert into mechanic_points
    if (status === 'approved' && finalPoints) {
      const config = await getConfig();
      
      // Get team members for this WO
      const teamResult = await db.query(
        'SELECT mechanic_id, role_name FROM work_order_team WHERE work_order_id = $1',
        [workOrderId]
      );

      const teamMembers = teamResult.rows.length > 0 
        ? teamResult.rows 
        : [{ mechanic_id: 'UNKNOWN', role_name: 'Unassigned' }];

      // Calculate factors for display
      const unitFactor = workOrder.unit_id && config.unitFactors 
        ? config.unitFactors[workOrder.unit_id] || 1.0 
        : 1.0;
      
      const workConditionFactor = workOrder.work_condition && config.workConditionFactors
        ? config.workConditionFactors[workOrder.work_condition] || 1.0
        : 1.0;

      const safetyFactor = safetyIncident ? 0 : 1.0;

      // Get timeliness factor from status
      let timelinesFactor = 1.0;
      if (timelinessStatus === 'late') timelinesFactor = 0.8;
      else if (timelinessStatus === 'way_late') timelinesFactor = 0.5;

      // Get current week/month/year
      const now = new Date();
      const weekNumber = Math.ceil((now.getDate() - now.getDay()) / 7);
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      // Insert mechanic_points for each team member
      for (const member of teamMembers) {
        await db.query(
          `INSERT INTO mechanic_points (
            mechanic_id, mechanic_name, work_order_id,
            base_points, final_points, unit_factor, work_condition_factor,
            timeliness_factor, safety_factor, week_number, month, year,
            work_condition, unit_id, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())`,
          [
            member.mechanic_id,
            member.role_name,
            workOrderId,
            workOrder.base_points || 0,
            finalPoints || 0,
            unitFactor,
            workConditionFactor,
            timelinesFactor,
            safetyFactor,
            weekNumber,
            month,
            year,
            workOrder.work_condition || 'normal',
            workOrder.unit_id || null
          ]
        );
      }
    }

    return reply.status(200).send(result.rows[0]);
  } catch (error: any) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Failed to submit approval', details: error.message });
  }
});

// Mechanic points weekly summary
fastify.get('/api/mechanic-points/weekly-summary', async (request, reply) => {
  try {
    const { week, month, year } = request.query as any;

    const result = await db.query(
      `SELECT 
        mechanic_id, 
        mechanic_name, 
        COUNT(DISTINCT work_order_id) as work_orders_count,
        SUM(final_points) as total_points
      FROM mechanic_points
      WHERE week_number = $1 AND month = $2 AND year = $3
      GROUP BY mechanic_id, mechanic_name
      ORDER BY total_points DESC`,
      [parseInt(week), parseInt(month), parseInt(year)]
    );

    const mechanics = result.rows.map((row: any) => ({
      mechanic_id: row.mechanic_id,
      mechanic_name: row.mechanic_name,
      work_orders_count: parseInt(row.work_orders_count),
      total_points: parseFloat(row.total_points) || 0,
      idr_value: (parseFloat(row.total_points) || 0) * 50000
    }));

    return reply.status(200).send({
      status: 'success',
      week: parseInt(week),
      month: parseInt(month),
      year: parseInt(year),
      mechanics,
      timestamp: new Date()
    });
  } catch (error: any) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Failed to fetch weekly summary', details: error.message });
  }
});

// Update WO (untuk start/finish) - WITH MTBF DETECTION & REDO LOGIC
fastify.patch('/api/work-orders/:id', async (request, reply) => {
  try {
    const { id } = request.params as any;
    const body = request.body as any;
    const { notes } = body;

    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;

    let finalPoints = null;
    let actualHours = null;
    let timelinessRatio = null;
    let timelinessStatus = 'waiting';
    let mtbfExpiryDate = null;
    let mtbfRedoStatus = null;
    let newStatus = null;

    // Get WO details
    const woResult = await db.query('SELECT * FROM work_orders WHERE id = $1', [id]);
    if (woResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Work order not found' });
    }

    const wo = woResult.rows[0];

    // Set started_at jika belum ada
    if (!wo.started_at && !body.started_at) {
      updateFields.push(`started_at = NOW()`);
    } else if (body.started_at) {
      updateFields.push(`started_at = $${paramCount}`);
      updateValues.push(body.started_at);
      paramCount++;
    }

    // ✅ HANDLE COMPLETED_AT & MTBF LOGIC
    if (!body.completed_at && wo.started_at) {
      // Mechanic klik FINISH - set completed_at dari server
      updateFields.push(`completed_at = NOW() AT TIME ZONE 'Asia/Bangkok'`);
      
      try {
        const config = await getConfig();
        const now = new Date();
        const startTime = new Date(wo.started_at).getTime();
        const endTime = now.getTime();
        actualHours = (endTime - startTime) / (1000 * 60 * 60);

        const targetHours = parseFloat(wo.target_hours) || 8;
        timelinessRatio = (actualHours / targetHours) * 100;

        if (timelinessRatio <= 100) {
          timelinessStatus = 'on_time';
        } else if (timelinessRatio <= 150) {
          timelinessStatus = 'late';
        } else {
          timelinessStatus = 'way_late';
        }

        const basePoints = parseFloat(wo.base_points) || 0;
        const unitFactor = config.unitFactors[wo.unit_id] || 1.0;
        const workConditionFactor = config.workConditionFactors[wo.work_condition] || 1.0;
        const safetyFactor = 1.0;
        
        let timelinesFactor = 1.0;
        if (timelinessStatus === 'late') timelinesFactor = 0.8;
        else if (timelinessStatus === 'way_late') timelinesFactor = 0.5;

        finalPoints = basePoints * unitFactor * workConditionFactor * timelinesFactor * safetyFactor;

        console.log(`[AUTO-CALC] WO ${wo.wo_number}: ${finalPoints.toFixed(2)} points`);

        // ✅ MTBF LOGIC - SAAT MECHANIC FINISH
        const mtbfThresholdHours = await getMTBFThresholdHours();
        const mtbfThresholdMs = mtbfThresholdHours * 60 * 60 * 1000; // Convert jam ke milliseconds
        mtbfExpiryDate = new Date(now.getTime() + mtbfThresholdMs);

        console.log(`[MTBF] Threshold: ${mtbfThresholdHours} hours, Expiry: ${mtbfExpiryDate}`);

        // ✅ DETECT REDO
        // Cari WO lain dengan component_id + unit_id sama yang status 'wait_mtbf'
        const redoCheckResult = await db.query(
          `SELECT id, wo_number FROM work_orders 
           WHERE component_id = $1 
           AND unit_id = $2 
           AND status = 'wait_mtbf'
           AND id != $3`,
          [wo.component_id, wo.unit_id, id]
        );

        if (redoCheckResult.rows.length > 0) {
          // Ada WO lain dengan component + unit yang sama dalam status wait_mtbf → REDO DETECTED!
          mtbfRedoStatus = 'detected';
          console.log(`[REDO] DETECTED! Found ${redoCheckResult.rows.length} prior WO with same component+unit`);
        } else {
          // Tidak ada WO lain → NO REDO
          mtbfRedoStatus = 'no_redo';
          console.log(`[REDO] NO REDO - No prior WO with same component+unit in wait_mtbf`);
        }

        // ✅ UPDATE STATUS TO 'wait_mtbf' (BUKAN 'created' lagi)
        newStatus = 'wait_mtbf';

      } catch (calcError: any) {
        console.log('[AUTO-CALC] Warning:', calcError.message);
      }

    } else if (body.completed_at) {
      // Approval page override
      updateFields.push(`completed_at = $${paramCount}`);
      updateValues.push(body.completed_at);
      paramCount++;

      try {
        const config = await getConfig();

        if (wo.started_at) {
          const startTime = new Date(wo.started_at).getTime();
          const endTime = new Date(body.completed_at).getTime();
          actualHours = (endTime - startTime) / (1000 * 60 * 60);

          const targetHours = parseFloat(wo.target_hours) || 8;
          timelinessRatio = (actualHours / targetHours) * 100;

          if (timelinessRatio <= 100) {
            timelinessStatus = 'on_time';
          } else if (timelinessRatio <= 150) {
            timelinessStatus = 'late';
          } else {
            timelinessStatus = 'way_late';
          }
        }

        const basePoints = parseFloat(wo.base_points) || 0;
        const unitFactor = config.unitFactors[wo.unit_id] || 1.0;
        const workConditionFactor = config.workConditionFactors[wo.work_condition] || 1.0;
        const safetyFactor = 1.0;
        
        let timelinesFactor = 1.0;
        if (timelinessStatus === 'late') timelinesFactor = 0.8;
        else if (timelinessStatus === 'way_late') timelinesFactor = 0.5;

        finalPoints = basePoints * unitFactor * workConditionFactor * timelinesFactor * safetyFactor;

        console.log(`[AUTO-CALC] WO ${wo.wo_number}: ${finalPoints.toFixed(2)} points`);
      } catch (calcError: any) {
        console.log('[AUTO-CALC] Warning:', calcError.message);
      }
    }

    if (notes) {
      updateFields.push(`notes = $${paramCount}`);
      updateValues.push(notes);
      paramCount++;
    }

    // Add auto-calculated values
    if (finalPoints !== null) {
      updateFields.push(`final_points = $${paramCount}`);
      updateValues.push(finalPoints);
      paramCount++;
    }
    if (actualHours !== null) {
      updateFields.push(`actual_hours = $${paramCount}`);
      updateValues.push(actualHours);
      paramCount++;
    }
    if (timelinessRatio !== null) {
      updateFields.push(`timeliness_ratio = $${paramCount}`);
      updateValues.push(timelinessRatio);
      paramCount++;
    }
    if (timelinessStatus && timelinessStatus !== 'waiting') {
      updateFields.push(`mtbf_status = $${paramCount}`);
      updateValues.push(timelinessStatus);
      paramCount++;
    }

    // ✅ ADD MTBF FIELDS
    if (mtbfExpiryDate) {
      updateFields.push(`mtbf_expiry_date = $${paramCount}`);
      updateValues.push(mtbfExpiryDate);
      paramCount++;
    }
    if (mtbfRedoStatus) {
      updateFields.push(`mtbf_redo_status = $${paramCount}`);
      updateValues.push(mtbfRedoStatus);
      paramCount++;
    }
    if (newStatus) {
      updateFields.push(`status = $${paramCount}`);
      updateValues.push(newStatus);
      paramCount++;
    }

    updateFields.push(`updated_at = NOW()`);
    updateValues.push(id);

    const query = `UPDATE work_orders SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING *`;

    const result = await db.query(query, updateValues);

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Work order not found' });
    }

    const updatedWO = result.rows[0];

    // ✅ INSERT INTO mtbf_tracks (untuk tracking REDO)
    if (mtbfRedoStatus && updatedWO.mtbf_expiry_date) {
      try {
        await db.query(
          `INSERT INTO mtbf_tracks (work_order_id, status, override_applied, created_at)
           VALUES ($1, $2, $3, NOW())`,
          [id, 'pending', false]
        );
        console.log(`[MTBF_TRACKS] Inserted for WO ${updatedWO.wo_number}`);
      } catch (trackError: any) {
        console.warn('[MTBF_TRACKS] Warning:', trackError.message);
      }
    }

    console.log(`[FINISH] WO ${updatedWO.wo_number} completed at ${updatedWO.completed_at}`);
    console.log(`[MTBF] Status: ${mtbfRedoStatus}, Expiry: ${updatedWO.mtbf_expiry_date}`);

    return reply.status(200).send({
      ...updatedWO,
      mtbf_info: {
        mtbf_redo_status: mtbfRedoStatus,
        mtbf_expiry_date: mtbfExpiryDate,
        status: newStatus
      }
    });
  } catch (error: any) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Failed to update work order', details: error.message });
  }
});


// ✅ DELETE Work Order (Soft Delete)
fastify.delete('/api/work-orders/:id', async (request, reply) => {
  try {
    const { id } = request.params as any;

    // Check if WO exists
    const woResult = await db.query(
      'SELECT * FROM work_orders WHERE id = $1',
      [id]
    );

    if (woResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Work order not found' });
    }

    const workOrder = woResult.rows[0];

    // Soft delete - mark as deleted
    await db.query(
      'UPDATE work_orders SET status = $1, updated_at = NOW() WHERE id = $2',
      ['deleted', id]
    );

    // Also delete team members
    await db.query(
      'DELETE FROM work_order_team WHERE work_order_id = $1',
      [id]
    );

    // Delete related approvals
    await db.query(
      'DELETE FROM approvals WHERE work_order_id = $1',
      [id]
    );

    console.log(`[DELETE] WO ${workOrder.wo_number} (ID: ${id}) deleted successfully`);

    return reply.status(200).send({
      status: 'success',
      message: `Work Order ${workOrder.wo_number} deleted`,
      deletedWO: workOrder
    });
  } catch (error: any) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Failed to delete work order', details: error.message });
  }
});


// Config sync
fastify.get('/api/config/sync', async (request, reply) => {
  try {
    const config = await getConfig();
    return reply.status(200).send({
      status: 'success',
      data: config,
      timestamp: new Date(),
    });
  } catch (error: any) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Failed to sync config', details: error.message });
  }
});

// Error handler
fastify.setErrorHandler(async (error, request, reply) => {
  fastify.log.error(error);
  return reply.status(500).send({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined,
  });
});

// Start
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3001');
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Server running on http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

