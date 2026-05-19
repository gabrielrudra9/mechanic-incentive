<script>
  import { onMount } from 'svelte';

  let summaryData = $state(null);
  let loading = $state(true);
  let selectedWeek = $state(getCurrentWeek());
  let selectedMonth = $state(new Date().getMonth() + 1);
  let selectedYear = $state(new Date().getFullYear());

  const BACKEND_URL = 'https://mechanic-incentive.up.railway.app';

  function getCurrentWeek() {
    const now = new Date();
    return Math.ceil((now.getDate() - now.getDay()) / 7);
  }

  onMount(async () => {
    await loadSummary();
  });

  async function loadSummary() {
    loading = true;
    try {
      const response = await fetch(
        `${BACKEND_URL}/api/mechanic-points/weekly-summary?week=${selectedWeek}&month=${selectedMonth}&year=${selectedYear}`
      );
      if (response.ok) {
        summaryData = await response.json();
      }
    } catch (error) {
      console.error('Failed to load summary', error);
    } finally {
      loading = false;
    }
  }

  function handleFilterChange() {
    loadSummary();
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(value);
  }

  function calculateTotalPoints() {
    if (!summaryData?.mechanics) return 0;
    return summaryData.mechanics.reduce((sum, m) => sum + m.total_points, 0);
  }

  function calculateTotalIDR() {
    if (!summaryData?.mechanics) return 0;
    return summaryData.mechanics.reduce((sum, m) => sum + m.idr_value, 0);
  }
</script>

<div class="container">
  <div class="header">
    <h1>📊 Dashboard Insentif Mekanik</h1>
    <p class="subtitle">Ringkasan Poin & Pembayaran Mingguan</p>
  </div>

  <div class="filters">
    <div class="filter-group">
      <label for="week">Minggu</label>
      <input
        id="week"
        type="number"
        bind:value={selectedWeek}
        min="1"
        max="52"
        onchange={handleFilterChange}
      />
    </div>
    <div class="filter-group">
      <label for="month">Bulan</label>
      <select id="month" bind:value={selectedMonth} onchange={handleFilterChange}>
        <option value="1">Januari</option>
        <option value="2">Februari</option>
        <option value="3">Maret</option>
        <option value="4">April</option>
        <option value="5">Mei</option>
        <option value="6">Juni</option>
        <option value="7">Juli</option>
        <option value="8">Agustus</option>
        <option value="9">September</option>
        <option value="10">Oktober</option>
        <option value="11">November</option>
        <option value="12">Desember</option>
      </select>
    </div>
    <div class="filter-group">
      <label for="year">Tahun</label>
      <input
        id="year"
        type="number"
        bind:value={selectedYear}
        min="2020"
        max="2099"
        onchange={handleFilterChange}
      />
    </div>
  </div>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading summary...</p>
    </div>
  {:else if !summaryData}
    <div class="error">
      <p>Failed to load summary</p>
    </div>
  {:else}
    <div class="summary-cards">
      <div class="card">
        <div class="card-label">Total Poin</div>
        <div class="card-value">{calculateTotalPoints().toFixed(2)}</div>
      </div>
      <div class="card">
        <div class="card-label">Total IDR</div>
        <div class="card-value highlight">{formatCurrency(calculateTotalIDR())}</div>
      </div>
      <div class="card">
        <div class="card-label">Mekanik Aktif</div>
        <div class="card-value">{summaryData.mechanics.length}</div>
      </div>
    </div>

    <div class="card table-card">
      <div class="card-header">
        <h2>Ranking Mekanik - Minggu {selectedWeek}/{selectedMonth}/{selectedYear}</h2>
      </div>

      {#if summaryData.mechanics.length === 0}
        <div class="empty">Tidak ada data untuk periode ini</div>
      {:else}
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Nama Mekanik</th>
                <th>WO Selesai</th>
                <th>Total Poin</th>
                <th>Nilai IDR</th>
              </tr>
            </thead>
            <tbody>
              {#each summaryData.mechanics as mechanic, idx}
                <tr>
                  <td class="rank">{idx + 1}</td>
                  <td class="name">{mechanic.mechanic_name}</td>
                  <td class="center">{mechanic.work_orders_count}</td>
                  <td class="points">{mechanic.total_points.toFixed(2)}</td>
                  <td class="currency">{formatCurrency(mechanic.idr_value)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
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
    background: white;
    border-radius: 12px;
    padding: 30px;
    margin-bottom: 30px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  }

  .header h1 {
    margin: 0 0 8px 0;
    color: #333;
    font-size: 32px;
  }

  .subtitle {
    color: #666;
    margin: 0;
    font-size: 16px;
  }

  .filters {
    display: flex;
    gap: 15px;
    margin-bottom: 30px;
    background: white;
    padding: 20px;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .filter-group label {
    font-weight: 600;
    color: #333;
    font-size: 14px;
  }

  .filter-group input,
  .filter-group select {
    padding: 10px;
    border: 2px solid #e0e0e0;
    border-radius: 6px;
    font-size: 14px;
    font-family: inherit;
    min-width: 100px;
  }

  .filter-group input:focus,
  .filter-group select:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
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

  .summary-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
  }

  .card {
    background: white;
    border-radius: 12px;
    padding: 25px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  }

  .card-label {
    color: #666;
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 10px;
  }

  .card-value {
    font-size: 32px;
    font-weight: 700;
    color: #667eea;
  }

  .card-value.highlight {
    color: #4caf50;
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

  .table-card {
    grid-column: 1 / -1;
  }

  .table-container {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  thead {
    background: #f5f7ff;
  }

  th {
    padding: 14px;
    text-align: left;
    font-weight: 600;
    color: #667eea;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 2px solid #e0e0e0;
  }

  td {
    padding: 14px;
    border-bottom: 1px solid #f0f0f0;
    color: #333;
  }

  tbody tr:hover {
    background: #fafbff;
  }

  .rank {
    font-weight: 700;
    color: #667eea;
    font-size: 18px;
    text-align: center;
  }

  .name {
    font-weight: 600;
  }

  .center {
    text-align: center;
  }

  .points {
    font-weight: 600;
    color: #667eea;
  }

  .currency {
    font-weight: 600;
    color: #4caf50;
  }

  .empty {
    text-align: center;
    padding: 40px;
    color: #999;
  }
</style>
