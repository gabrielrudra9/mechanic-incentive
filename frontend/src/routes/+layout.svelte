<script>
  import { page } from '$app/stores';

  function isActive(path) {
    return $page.url.pathname === path || $page.url.pathname.startsWith(path + '/');
  }
</script>

<div class="layout">
  <nav class="navbar">
    <div class="nav-container">
      <div class="nav-logo">
        <span class="logo-icon">⚙️</span>
        <span class="logo-text">Mechanic Incentive</span>
      </div>

      <div class="nav-menu">
        <a href="/" class="nav-item" class:active={$page.url.pathname === '/'}>
          <span class="nav-icon">🏠</span>
          <span class="nav-label">Home</span>
        </a>

        <a href="/approvals" class="nav-item" class:active={isActive('/approvals')}>
          <span class="nav-icon">📋</span>
          <span class="nav-label">Approvals</span>
        </a>

        <a href="/mechanic" class="nav-item" class:active={isActive('/mechanic')}>
          <span class="nav-icon">🔧</span>
          <span class="nav-label">Mechanic</span>
        </a>

        <a href="/dashboard" class="nav-item" class:active={isActive('/dashboard')}>
          <span class="nav-icon">📊</span>
          <span class="nav-label">Dashboard</span>
        </a>
      </div>

      <div class="nav-info">
        <span class="server-status">✅ Online</span>
      </div>
    </div>
  </nav>

  <div class="content">
    <slot />
  </div>

  <footer class="footer">
    <p>© 2026 Mechanic Incentive Tracking System | Backend: https://mechanic-incentive.up.railway.app</p>
  </footer>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .layout {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  }

  .navbar {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .nav-container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 0 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 70px;
  }

  .nav-logo {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    text-decoration: none;
  }

  .logo-icon {
    font-size: 28px;
  }

  .logo-text {
    color: white;
    font-weight: 700;
    font-size: 18px;
    letter-spacing: 0.5px;
  }

  .nav-menu {
    display: flex;
    gap: 10px;
    flex: 1;
    margin-left: 50px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 8px;
    text-decoration: none;
    color: rgba(255, 255, 255, 0.8);
    font-weight: 600;
    font-size: 14px;
    transition: all 0.3s ease;
    cursor: pointer;
  }

  .nav-item:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .nav-item.active {
    background: rgba(255, 255, 255, 0.25);
    color: white;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .nav-icon {
    font-size: 20px;
  }

  .nav-label {
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 12px;
  }

  .nav-info {
    display: flex;
    align-items: center;
    gap: 15px;
  }

  .server-status {
    color: rgba(255, 255, 255, 0.9);
    font-size: 12px;
    font-weight: 600;
    padding: 6px 12px;
    background: rgba(76, 175, 80, 0.2);
    border-radius: 20px;
    border: 1px solid rgba(76, 175, 80, 0.4);
  }

  .content {
    flex: 1;
    padding: 0;
  }

  .footer {
    text-align: center;
    padding: 20px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 12px;
    margin-top: 30px;
  }

  @media (max-width: 768px) {
    .nav-container {
      flex-wrap: wrap;
      height: auto;
      padding: 15px 20px;
    }

    .nav-menu {
      margin-left: 0;
      width: 100%;
      margin-top: 15px;
      justify-content: flex-start;
      flex-wrap: wrap;
    }

    .logo-text {
      font-size: 16px;
    }

    .nav-label {
      display: none;
    }

    .nav-item {
      padding: 10px 12px;
    }
  }
</style>
