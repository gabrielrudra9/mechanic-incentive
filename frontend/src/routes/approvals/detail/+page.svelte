<script>
  import { onMount } from 'svelte';

  let workOrder = $state(null);
  let config = $state(null);
  let teamMembers = $state([]);
  let loading = $state(true);
  let completedAt = $state('');
  let safetyIncident = $state(false);
  let actualHours = $state(0);
  let timelinessRatio = $state(0);
  let timelinessStatus = $state('waiting');
  let timelinessFactorValue = $state(1);
  let finalPoints = $state(0);
  let pointsPerMechanic = $state(0);

  const BACKEND_URL = 'https://mechanic-incentive.up.railway.app';

  // ✅ Format waktu - handle semua format (T atau space)
  function formatDateTime(isoString) {
    if (!isoString) return '-';
    
    // Database format: "2026-05-16 20:13:08" (space + seconds)
    if (isoString.includes(' ') && !isoString.includes('T')) {
      const [date, time] = isoString.split(' ');
      const timeOnly = time.split(':').slice(0, 2).join(':');  // "20:13"
      const [year, month, day] = date.split('-');
      return `${day}/${month}/${year} ${timeOnly}`;
    }
    
    // datetime-local format: "2026-05-16T21:32" (T format)
    // Browser input SUDAH Bangkok time (UTC+7)! JANGAN tambah 7 lagi!
    if (isoString.includes('T')) {
      const [date, time] = isoString.split('T');
      const timeOnly = time.split(':').slice(0, 2).join(':');  // "21:32"
      const [year, month, day] = date.split('-');
      return `${day}/${month}/${year} ${timeOnly}`;
    }
    
    return '-';
  }

  onMount(async () => {
    await loadWorkOrder();
    await loadConfig();
  });

  async function loadWorkOrder() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      let woId = urlParams.get('id');

      if (!woId) {
        const response = await fetch(`${BACKEND_URL}/api/approvals/pending`);
        if (response.ok) {
          const wos = await response.json();
          if (wos.length > 0) {
            woId = wos[0].id;
          }
        }
      }

      if (woId) {
        const response = await fetch(`${BACKEND_URL}/api/work-orders/${woId}`);
        if (response.ok) {
          workOrder = await response.json();
          
          const teamResponse = await fetch(`${BACKEND_URL}/api/work-orders/${woId}/team`);
          if (teamResponse.ok) {
            teamMembers = await teamResponse.json();
          }
          
          // ✅ FIX: Convert database format ke datetime-local
          if (workOrder.completed_at) {
            // Database format: "2026-05-16 20:13:08" (space)
            // Convert ke datetime-local format: "2026-05-16T20:13"
            if (workOrder.completed_at.includes(' ')) {
              const [date, time] = workOrder.completed_at.split(' ');
              const timeHHmm = time.substring(0, 5);  // "20:13"
              completedAt = `${date}T${timeHHmm}`;  // "2026-05-16T20:13"
            } else {
              completedAt = workOrder.completed_at.substring(0, 16);
            }
          }
          safetyIncident = workOrder.safety_incident || false;
          
          // ✅ HITUNG ACTUAL HOURS DARI MECHANIC DULU (jika ada completed_at dari mechanic)
          if (workOrder.started_at && workOrder.completed_at) {
            try {
              // Parse started_at - bisa format ISO "2026-05-16T14:26:28.450Z" atau space "2026-05-16 14:26"
              let startHours, startMins, startDate;
              
              if (workOrder.started_at.includes('T')) {
                // ISO format: "2026-05-16T14:26:28.450Z"
                const [date, timeWithZ] = workOrder.started_at.split('T');
                const time = timeWithZ.split(':').slice(0, 2).join(':');  // "14:26"
                const [h, m] = time.split(':');
                startHours = parseInt(h);
                startMins = parseInt(m);
                startDate = date;
              } else if (workOrder.started_at.includes(' ')) {
                // Space format: "2026-05-16 14:26:28"
                const [date, time] = workOrder.started_at.split(' ');
                const [h, m] = time.split(':');
                startHours = parseInt(h);
                startMins = parseInt(m);
                startDate = date;
              } else {
                console.warn('[FRONTEND] Unknown started_at format:', workOrder.started_at);
                return;
              }

              // Parse completed_at - bisa format ISO atau space
              let endHours, endMins, endDate;
              
              if (workOrder.completed_at.includes('T')) {
                // ISO format: "2026-05-16T20:26:28.450Z"
                const [date, timeWithZ] = workOrder.completed_at.split('T');
                const time = timeWithZ.split(':').slice(0, 2).join(':');  // "20:26"
                const [h, m] = time.split(':');
                endHours = parseInt(h);
                endMins = parseInt(m);
                endDate = date;
              } else if (workOrder.completed_at.includes(' ')) {
                // Space format: "2026-05-16 20:26:08"
                const [date, time] = workOrder.completed_at.split(' ');
                const [h, m] = time.split(':');
                endHours = parseInt(h);
                endMins = parseInt(m);
                endDate = date;
              } else {
                console.warn('[FRONTEND] Unknown completed_at format:', workOrder.completed_at);
                return;
              }

              // Hitung selisih jam
              let hoursDiff = endHours - startHours;
              let minsDiff = endMins - startMins;

              // Jika berbeda tanggal, tambah 24 jam
              if (endDate !== startDate) {
                hoursDiff += 24;
              }

              // Jika menit negatif, kurangi 1 jam dan tambah 60 menit
              if (minsDiff < 0) {
                hoursDiff--;
                minsDiff += 60;
              }

              actualHours = hoursDiff + (minsDiff / 60);

              const targetHours = parseFloat(workOrder.target_hours) || 8;
              timelinessRatio = (actualHours / targetHours) * 100;

              if (timelinessRatio <= 100) {
                timelinessStatus = 'on_time';
                timelinessFactorValue = 1.0;
              } else if (timelinessRatio <= 150) {
                timelinessStatus = 'late';
                timelinessFactorValue = 0.8;
              } else {
                timelinessStatus = 'way_late';
                timelinessFactorValue = 0.5;
              }

              console.log('[FRONTEND] Loaded mechanic completed time - Actual Hours:', { actualHours, timelinessStatus });
            } catch (error) {
              console.error('[FRONTEND] Error calculating mechanic hours:', error);
            }
          }

          // ✅ AUTO-LOAD calculated final_points dari backend (jika sudah di-approve sebelumnya)
          if (workOrder.final_points) {
            finalPoints = parseFloat(workOrder.final_points) || 0;
            
            // Calculate pointsPerMechanic
            const teamSize = parseInt(workOrder.team_size) || 1;
            pointsPerMechanic = finalPoints / teamSize;
            
            console.log('[FRONTEND] Loaded auto-calculated final points from backend:', { finalPoints });
          }
        }
      }
    } catch (error) {
      console.error('Failed to load work order', error);
    } finally {
      loading = false;
    }
  }

  async function loadConfig() {
    try {
      const response = await fetch(`${BACKEND_URL}/api/config/sync`);
      if (response.ok) {
        const data = await response.json();
        config = data.data;
      }
    } catch (error) {
      console.error('Failed to load config', error);
    }
  }

  function calculatePoints() {
    if (!workOrder || !config) return;

    try {
      // ✅ CALCULATION DENGAN OVERRIDE COMPLETED AT (dari supervisor)
      // Started At tetap dari Mechanic, tapi Completed At pakai dari override
      if (completedAt && workOrder.started_at) {
        // Parse startedAt dari database (mechanic) - bisa ISO atau space format
        let startHours, startMins, startDate;
        
        if (workOrder.started_at.includes('T')) {
          // ISO format: "2026-05-16T14:26:28.450Z"
          const [date, timeWithZ] = workOrder.started_at.split('T');
          const time = timeWithZ.split(':').slice(0, 2).join(':');
          const [h, m] = time.split(':');
          startHours = parseInt(h);
          startMins = parseInt(m);
          startDate = date;
        } else if (workOrder.started_at.includes(' ')) {
          // Space format: "2026-05-16 14:26:28"
          const [date, time] = workOrder.started_at.split(' ');
          const [h, m] = time.split(':');
          startHours = parseInt(h);
          startMins = parseInt(m);
          startDate = date;
        }

        // Parse completedAt dari input (supervisor override): "2026-05-16T21:32" 
        // Browser input SUDAH Bangkok time!
        const [date, time] = completedAt.split('T');
        const [hours, mins] = time.split(':');
        let endHours = parseInt(hours);
        let endMins = parseInt(mins);
        let endDate = date;

        // Hitung jam
        let hoursDiff = endHours - startHours;
        let minsDiff = endMins - startMins;

        // Jika berbeda tanggal, tambah 24 jam
        if (endDate !== startDate) {
          hoursDiff += 24;
        }

        // Jika menit negatif, kurangi 1 jam dan tambah 60 menit
        if (minsDiff < 0) {
          hoursDiff--;
          minsDiff += 60;
        }

        actualHours = hoursDiff + (minsDiff / 60);
        
        const targetHours = parseFloat(workOrder.target_hours) || 8;
        timelinessRatio = (actualHours / targetHours) * 100;

        if (timelinessRatio <= 100) {
          timelinessStatus = 'on_time';
          timelinessFactorValue = 1.0;
        } else if (timelinessRatio <= 150) {
          timelinessStatus = 'late';
          timelinessFactorValue = 0.8;
        } else {
          timelinessStatus = 'way_late';
          timelinessFactorValue = 0.5;
        }
      }

      const unitFactor = config.unitFactors[workOrder.unit_id] || 1.0;
      const workConditionFactor = config.workConditionFactors[workOrder.work_condition] || 1.0;
      const safetyFactor = safetyIncident ? 0 : 1.0;

      const basePoints = parseFloat(workOrder.base_points) || 0;
      finalPoints = basePoints * unitFactor * workConditionFactor * timelinessFactorValue * safetyFactor;

      const teamSize = parseInt(workOrder.team_size) || 1;
      pointsPerMechanic = finalPoints / teamSize;

      console.log('[FRONTEND] calculatePoints updated:', { actualHours, timelinessStatus, finalPoints });
    } catch (error) {
      console.error('[FRONTEND] Error in calculatePoints:', error);
    }
  }

  function handleCompletedAtChange() {
    // ⚠️ PENTING: datetime-local input BUKAN UTC!
    // Format input: "2026-05-16T21:20" = Bangkok time (UTC+7)
    // Jangan gunakan new Date(completedAt) langsung - hasilnya salah!
    // Hanya gunakan string langsung untuk calculation
    calculatePoints();
  }

  function handleSafetyChange() {
    calculatePoints();
  }

  function handleClearCompleted() {
    completedAt = '';
    handleCompletedAtChange();
  }

  async function handleApprove() {
    if (!workOrder) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/approvals/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workOrderId: workOrder.id,
          status: 'approved',
          completedAt,
          actualHours: parseFloat(actualHours.toFixed(2)),
          timelinessRatio: parseFloat(timelinessRatio.toFixed(2)),
          timelinessStatus,
          safetyIncident,
          finalPoints: parseFloat(finalPoints.toFixed(2)),
          pointsPerMechanic: parseFloat(pointsPerMechanic.toFixed(2)),
          reason: null
        })
      });

      if (response.ok) {
        alert('Work Order approved!');
        window.location.href = '/approvals';
      } else {
        const errorData = await response.json();
        alert('Failed to approve: ' + (errorData.error || 'Unknown error'));
      }
    } catch (error) {
      alert('Error: ' + error);
    }
  }

  async function handleReject() {
    if (!workOrder) return;

    const reason = prompt('Reason for rejection:');
    if (!reason) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/approvals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workOrderId: workOrder.id,
          status: 'rejected',
          reason
        })
      });

      if (response.ok) {
        alert('Work Order rejected!');
        window.location.href = '/approvals';
      } else {
        const errorData = await response.json();
        alert('Failed to reject: ' + (errorData.error || 'Unknown error'));
      }
    } catch (error) {
      alert('Error: ' + error);
    }
  }

  function getStatusColor(status) {
    switch (status) {
      case 'on_time':
        return '#4caf50';
      case 'late':
        return '#ff9800';
      case 'way_late':
        return '#f44336';
      default:
        return '#999';
    }
  }
