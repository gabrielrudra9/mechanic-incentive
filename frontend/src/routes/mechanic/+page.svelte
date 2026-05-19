<script>
  import { onMount } from 'svelte';

  let mechanicWOs = $state([]);
  let loading = $state(false);
  let selectedWO = $state(null);
  let mechanicName = $state('');
  let showStartForm = $state(false);
  let showFinishForm = $state(false);
  let finishNotes = $state('');

  const BACKEND_URL = 'https://mechanic-incentive.up.railway.app';

  // ✅ Format waktu server - handle both database format dan ISO format dengan timezone benar
  function formatDateTime(isoString) {
    if (!isoString) return '-';
    
    // Database return: "2026-05-16 20:13:08" (dengan space) - sudah dalam Asia/Bangkok
    // Jadi parse langsung tanpa JavaScript Date conversion
    
    let datePart, timePart;
    
    if (isoString.includes('T')) {
      // ISO format dari JavaScript: "2026-05-16T20:13:08.123Z" (UTC)
      // Perlu ditambah 7 jam untuk Asia/Bangkok
      const utcDate = new Date(isoString);
      const bangkokTime = new Date(utcDate.getTime() + (7 * 60 * 60 * 1000));
      
      const day = String(bangkokTime.getUTCDate()).padStart(2, '0');
      const month = String(bangkokTime.getUTCMonth() + 1).padStart(2, '0');
      const year = bangkokTime.getUTCFullYear();
      const hours = String(bangkokTime.getUTCHours()).padStart(2, '0');
      const mins = String(bangkokTime.getUTCMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${mins}`;
    } else {
      // Database format: "2026-05-16 20:13:08" (sudah Asia/Bangkok, parse langsung)
      const parts = isoString.split(' ');
      const datePart = parts[0];
      const timePart = parts[1];
      
      const [year, month, day] = datePart.split('-');
      const [hours, mins] = timePart.split(':');
      return `${day}/${month}/${year} ${hours}:${mins}`;
    }
  }

// ✅ Get current server time in Asia/Bangkok timezone
  function getCurrentServerTime() {
    const now = new Date();
    // Add 7 hours for Asia/Bangkok (UTC+7)
    const bangkokTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    
    const day = String(bangkokTime.getUTCDate()).padStart(2, '0');
    const month = String(bangkokTime.getUTCMonth() + 1).padStart(2, '0');
    const year = bangkokTime.getUTCFullYear();
    const hours = String(bangkokTime.getUTCHours()).padStart(2, '0');
    const mins = String(bangkokTime.getUTCMinutes()).padStart(2, '0');
    
    return `${day}/${month}/${year} ${hours}:${mins}`;
  }

  onMount(async () => {
    mechanicName = prompt('Masukkan nama mekanik:') || 'Unknown';
    await loadWOs();
  });

  async function loadWOs() {
  loading = true;
  try {
    const response = await fetch(`${BACKEND_URL}/api/work-orders/mechanic/${encodeURIComponent(mechanicName)}`);
    if (response.ok) {
      mechanicWOs = await response.json();
    } else {
      mechanicWOs = [];
    }
  } catch (error) {
    console.error('Failed to load WOs', error);
    mechanicWOs = [];
  } finally {
    loading = false;
  }
}

  async function startWO() {
    if (!selectedWO) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/work-orders/${selectedWO.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // ✅ DON'T send started_at - let server set it!
          // started_at akan di-set oleh backend dengan NOW() (server time)
        })
      });

      if (response.ok) {
        alert('✅ WO dimulai!');
        showStartForm = false;
        await loadWOs();
      }
    } catch (error) {
      alert('Error: ' + error);
    }
  }

  async function finishWO() {
    if (!selectedWO) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/work-orders/${selectedWO.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: finishNotes
        })
      });

      if (response.ok) {
        const updatedWO = await response.json();
        
        // ✅ LOG MTBF INFO
        console.log('[FINISH] Updated WO:', updatedWO);
        console.log('[MTBF] Status:', updatedWO.status);
        console.log('[MTBF] Redo Status:', updatedWO.mtbf_redo_status);
        console.log('[MTBF] Expiry:', updatedWO.mtbf_expiry_date);
        
        // ✅ SHOW STATUS BERUBAH KE WAIT_MTBF
        const redoLabel = updatedWO.mtbf_redo_status === 'detected' ? '🔴 REDO DETECTED' : '✅ NO REDO';
        const expiryTime = updatedWO.mtbf_expiry_date ? formatDateTime(updatedWO.mtbf_expiry_date) : '-';
        
        alert(`✅ WO SELESAI!\n\n⏳ Status: ${updatedWO.status}\n${redoLabel}\n⏰ MTBF hingga: ${expiryTime}\n\n💬 Menunggu persetujuan supervisor...`);
        
        showFinishForm = false;
        finishNotes = '';
        await loadWOs();
      }
    } catch (error) {
      alert('Error: ' + error);
    }
  }
</script>

<div class="container">
  <div class="header">
    <h1>🔧 Mechanic App</h1>
    <div class="mechanic-info">
      👤 {mechanicName}
    </div>
  </div>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading work orders...</p>
    </div>
  {:else if mechanicWOs.length === 0}
    <div class="empty">
      <p>Tidak ada work order untuk Anda</p>
    </div>
  {:else}
    <div class="wo-list">
      {#each mechanicWOs as wo (wo.id)}
        <div class="wo-card">
          <div class="wo-header">
            <div class="wo-number">{wo.wo_number}</div>
            <div class="wo-status" class:started={wo.started_at} class:wait-mtbf={wo.status === 'wait_mtbf'}>
              {#if wo.status === 'wait_mtbf'}
                ⏳ WAIT MTBF
              {:else if wo.started_at}
                ⏱️ IN PROGRESS
              {:else}
                ⏳ PENDING
              {/if}
            </div>
          </div>

          <div class="wo-details">
            <div class="detail-row">
              <span class="label">Component</span>
              <span class="value component-desc">
                {wo.componentDescription || wo.component_id || wo.others_description || 'Others Job'}
              </span>
            </div>
            <div class="detail-row">
              <span class="label">Unit</span>
              <span class="value">{wo.unit_id || '-'}</span>
            </div>
            <div class="detail-row">
              <span class="label">Condition</span>
              <span class="value">{wo.work_condition}</span>
            </div>
            <div class="detail-row">
              <span class="label">Target Hours</span>
              <span class="value">{wo.target_hours}h</span>
            </div>
            {#if wo.started_at}
              <div class="detail-row">
                <span class="label">Started At</span>
                <span class="value">{formatDateTime(wo.started_at)}</span>
              </div>
            {/if}
            {#if wo.completed_at}
              <div class="detail-row">
                <span class="label">Completed At</span>
                <span class="value">{formatDateTime(wo.completed_at)}</span>
              </div>
            {/if}
            {#if wo.mtbf_redo_status}
              <div class="detail-row">
                <span class="label">MTBF Status</span>
                <span class="value mtbf-status" class:detected={wo.mtbf_redo_status === 'detected'}>
                  {wo.mtbf_redo_status === 'detected' ? '🔴 REDO DETECTED' : '✅ NO REDO'}
                </span>
              </div>
            {/if}
            {#if wo.mtbf_expiry_date}
              <div class="detail-row">
                <span class="label">MTBF Until</span>
                <span class="value">{formatDateTime(wo.mtbf_expiry_date)}</span>
              </div>
            {/if}
          </div>

          <div class="wo-actions">
            {#if !wo.started_at}
              <button
                class="btn-start"
                onclick={() => {
                  selectedWO = wo;
                  showStartForm = true;
                }}
              >
                ▶️ START
              </button>
            {:else if wo.status === 'wait_mtbf'}
              <button class="btn-wait-mtbf" disabled>⏳ WAIT MTBF</button>
            {:else if !wo.completed_at}
              <button
                class="btn-finish"
                onclick={() => {
                  selectedWO = wo;
                  showFinishForm = true;
                }}
              >
                ⏹️ FINISH
              </button>
            {:else}
              <button class="btn-done" disabled>✅ COMPLETED</button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if showStartForm && selectedWO}
    <div class="modal-overlay" onclick={() => (showStartForm = false)}>
      <div class="modal" onclick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>Start Work Order</h2>
          <button class="btn-close" onclick={() => (showStartForm = false)}>✕</button>
        </div>
        <div class="modal-body">
          <p>Start WO: <strong>{selectedWO.wo_number}</strong>?</p>
          <p class="time">🕐 Server Time: {getCurrentServerTime()}</p>
        </div>
        <div class="modal-actions">
          <button class="btn-cancel" onclick={() => (showStartForm = false)}>Cancel</button>
          <button class="btn-confirm" onclick={startWO}>Yes, Start</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showFinishForm && selectedWO}
    <div class="modal-overlay" onclick={() => (showFinishForm = false)}>
      <div class="modal" onclick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>Finish Work Order</h2>
          <button class="btn-close" onclick={() => (showFinishForm = false)}>✕</button>
        </div>
        <div class="modal-body">
          <p>Finish WO: <strong>{selectedWO.wo_number}</strong></p>
          <textarea
            bind:value={finishNotes}
            placeholder="Add notes (optional)..."
            rows="4"
          ></textarea>
          <p class="time">🕐 Server Time: {getCurrentServerTime()}</p>
        </div>
        <div class="modal-actions">
          <button class="btn-cancel" onclick={() => (showFinishForm = false)}>Cancel</button>
          <button class="btn-confirm" onclick={finishWO}>Yes, Finish</button>
        </div>
      </div>
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
    max-width: 600px;
    margin: 0 auto;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .header {
    background: white;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 20px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  }

  .header h1 {
    margin: 0 0 10px 0;
    color: #333;
    font-size: 24px;
  }

  .mechanic-info {
    color: #667eea;
    font-weight: 600;
    font-size: 14px;
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

  .empty {
    background: white;
    padding: 40px;
    border-radius: 12px;
    text-align: center;
    color: #999;
  }

  .wo-list {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .wo-card {
    background: white;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  }

  .wo-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    padding-bottom: 10px;
    border-bottom: 2px solid #f0f0f0;
  }

  .wo-number {
    font-weight: 700;
    color: #667eea;
    font-size: 16px;
  }

  .wo-status {
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    background: #fff3e0;
    color: #f57c00;
  }

  .wo-status.started {
    background: #e3f2fd;
    color: #1976d2;
  }

  .wo-status.wait-mtbf {
    background: #fff9c4;
    color: #f57f17;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  .wo-details {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 15px;
  }

  .detail-row {
    display: grid;
    grid-template-columns: 80px 1fr;
    gap: 10px;
    font-size: 13px;
  }

  .label {
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .value {
    color: #333;
  }

  .value.component-desc {
    color: #1976d2;
    font-weight: 600;
  }

  .value.mtbf-status {
    font-weight: 600;
  }

  .value.mtbf-status.detected {
    color: #d32f2f;
  }

  .wo-actions {
    display: flex;
    gap: 10px;
  }

  .btn-start,
  .btn-finish,
  .btn-wait-mtbf,
  .btn-done {
    flex: 1;
    padding: 12px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    font-size: 14px;
    transition: all 0.3s ease;
  }

  .btn-start {
    background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%);
    color: white;
  }

  .btn-start:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(33, 150, 243, 0.3);
  }

  .btn-finish {
    background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
    color: white;
  }

  .btn-finish:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(255, 152, 0, 0.3);
  }

  .btn-wait-mtbf {
    background: #fff9c4;
    color: #f57f17;
    cursor: not-allowed;
    animation: pulse 2s infinite;
  }

  .btn-done {
    background: #ccc;
    color: #666;
    cursor: not-allowed;
  }

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: white;
    border-radius: 12px;
    padding: 30px;
    max-width: 400px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 15px;
    border-bottom: 2px solid #f0f0f0;
  }

  .modal-header h2 {
    margin: 0;
    color: #333;
    font-size: 18px;
  }

  .btn-close {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #999;
  }

  .modal-body {
    margin-bottom: 20px;
  }

  .modal-body p {
    margin: 10px 0;
    color: #333;
  }

  .time {
    font-size: 12px;
    color: #999;
    margin-top: 15px;
  }

  textarea {
    width: 100%;
    padding: 10px;
    border: 2px solid #e0e0e0;
    border-radius: 6px;
    font-family: inherit;
    font-size: 14px;
    resize: vertical;
  }

  textarea:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }

  .modal-actions {
    display: flex;
    gap: 10px;
  }

  .btn-cancel,
  .btn-confirm {
    flex: 1;
    padding: 12px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    font-size: 14px;
    transition: all 0.3s ease;
  }

  .btn-cancel {
    background: #ddd;
    color: #333;
  }

  .btn-cancel:hover {
    background: #ccc;
  }

  .btn-confirm {
    background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%);
    color: white;
  }

  .btn-confirm:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
  }
</style>
