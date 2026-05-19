<script>
  import { onMount } from 'svelte';

  let pendingWOs = $state([]);
  let loading = $state(false);

  const BACKEND_URL = 'https://mechanic-incentive.up.railway.app';

  onMount(async () => {
    await loadPendingApprovals();
  });

  async function loadPendingApprovals() {
    loading = true;
    try {
      const response = await fetch(`${BACKEND_URL}/api/approvals/pending`);
      if (response.ok) {
        pendingWOs = await response.json();
      }
    } catch (error) {
      console.error('Failed to load approvals', error);
    } finally {
      loading = false;
    }
  }

  // ✅ Handle Delete (WITHOUT TypeScript types)
  async function handleDelete(woId, woNumber) {
    const confirmed = confirm(
      `⚠️ Are you sure you want to DELETE Work Order ${woNumber}?\n\nThis will also remove it from mechanic's task list.`
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/work-orders/${woId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        alert(`✅ Work Order ${woNumber} deleted successfully!`);
        // Reload list
        await loadPendingApprovals();
      } else {
        const errorData = await response.json();
        alert('Failed to delete: ' + (errorData.error || 'Unknown error'));
      }
    } catch (error) {
      alert('Error: ' + error);
    }
  }
</script>

<div class="container">
  <div class="header">
    <h1>📋 Pending Approvals</h1>
    <p class="subtitle">Review Work Orders</p>
  </div>

  <div class="card">
    {#if loading}
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading...</p>
      </div>
    {:else if pendingWOs.length === 0}
      <div class="empty">✓ No pending approvals</div>
    {:else}
      <p class="count">({pendingWOs.length}) pending</p>
      <div class="wo-table">
        <div class="wo-header">
          <div class="col-wo">WO Number</div>
          <div class="col-team">Team Members</div>
          <div class="col-notes">Notes</div>
          <div class="col-action">Actions</div>
        </div>
        {#each pendingWOs as wo (wo.id)}
          <div class="wo-row">
            <div class="col-wo">
              <span class="wo-badge">{wo.wo_number}</span>
            </div>
            <div class="col-team">
              {#if wo.team_members}
                <span class="team-badge">👥 {wo.team_members}</span>
              {:else}
                <span class="team-empty">—</span>
              {/if}
            </div>
            <div class="col-notes">{wo.notes || '—'}</div>
            <div class="col-action">
              <a href="/approvals/detail?id={wo.id}" class="btn-view">
                👁️ View
              </a>
              <button 
                class="btn-delete"
                onclick={() => handleDelete(wo.id, wo.wo_number)}
                title="Delete this work order"
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
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
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .header {
    background: white;
    border-radius: 12px;
    padding: 30px;
    margin-bottom: 30px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  }

  .header h1 {
    margin: 0 0 8px 0;
    color: #333;
    font-size: 28px;
  }

  .subtitle {
    color: #666;
    margin: 0;
    font-size: 16px;
  }

  .card {
    background: white;
    border-radius: 12px;
    padding: 25px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
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
    text-align: center;
    padding: 40px;
    color: #999;
  }

  .count {
    color: #666;
    margin-bottom: 15px;
    font-size: 14px;
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
    grid-template-columns: 150px 200px 1fr 140px;
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
    grid-template-columns: 150px 200px 1fr 140px;
    padding: 14px;
    border-bottom: 1px solid #f0f0f0;
    align-items: center;
    gap: 10px;
    transition: background 0.2s ease;
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

  .col-team {
    font-size: 13px;
  }

  .team-badge {
    background: #e3f2fd;
    color: #1976d2;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    display: inline-block;
  }

  .team-empty {
    color: #999;
  }

  .col-notes {
    color: #666;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .col-action {
    display: flex;
    gap: 6px;
    justify-content: center;
  }

  .btn-view,
  .btn-delete {
    padding: 8px 12px;
    border-radius: 6px;
    text-decoration: none;
    font-size: 11px;
    font-weight: 600;
    transition: all 0.3s ease;
    display: inline-block;
    border: none;
    cursor: pointer;
  }

  .btn-view {
    background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%);
    color: white;
  }

  .btn-view:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(33, 150, 243, 0.3);
  }

  .btn-delete {
    background: linear-gradient(135deg, #f44336 0%, #c62828 100%);
    color: white;
  }

  .btn-delete:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(244, 67, 54, 0.3);
  }
</style>
