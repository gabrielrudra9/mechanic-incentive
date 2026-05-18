<script>
  import { onMount } from 'svelte';

  let workOrders = $state([]);
  let components = $state([]);
  let units = $state([]);
  let mechanics = $state([]);
  let notes = $state('');
  let selectedComponent = $state('');
  let isOthersJob = $state(false);
  let othersDescription = $state('');
  let teamMembers = $state([]);
  let newMemberName = $state('');
  let workCondition = $state('normal');
  let unitId = $state('');
  let loading = $state(false);
  let creating = $state(false);
  let loadingComponents = $state(false);
  let baseTargetHours = $state(0);
  let basePoints = $state(0);
  let loadJob = $state('');
  let jobType = $state('');
  let teamSize = $state(1);

  const BACKEND_URL = 'https://mechanic-incentive.up.railway.app';

  onMount(async () => {
    await loadComponents();
    await loadWorkOrders();
  });

  async function loadComponents() {
    loadingComponents = true;
    try {
      const response = await fetch(`${BACKEND_URL}/api/config/sync`);
      if (response.ok) {
        const data = await response.json();
        components = data.data.components || [];
        units = data.data.units || [];
        mechanics = data.data.mechanics || [];
      }
    } catch (error) {
      console.error('Failed to load components', error);
    } finally {
      loadingComponents = false;
    }
  }

  function handleComponentChange() {
    if (!selectedComponent) {
      baseTargetHours = 0;
      basePoints = 0;
      loadJob = '';
      jobType = '';
      teamSize = 1;
      return;
    }
    
    const comp = components.find(c => c.no === selectedComponent);
    if (comp) {
      baseTargetHours = comp.baseTargetHours;
      basePoints = comp.basePoints;
      loadJob = comp.loadJob;
      jobType = comp.jobAssignment;
      teamSize = comp.teamSize;
    }
  }

  async function loadWorkOrders() {
    loading = true;
    try {
      const response = await fetch(`${BACKEND_URL}/api/work-orders`);
      if (response.ok) {
        workOrders = await response.json();
      }
    } catch (error) {
      console.error('Failed to load work orders', error);
    } finally {
      loading = false;
    }
  }

  function addTeamMember() {
    if (newMemberName.trim()) {
      teamMembers = [
        ...teamMembers,
        {
          id: `member-${Date.now()}`,
          name: newMemberName,
          isLead: teamMembers.length === 0
        }
      ];
      newMemberName = '';
    }
  }

  function removeTeamMember(index) {
    teamMembers = teamMembers.filter((_, i) => i !== index);
  }

  function toggleLead(index) {
    teamMembers = teamMembers.map((member, i) => ({
      ...member,
      isLead: i === index ? !member.isLead : false
    }));
  }

  async function createWorkOrder() {
    if (!isOthersJob && !selectedComponent) {
      alert('Please select a component');
      return;
    }
    if (isOthersJob && !othersDescription.trim()) {
      alert('Please describe the "Others" job');
      return;
    }
    if (isOthersJob && basePoints === 0) {
      alert('Please enter base points for "Others" job');
      return;
    }

    creating = true;
    try {
      const response = await fetch(`${BACKEND_URL}/api/work-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          componentNo: isOthersJob ? null : selectedComponent,
          isOthersJob,
          othersDescription: isOthersJob ? othersDescription : null,
          teamMembers,
          workCondition,
          unitId: unitId || null,
          notes,
          basePoints,
          baseTargetHours,
          loadJob,
          jobType,
          teamSize
        })
      });

      if (response.ok) {
        const newWO = await response.json();
        alert(`Work Order ${newWO.wo_number} created!`);
        
        selectedComponent = '';
        isOthersJob = false;
        othersDescription = '';
        teamMembers = [];
        workCondition = 'normal';
        unitId = '';
        notes = '';
        baseTargetHours = 0;
        basePoints = 0;
        loadJob = '';
        jobType = '';
        teamSize = 1;
        
        await loadWorkOrders();
      } else {
        const errorData = await response.json();
        alert('Failed to create work order: ' + (errorData.error || 'Unknown error'));
      }
    } catch (error) {
      alert('Error: ' + error);
    } finally {
      creating = false;
    }
  }

  function getComponentDetails() {
    if (!selectedComponent) return null;
    return components.find(c => c.no === selectedComponent);
  }

  const details = $derived(getComponentDetails());
</script>

<div class="container">
  <div class="header">
    <div class="header-content">
      <h1>🔧 Mechanic Incentive System</h1>
      <p class="subtitle">Manage Work Orders & Incentives</p>
    </div>
    <div class="header-stats">
      <div class="stat">
        <div class="stat-value">{workOrders.length}</div>
        <div class="stat-label">Work Orders</div>
      </div>
      <div class="stat">
        <div class="stat-value">{components.length}</div>
        <div class="stat-label">Components</div>
      </div>
      <div class="stat">
        <div class="stat-value">{units.length}</div>
        <div class="stat-label">Units</div>
      </div>
      <div class="stat">
        <div class="stat-value">{mechanics.length}</div>
        <div class="stat-label">Mechanics</div>
      </div>
    </div>
  </div>

  <div class="main-grid">
    <!-- Create Work Order Card -->
    <div class="card form-card">
      <div class="card-header">
        <h2>✨ Create New Work Order</h2>
      </div>

      <!-- Job Type Selection -->
      <div class="form-group">
        <label>Job Type</label>
        <div class="job-type-selector">
          <button
            class="job-type-btn"
            class:active={!isOthersJob}
            onclick={() => (isOthersJob = false)}
          >
            <span class="icon">📋</span>
            <span>Standard Job</span>
          </button>
          <button
            class="job-type-btn"
            class:active={isOthersJob}
            onclick={() => (isOthersJob = true)}
          >
            <span class="icon">⚙️</span>
            <span>Others Job</span>
          </button>
        </div>
      </div>

      {#if !isOthersJob}
        <!-- Standard Job Form -->
        <div class="form-group">
          <label for="component">
            <span class="label-text">Component *</span>
            {#if loadingComponents}
              <span class="loading-text">Loading...</span>
            {/if}
          </label>
          <select id="component" bind:value={selectedComponent} onchange={handleComponentChange} disabled={loadingComponents}>
            <option value="">-- Select Component --</option>
            {#each components as comp (comp.no)}
              <option value={comp.no}>
                {comp.no}. {comp.componentName}
              </option>
            {/each}
          </select>
        </div>

        {#if details}
          <div class="component-details">
            <div class="detail-header">📌 Component Details (Read-Only)</div>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="detail-label">Type</span>
                <span class="detail-value">{details.technicalType}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Load Job</span>
                <span class="detail-value">{details.loadJob}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Target Hours</span>
                <span class="detail-value"><strong>{details.baseTargetHours}h</strong></span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Base Points</span>
                <span class="detail-value"><strong style="color: #4caf50;">{details.basePoints}pts</strong></span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Job Type</span>
                <span class="detail-value">{details.jobAssignment}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Team Size</span>
                <span class="detail-value">{details.teamSize} people</span>
              </div>
            </div>
          </div>
        {/if}

        {#if selectedComponent}
          <div class="editable-details">
            <div class="detail-header">✏️ Editable Component Details</div>
            
            <div class="detail-form-grid">
              <div class="detail-form-item">
                <label for="targetHours">Target Hours</label>
                <input 
                  id="targetHours"
                  type="number" 
                  bind:value={baseTargetHours} 
                  step="0.5"
                  min="0"
                />
              </div>

              <div class="detail-form-item">
                <label for="basePointsInput">Base Points</label>
                <input 
                  id="basePointsInput"
                  type="number" 
                  bind:value={basePoints} 
                  step="0.1"
                  min="0"
                />
              </div>

              <div class="detail-form-item">
                <label for="loadJobInput">Load Job</label>
                <input 
                  id="loadJobInput"
                  type="text" 
                  bind:value={loadJob}
                  placeholder="e.g., Minor Repair"
                />
              </div>

              <div class="detail-form-item">
                <label for="jobTypeInput">Job Type</label>
                <select id="jobTypeInput" bind:value={jobType}>
                  <option value="solo">Solo</option>
                  <option value="team">Team</option>
                  <option value="crew">Crew</option>
                </select>
              </div>

              <div class="detail-form-item">
                <label for="teamSizeInput">Team Size</label>
                <input 
                  id="teamSizeInput"
                  type="number" 
                  bind:value={teamSize} 
                  min="1"
                  max="10"
                />
              </div>
            </div>
          </div>
        {/if}
      {:else}
        <!-- Others Job Form -->
        <div class="form-group">
          <label for="othersDesc">Job Description *</label>
          <textarea
            id="othersDesc"
            bind:value={othersDescription}
            placeholder="Describe the work to be done... (e.g., Custom repair, maintenance task)"
            rows="4"
          ></textarea>
        </div>

        <!-- Others Job Points -->
        <div class="form-row">
          <div class="form-group">
            <label for="othersBasePoints">Base Points *</label>
            <input 
              id="othersBasePoints"
              type="number" 
              bind:value={basePoints} 
              step="0.1"
              min="0"
              placeholder="Enter point value"
            />
          </div>

          <div class="form-group">
            <label for="othersTargetHours">Target Hours</label>
            <input 
              id="othersTargetHours"
              type="number" 
              bind:value={baseTargetHours} 
              step="0.5"
              min="0"
              placeholder="Expected hours"
            />
          </div>
        </div>

        <!-- Others Job Team Size -->
        <div class="form-row">
          <div class="form-group">
            <label for="othersTeamSize">Team Size (for point division)</label>
            <input 
              id="othersTeamSize"
              type="number" 
              bind:value={teamSize} 
              min="1"
              max="20"
              placeholder="Number of mechanics"
            />
          </div>

          <div class="form-group">
            <label>Points per person</label>
            <div class="points-preview">
              {basePoints > 0 ? (basePoints / teamSize).toFixed(2) : 0} pts
            </div>
          </div>
        </div>
      {/if}

      <!-- Work Condition & Unit ID -->
      <div class="form-row">
        <div class="form-group">
          <label for="condition">Work Condition</label>
          <select id="condition" bind:value={workCondition}>
            <option value="normal">Normal</option>
            <option value="difficult">Difficult</option>
            <option value="extreme">Extreme</option>
          </select>
        </div>

        <!-- Unit ID Dropdown -->
        <div class="form-group">
          <label for="unit">Unit ID</label>
          <select id="unit" bind:value={unitId} disabled={loadingComponents}>
            <option value="">-- Select Unit --</option>
            {#each units as unit (unit.unitId)}
              <option value={unit.unitId}>
                {unit.unitId} - {unit.unitName}
              </option>
            {/each}
          </select>
        </div>
      </div>

      <!-- Team Members Dropdown -->
      <div class="form-group">
        <label>👥 Team Members</label>
        <div class="team-input">
          <select bind:value={newMemberName} disabled={loadingComponents}>
            <option value="">-- Select Mechanic --</option>
            {#each mechanics as mech (mech.mechanicId)}
              <option value={mech.mechanicName}>
                {mech.mechanicName} ({mech.department})
              </option>
            {/each}
          </select>
          <button 
            onclick={addTeamMember} 
            class="btn-add" 
            disabled={!newMemberName.trim()}
          >
            + Add
          </button>
        </div>
        {#if teamMembers.length > 0}
          <div class="team-list">
            {#each teamMembers as member, idx (member.id)}
              <div class="team-item">
                <div class="team-member-info">
                  <span class="member-name">{member.name}</span>
                  {#if member.isLead}
                    <span class="lead-badge">👑 Lead</span>
                  {/if}
                </div>
                <div class="team-actions">
                  <button 
                    onclick={() => toggleLead(idx)} 
                    class="btn-lead"
                    title={member.isLead ? 'Remove Lead' : 'Set as Lead'}
                  >
                    {member.isLead ? '👑' : '○'}
                  </button>
                  <button onclick={() => removeTeamMember(idx)} class="btn-remove" title="Remove">
                    ✕
                  </button>
                </div>
              </div>
            {/each}
          </div>
          <div class="team-count">{teamMembers.length} member(s) selected</div>
        {/if}
      </div>

      <!-- Notes -->
      <div class="form-group">
        <label for="notes">Additional Notes</label>
        <textarea
          id="notes"
          bind:value={notes}
          placeholder="Any additional details or observations..."
          rows="3"
        ></textarea>
      </div>

      <button 
        onclick={createWorkOrder} 
        disabled={creating || loadingComponents} 
        class="btn-create"
      >
        {creating ? '⏳ Creating...' : '✨ Create Work Order'}
      </button>
    </div>

    <!-- Work Orders List -->
    <div class="card list-card">
      <div class="card-header">
        <h2>📊 Work Orders</h2>
        <div class="wo-count">{workOrders.length}</div>
      </div>

      {#if loading}
        <div class="loading">
          <div class="spinner"></div>
          <p>Loading work orders...</p>
        </div>
      {:else if workOrders.length === 0}
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <p>No work orders yet</p>
          <p class="empty-hint">Create your first work order above</p>
        </div>
      {:else}
        <div class="wo-table">
          <div class="wo-header">
            <div class="col-wo">WO Number</div>
            <div class="col-notes">Notes</div>
            <div class="col-status">Status</div>
            <div class="col-date">Created</div>
          </div>
          {#each workOrders as wo (wo.id)}
            <div class="wo-row">
              <div class="col-wo">
                <span class="wo-badge">{wo.wo_number}</span>
              </div>
              <div class="col-notes">{wo.notes || '—'}</div>
              <div class="col-status">
                <span
                  class="status-badge"
                  class:created={wo.status === 'created'}
                  class:approved={wo.status === 'approved'}
                  class:rejected={wo.status === 'rejected'}
                >
                  {#if wo.status === 'created'}
                    ⏳ {wo.status}
                  {:else if wo.status === 'approved'}
                    ✅ {wo.status}
                  {:else if wo.status === 'rejected'}
                    ❌ {wo.status}
                  {/if}
                </span>
              </div>
              <div class="col-date">{new Date(wo.created_at).toLocaleDateString()}</div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <div class="footer">
    <p>Backend: {BACKEND_URL}</p>
    <p>Frontend: http://localhost:5183</p>
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
  }

  .container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  }

  .header {
    background: white;
    border-radius: 12px;
    padding: 30px;
    margin-bottom: 30px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .header-content h1 {
    margin: 0 0 8px 0;
    color: #333;
    font-size: 32px;
    font-weight: 700;
  }

  .subtitle {
    color: #666;
    margin: 0;
    font-size: 16px;
  }

  .header-stats {
    display: flex;
    gap: 30px;
  }

  .stat {
    text-align: center;
  }

  .stat-value {
    font-size: 32px;
    font-weight: 700;
    color: #667eea;
  }

  .stat-label {
    color: #999;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-top: 5px;
  }

  .main-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 30px;
    margin-bottom: 30px;
  }

  @media (max-width: 1200px) {
    .main-grid {
      grid-template-columns: 1fr;
    }
  }

  .card {
    background: white;
    border-radius: 12px;
    padding: 30px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 25px;
    padding-bottom: 15px;
    border-bottom: 2px solid #f0f0f0;
  }

  .card-header h2 {
    margin: 0;
    color: #333;
    font-size: 22px;
  }

  .wo-count {
    background: #f0f0f0;
    padding: 6px 12px;
    border-radius: 20px;
    font-weight: 600;
    color: #667eea;
    font-size: 14px;
  }

  .form-group {
    margin-bottom: 20px;
  }

  label {
    display: block;
    margin-bottom: 8px;
    font-weight: 600;
    color: #333;
    font-size: 14px;
  }

  .label-text {
    margin-right: 10px;
  }

  .loading-text {
    color: #999;
    font-size: 12px;
    font-weight: 400;
  }

  input,
  select,
  textarea {
    width: 100%;
    padding: 12px;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    font-family: inherit;
    font-size: 14px;
    box-sizing: border-box;
    transition: all 0.3s ease;
  }

  input:focus,
  select:focus,
  textarea:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }

  textarea {
    resize: vertical;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
  }

  .job-type-selector {
    display: flex;
    gap: 12px;
  }

  .job-type-btn {
    flex: 1;
    padding: 14px;
    border: 2px solid #e0e0e0;
    background: white;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.3s ease;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }

  .job-type-btn:hover {
    border-color: #667eea;
    background: #f8f9ff;
  }

  .job-type-btn.active {
    border-color: #667eea;
    background: #667eea;
    color: white;
  }

  .job-type-btn .icon {
    font-size: 20px;
  }

  .component-details {
    background: linear-gradient(135deg, #f5f7ff 0%, #f0f4ff 100%);
    border-left: 4px solid #667eea;
    padding: 16px;
    margin-bottom: 20px;
    border-radius: 8px;
  }

  .editable-details {
    background: linear-gradient(135deg, #fff9e6 0%, #ffe6e6 100%);
    border-left: 4px solid #ff9800;
    padding: 16px;
    margin-bottom: 20px;
    border-radius: 8px;
  }

  .editable-details .detail-header {
    font-weight: 600;
    color: #d84315;
    margin-bottom: 12px;
  }

  .detail-header {
    font-weight: 600;
    color: #333;
    margin-bottom: 12px;
  }

  .detail-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .detail-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .detail-label {
    font-size: 12px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .detail-value {
    font-size: 14px;
    color: #333;
    font-weight: 500;
  }

  .detail-form-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .detail-form-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .detail-form-item label {
    font-size: 13px;
    font-weight: 600;
    color: #333;
  }

  .detail-form-item input,
  .detail-form-item select {
    padding: 10px;
    border: 2px solid #ffb74d;
    border-radius: 6px;
    font-size: 13px;
    background: white;
  }

  .detail-form-item input:focus,
  .detail-form-item select:focus {
    outline: none;
    border-color: #ff9800;
    box-shadow: 0 0 0 3px rgba(255, 152, 0, 0.1);
  }

  .points-preview {
    padding: 12px;
    background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
    border: 2px solid #4caf50;
    border-radius: 8px;
    font-weight: 600;
    color: #2e7d32;
    text-align: center;
    font-size: 16px;
  }

  .team-input {
    display: flex;
    gap: 10px;
    margin-bottom: 12px;
  }

  .team-input select {
    flex: 1;
  }

  .btn-add {
    background: #2196f3;
    color: white;
    border: none;
    padding: 12px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.3s ease;
    white-space: nowrap;
  }

  .btn-add:hover:not(:disabled) {
    background: #1976d2;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(33, 150, 243, 0.3);
  }

  .btn-add:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  .team-list {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 10px;
  }

  .team-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
    padding: 10px 14px;
    border-radius: 20px;
    font-size: 14px;
    border: 1px solid #90caf9;
  }

  .team-member-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .member-name {
    font-weight: 500;
    color: #333;
  }

  .lead-badge {
    background: #ff9800;
    color: white;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 10px;
  }

  .team-actions {
    display: flex;
    gap: 4px;
  }

  .btn-lead,
  .btn-remove {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 16px;
    padding: 4px 8px;
    border-radius: 4px;
    transition: all 0.2s ease;
  }

  .btn-lead:hover {
    background: rgba(255, 152, 0, 0.1);
  }

  .btn-remove:hover {
    background: rgba(244, 67, 54, 0.1);
  }

  .team-count {
    font-size: 12px;
    color: #999;
    margin-top: 8px;
  }

  .btn-create {
    width: 100%;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 14px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 16px;
    font-weight: 600;
    transition: all 0.3s ease;
    margin-top: 10px;
  }

  .btn-create:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
  }

  .btn-create:disabled {
    background: #ccc;
    cursor: not-allowed;
    transform: none;
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
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

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    text-align: center;
  }

  .empty-icon {
    font-size: 48px;
    margin-bottom: 15px;
  }

  .empty-state p {
    margin: 8px 0;
    color: #666;
  }

  .empty-hint {
    font-size: 13px;
    color: #999;
  }

  .wo-table {
    display: flex;
    flex-direction: column;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    overflow: hidden;
  }

  .wo-header {
    display: grid;
    grid-template-columns: 150px 1fr 120px 120px;
    background: linear-gradient(135deg, #f5f7ff 0%, #f0f4ff 100%);
    border-bottom: 2px solid #e0e0e0;
    padding: 14px;
    font-weight: 600;
    gap: 10px;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #667eea;
  }

  .wo-row {
    display: grid;
    grid-template-columns: 150px 1fr 120px 120px;
    padding: 14px;
    border-bottom: 1px solid #f0f0f0;
    align-items: center;
    gap: 10px;
    transition: all 0.2s ease;
  }

  .wo-row:hover {
    background: #fafbff;
  }

  .col-wo {
    font-weight: 600;
  }

  .wo-badge {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 13px;
    display: inline-block;
  }

  .col-notes {
    color: #666;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .col-status {
    text-align: center;
  }

  .col-date {
    text-align: right;
    font-size: 13px;
    color: #999;
  }

  .status-badge {
    display: inline-block;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
  }

  .status-badge.created {
    background: #fff3e0;
    color: #f57c00;
  }

  .status-badge.approved {
    background: #e8f5e9;
    color: #2e7d32;
  }

  .status-badge.rejected {
    background: #ffebee;
    color: #c62828;
  }

  .footer {
    text-align: center;
    color: rgba(255, 255, 255, 0.8);
    font-size: 12px;
    margin-top: 30px;
    padding: 20px;
  }

  .footer p {
    margin: 4px 0;
  }
</style>
