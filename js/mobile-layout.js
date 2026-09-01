// Responsive exclusivo para celulares/tablets. No modifica la vista de escritorio.
const mobileStyleId = 'sat-mobile-layout-v1';

if (!document.getElementById(mobileStyleId)) {
  const style = document.createElement('style');
  style.id = mobileStyleId;
  style.textContent = `
    @media (max-width: 900px) {
      html, body {
        width: 100%;
        max-width: 100%;
        overflow-x: hidden !important;
      }

      .screen,
      .app-layout,
      .main-area,
      .content,
      .dash-grid,
      .dash-left,
      .dash-right,
      .card,
      .kpi-card {
        min-width: 0 !important;
        max-width: 100% !important;
      }

      /* Cabecera compacta */
      .topbar {
        height: 56px !important;
        min-height: 56px !important;
        padding: 0 10px !important;
        gap: 8px !important;
      }

      .topbar-left {
        min-width: 0;
        flex: 1 1 auto;
        gap: 8px !important;
      }

      .topbar-logo {
        gap: 7px !important;
        min-width: 0;
      }

      .topbar-logo-icon {
        width: 32px !important;
        height: 32px !important;
        flex: 0 0 32px !important;
      }

      .topbar-logo-text {
        font-size: 12px !important;
        line-height: 1.15 !important;
        white-space: nowrap;
      }

      .topbar-logo-sub,
      .topbar-time,
      .topbar-user-role,
      .topbar-current-user > div:last-child {
        display: none !important;
      }

      .topbar-right {
        gap: 7px !important;
        flex: 0 0 auto;
      }

      .theme-toggle-btn {
        width: 30px !important;
        height: 30px !important;
        flex: 0 0 30px;
      }

      .topbar-avatar {
        width: 28px !important;
        height: 28px !important;
        font-size: 11px !important;
      }

      .topbar-user-logout {
        gap: 6px !important;
      }

      .logout-top-btn {
        padding: 6px 8px !important;
        font-size: 10px !important;
        border-radius: 6px !important;
      }

      /* El menú lateral pasa a ser una barra horizontal desplazable */
      .main-area {
        flex-direction: column !important;
        overflow: visible !important;
      }

      .sidebar {
        display: flex !important;
        width: 100% !important;
        height: 48px !important;
        min-height: 48px !important;
        flex: 0 0 48px !important;
        flex-direction: row !important;
        align-items: stretch !important;
        padding: 0 !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        scrollbar-width: none;
        position: sticky;
        top: 56px;
        z-index: 95;
        border-bottom: 1px solid rgba(255,255,255,.08);
      }

      .sidebar::-webkit-scrollbar { display: none; }
      .sidebar .nav-section-title { display: none !important; }

      .sidebar .nav-item {
        flex: 0 0 auto !important;
        min-height: 48px !important;
        padding: 0 13px !important;
        border-left: 0 !important;
        border-bottom: 3px solid transparent !important;
        white-space: nowrap;
        gap: 7px !important;
        font-size: 11px !important;
      }

      .sidebar .nav-item.active {
        border-left-color: transparent !important;
        border-bottom-color: var(--celeste-lt) !important;
      }

      .sidebar .nav-item svg {
        width: 15px !important;
        height: 15px !important;
      }

      .nav-badge {
        margin-left: 2px !important;
        padding: 1px 5px !important;
        font-size: 9px !important;
      }

      .content {
        width: 100% !important;
        padding: 14px !important;
        overflow-x: hidden !important;
      }

      /* Cabeceras de página */
      .page-header {
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 12px !important;
        margin-bottom: 16px !important;
      }

      .page-title {
        font-size: 22px !important;
        line-height: 1.15 !important;
      }

      .page-sub {
        font-size: 12px !important;
        line-height: 1.4 !important;
      }

      #s-dash .page-header > div:last-child {
        width: 100% !important;
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 8px !important;
      }

      #s-dash .page-header > div:last-child .btn {
        width: 100% !important;
        min-width: 0 !important;
        white-space: normal !important;
        line-height: 1.2 !important;
      }

      /* Banner de alerta */
      .alert-banner {
        padding: 12px !important;
        gap: 10px !important;
        align-items: flex-start !important;
        flex-wrap: wrap !important;
      }

      .alert-banner-icon {
        width: 34px !important;
        height: 34px !important;
      }

      .alert-banner-text {
        min-width: 0;
        flex: 1 1 calc(100% - 50px) !important;
      }

      .alert-banner-title {
        font-size: 12px !important;
        line-height: 1.35 !important;
      }

      .alert-banner-desc {
        font-size: 11px !important;
        line-height: 1.4 !important;
      }

      .alert-banner > .btn {
        margin-left: 44px;
      }

      /* KPIs del panel: dos por fila, legibles */
      #s-dash .kpi-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 10px !important;
        margin-bottom: 14px !important;
      }

      #s-dash .kpi-card {
        min-height: 148px !important;
        padding: 14px 13px 12px !important;
        grid-template-columns: minmax(0,1fr) auto !important;
        column-gap: 8px !important;
      }

      #s-dash .kpi-card:last-child {
        grid-column: 1 / -1;
      }

      #s-dash .kpi-card .kpi-label {
        font-size: 12px !important;
        line-height: 1.25 !important;
        overflow-wrap: anywhere;
      }

      #s-dash .kpi-card .kpi-icon-wrap {
        width: 34px !important;
        height: 34px !important;
      }

      #s-dash .kpi-card .kpi-value {
        font-size: 28px !important;
        margin: 12px 0 9px !important;
        white-space: nowrap;
      }

      #s-dash .kpi-card:nth-child(2) .kpi-value {
        font-size: 23px !important;
        white-space: normal !important;
        overflow-wrap: anywhere;
      }

      #s-dash .kpi-card .kpi-delta {
        font-size: 10.5px !important;
        line-height: 1.35 !important;
        overflow-wrap: anywhere;
      }

      /* Contenido principal siempre apilado */
      .dash-grid {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) !important;
        gap: 14px !important;
      }

      .dash-left,
      .dash-right {
        width: 100% !important;
      }

      .card {
        width: 100% !important;
        padding: 14px !important;
      }

      .card-header {
        gap: 8px !important;
        align-items: flex-start !important;
      }

      .card-title {
        min-width: 0;
        line-height: 1.35 !important;
        overflow-wrap: anywhere;
      }

      .chart-area {
        width: 100% !important;
        height: 210px !important;
        overflow: hidden !important;
      }

      .chart-svg,
      .river-chart-wrap svg {
        width: 100% !important;
        max-width: 100% !important;
      }

      #s-dash #real-map.real-map {
        width: 100% !important;
        max-width: none !important;
      }

      .map-note {
        line-height: 1.4 !important;
      }

      .sensor-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 8px !important;
      }

      .sensor-item {
        min-width: 0 !important;
      }

      .sensor-name,
      .sensor-status-text {
        overflow-wrap: anywhere;
      }

      /* Validación y formularios */
      .validar-grid,
      .admin-user-grid,
      .incident-details-grid {
        grid-template-columns: 1fr !important;
      }

      .val-action-row {
        display: grid !important;
        grid-template-columns: 1fr !important;
        gap: 8px !important;
      }

      .emit-steps {
        overflow-x: auto !important;
        padding-bottom: 4px;
        scrollbar-width: none;
      }
      .emit-steps::-webkit-scrollbar { display: none; }

      .emit-step {
        flex: 0 0 auto;
      }

      .input-group input,
      .input-group select,
      .input-group textarea,
      .btn {
        max-width: 100% !important;
      }

      /* Historial, contactos, usuarios y sensores */
      .filter-bar {
        display: grid !important;
        grid-template-columns: 1fr !important;
        gap: 9px !important;
        align-items: stretch !important;
      }

      .filter-bar > * {
        width: 100% !important;
        min-width: 0 !important;
      }

      .table-wrap {
        width: 100% !important;
        max-width: 100% !important;
        overflow-x: auto !important;
        -webkit-overflow-scrolling: touch;
      }

      table {
        min-width: 680px;
      }

      .table-actions {
        flex-wrap: wrap !important;
      }

      #sensor-precision-panel > div:first-child,
      #alert-audit-panel > div:first-child {
        align-items: flex-start !important;
      }

      /* Modales */
      .modal-overlay {
        padding: 10px !important;
      }

      .modal-box {
        width: calc(100vw - 20px) !important;
        max-width: 520px !important;
        max-height: 90vh !important;
        overflow-y: auto !important;
        padding: 20px !important;
      }

      .modal-actions {
        flex-wrap: wrap !important;
      }

      .modal-actions .btn {
        flex: 1 1 140px;
      }

      /* Reporte vecinal */
      .mobile-frame-wrap {
        padding: 12px !important;
      }

      .mobile-frame {
        width: 100% !important;
        max-width: 430px !important;
        min-height: 0 !important;
        border-radius: 20px !important;
      }
    }

    @media (max-width: 600px) {
      .topbar-status {
        display: none !important;
      }

      .topbar-logo-text {
        font-size: 11px !important;
      }

      #s-dash .kpi-grid {
        grid-template-columns: repeat(2, minmax(0,1fr)) !important;
      }

      #s-dash .kpi-card {
        min-height: 142px !important;
      }

      #s-dash .page-header > div:last-child {
        grid-template-columns: 1fr !important;
      }

      .alert-banner > .btn {
        width: 100% !important;
        margin-left: 0 !important;
      }

      .sensor-grid {
        grid-template-columns: 1fr !important;
      }
    }

    @media (max-width: 380px) {
      #s-dash .kpi-grid {
        grid-template-columns: 1fr !important;
      }

      #s-dash .kpi-card:last-child {
        grid-column: auto;
      }

      .topbar-logo-text {
        max-width: 105px;
        white-space: normal;
      }
    }
  `;
  document.head.appendChild(style);
}