</script>

<div class="container">
  <div class="header">
    <h1>📋 Approval Detail</h1>
    <a href="/approvals" class="back-link">← Back to Approvals</a>
  </div>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading work order...</p>
    </div>
  {:else if !workOrder}
    <div class="error">
      <p>Work order not found</p>
    </div>
  {:else}
    <div class="main-grid">
      <div class="card">
        <div class="card-header">
          <h2>Work Order Details</h2>
          <span class="wo-badge">{workOrder.wo_number}</span>
        </div>

        <div class="detail-section">
          <div class="detail-row">
            <span class="label">Component</span>
            <span class="value">{workOrder.component_id || 'Others Job'}</span>
          </div>
          <div class="detail-row">
            <span class="label">Description</span>
            <span class="value">{workOrder.others_description || 'Standard component'}</span>
          </div>
          <div class="detail-row">
            <span class="label">Unit ID</span>
            <span class="value">{workOrder.unit_id || '-'}</span>
          </div>
          <div class="detail-row">
            <span class="label">Work Condition</span>
            <span class="value">{workOrder.work_condition || 'normal'}</span>
          </div>
          <div class="detail-row">
            <span class="label">Team Size</span>
            <span class="value">{workOrder.team_size || 1}</span>
          </div>
          <div class="detail-row">
            <span class="label">Base Points</span>
            <span class="value" style="color: #4caf50; font-weight: 600;">{parseFloat(workOrder.base_points) || 0} pts</span>
          </div>

          <div class="team-section">
            <div class="team-label">👥 Dedicated Mechanics</div>
            {#if teamMembers.length > 0}
              <div class="team-list">
                {#each teamMembers as member (member.mechanic_id)}
                  <div class="team-item">
                    <span class="mechanic-name">{member.mechanic_id || member.role_name}</span>
                    {#if member.is_lead}
                      <span class="lead-badge">👑 Lead</span>
                    {/if}
                  </div>
                {/each}
              </div>
            {:else}
              <div class="no-team">No team assigned</div>
            {/if}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2>⏱️ Completion & Calculation</h2>
        </div>

        <div class="form-section">
          <div class="form-group">
            <label>Started At</label>
            <div class="readonly-field">
              {workOrder.started_at ? formatDateTime(workOrder.started_at) : 'Not started'}
            </div>
          </div>

          <div class="form-group">
            <label for="completedAt">Completed At * (Override from Supervisor)</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <input 
                id="completedAtDate"
                type="date"
                value={completedAt.split('T')[0] || ''}
                onchange={(e) => {
                  const date = e.target.value;
                  const time = completedAt.split('T')[1] || '00:00';
                  completedAt = `${date}T${time}`;
                  handleCompletedAtChange();
                }}
                style="padding: 10px; border: 2px solid #667eea; border-radius: 6px; font-size: 14px;"
              />
              <input 
                id="completedAtTime"
                type="time"
                value={completedAt.split('T')[1]?.substring(0, 5) || '00:00'}
                onchange={(e) => {
                  const time = e.target.value;
                  const date = completedAt.split('T')[0] || new Date().toISOString().split('T')[0];
                  completedAt = `${date}T${time}`;
                  handleCompletedAtChange();
                }}
                style="padding: 10px; border: 2px solid #667eea; border-radius: 6px; font-size: 14px;"
              />
            </div>
            {#if completedAt}
              <div style="margin-top: 8px; padding: 10px; background: #f5f5f5; border-radius: 6px; color: #333; font-weight: 500;">
                📅 {formatDateTime(completedAt)}
              </div>
              <button 
                type="button"
                onclick={handleClearCompleted}
                style="margin-top: 8px; padding: 10px 15px; border: 2px solid #f44336; border-radius: 6px; background: white; color: #f44336; font-weight: 600; cursor: pointer; font-size: 14px; width: 100%;"
              >
                ✕ Clear
              </button>
            {:else}
              <div class="status-badge waiting">⏳ WAITING FOR COMPLETION TIME</div>
            {/if}
          </div>

          {#if actualHours > 0}
            <div class="form-group">
              <label>Actual Hours</label>
              <div class="readonly-field">
                {actualHours.toFixed(2)} hrs
              </div>
            </div>

            <div class="form-group">
              <label>Target Hours</label>
              <div class="readonly-field">
                {(parseFloat(workOrder.target_hours) || 8).toFixed(2)} hrs
              </div>
            </div>

            <div class="form-group">
              <label>Timeliness</label>
              <div class="status-row">
                <div class="status-badge" style="background: {getStatusColor(timelinessStatus)}; color: white;">
                  {#if timelinessStatus === 'on_time'}
                    ✅ ON-TIME ({timelinessRatio.toFixed(0)}%)
                  {:else if timelinessStatus === 'late'}
                    ⚠️ LATE ({timelinessRatio.toFixed(0)}%)
                  {:else if timelinessStatus === 'way_late'}
                    ❌ WAY LATE ({timelinessRatio.toFixed(0)}%)
                  {/if}
                </div>
                <div class="info-text">Factor: {timelinessFactorValue}</div>
              </div>
            </div>
          {/if}

          <div class="form-group">
            <label>
              <input 
                type="checkbox"
                bind:checked={safetyIncident}
                onchange={handleSafetyChange}
              />
              Safety Incident?
            </label>
            {#if safetyIncident}
              <div class="warning-badge">⚠️ Safety incident = 0 points</div>
            {/if}
          </div>
        </div>
      </div>
    </div>

    <div class="card calculation-card">
      <div class="card-header">
        <h2>🎯 Points Calculation</h2>
      </div>

      <div class="calculation-section">
        <div class="calc-row">
          <span class="label">Base Points</span>
          <span class="value">{(parseFloat(workOrder.base_points) || 0).toFixed(2)}</span>
        </div>
        
        {#if config}
          <div class="calc-row">
            <span class="label">× Unit Factor ({workOrder.unit_id})</span>
            <span class="value">{(config.unitFactors[workOrder.unit_id] || 1.0).toFixed(2)}</span>
          </div>
          
          <div class="calc-row">
            <span class="label">× Work Condition ({workOrder.work_condition})</span>
            <span class="value">{(config.workConditionFactors[workOrder.work_condition] || 1.0).toFixed(2)}</span>
          </div>
          
          <div class="calc-row">
            <span class="label">× Timeliness ({timelinessStatus})</span>
            <span class="value">{timelinessFactorValue.toFixed(2)}</span>
          </div>
          
          <div class="calc-row">
            <span class="label">× Safety (incident: {safetyIncident ? 'yes' : 'no'})</span>
            <span class="value">{safetyIncident ? '0.00' : '1.00'}</span>
          </div>
        {/if}

        <div class="calc-row divider">
          <span class="label">Final Points (Total)</span>
          <span class="value highlight">{finalPoints.toFixed(2)} pts</span>
        </div>

        <div class="calc-row">
          <span class="label">÷ Team Size ({parseInt(workOrder.team_size) || 1})</span>
          <span class="value highlight">{pointsPerMechanic.toFixed(2)} pts/person</span>
        </div>
      </div>
    </div>

    <div class="action-section">
      <button 
        class="btn-approve"
        onclick={handleApprove}
        disabled={!completedAt}
      >
        ✅ Approve
      </button>
      <button 
        class="btn-reject"
        onclick={handleReject}
      >
        ❌ Reject
      </button>
    </div>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
  }

  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
    background: white;
    padding: 20px 30px;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  }

  .header h1 {
    margin: 0;
    color: #333;
    font-size: 28px;
  }

  .back-link {
    color: #667eea;
    text-decoration: none;
    font-weight: 600;
    transition: all 0.3s ease;
  }

  .back-link:hover {
    color: #764ba2;
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    background: white;
    border-radius: 12px;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #f0f0f0;
    border-top: 4px solid #667eea;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 15px;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .error {
    background: white;
    padding: 40px;
    border-radius: 12px;
    text-align: center;
    color: #f44336;
  }

  .main-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 20px;
  }

  @media (max-width: 900px) {
    .main-grid {
      grid-template-columns: 1fr;
    }
  }

  .card {
    background: white;
    border-radius: 12px;
    padding: 25px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 15px;
    border-bottom: 2px solid #f0f0f0;
  }

  .card-header h2 {
    margin: 0;
    color: #333;
    font-size: 18px;
  }

  .wo-badge {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 8px 16px;
    border-radius: 6px;
    font-weight: 600;
    font-size: 14px;
  }

  .detail-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .detail-row {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: 15px;
    padding: 10px;
    background: #f9f9f9;
    border-radius: 6px;
  }

  .label {
    font-weight: 600;
    color: #666;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .value {
    color: #333;
    font-weight: 500;
  }

  .team-section {
    margin-top: 15px;
    padding: 12px;
    background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
    border: 2px solid #90caf9;
    border-radius: 8px;
  }

  .team-label {
    font-weight: 600;
    color: #1565c0;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 10px;
  }

  .team-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .team-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: white;
    border-radius: 6px;
    border-left: 3px solid #2196f3;
  }

  .mechanic-name {
    font-weight: 600;
    color: #333;
    font-size: 13px;
  }

  .lead-badge {
    background: #ff9800;
    color: white;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 10px;
    margin-left: auto;
  }

  .no-team {
    color: #999;
    font-size: 13px;
    padding: 8px 10px;
    text-align: center;
  }

  .form-section {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .form-group label {
    font-weight: 600;
    color: #333;
    font-size: 14px;
  }

  .form-group input[type="datetime-local"],
  .form-group input[type="checkbox"] {
    padding: 10px;
    border: 2px solid #e0e0e0;
    border-radius: 6px;
    font-size: 14px;
    font-family: inherit;
  }

  .form-group input[type="datetime-local"]:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }

  .form-group input[type="checkbox"] {
    width: auto;
    margin-right: 8px;
    cursor: pointer;
  }

  .readonly-field {
    padding: 10px;
    background: #f5f5f5;
    border: 2px solid #e0e0e0;
    border-radius: 6px;
    color: #333;
    font-weight: 500;
  }

  .status-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .status-badge {
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    display: inline-block;
  }

  .status-badge.waiting {
    background: #fff3e0;
    color: #f57c00;
  }

  .warning-badge {
    background: #ffebee;
    color: #c62828;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    margin-top: 8px;
  }

  .info-text {
    color: #666;
    font-size: 12px;
  }

  .calculation-card {
    grid-column: 1 / -1;
  }

  .calculation-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .calc-row {
    display: grid;
    grid-template-columns: 1fr 150px;
    gap: 20px;
    padding: 12px;
    background: #f9f9f9;
    border-radius: 6px;
    font-weight: 500;
  }

  .calc-row.divider {
    background: linear-gradient(135deg, #f5f7ff 0%, #f0f4ff 100%);
    border-left: 4px solid #667eea;
    padding-left: 12px;
    margin-top: 10px;
    margin-bottom: 10px;
  }

  .calc-row .value {
    text-align: right;
    color: #333;
  }

  .calc-row .value.highlight {
    color: #667eea;
    font-size: 16px;
    font-weight: 700;
  }

  .action-section {
    display: flex;
    gap: 15px;
    justify-content: center;
    margin-top: 30px;
  }

  .btn-approve,
  .btn-reject {
    padding: 14px 40px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    font-size: 16px;
    transition: all 0.3s ease;
    min-width: 150px;
  }

  .btn-approve {
    background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%);
    color: white;
  }

  .btn-approve:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(76, 175, 80, 0.3);
  }

  .btn-approve:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  .btn-reject {
    background: linear-gradient(135deg, #f44336 0%, #c62828 100%);
    color: white;
  }

  .btn-reject:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(244, 67, 54, 0.3);
  }
</style>
