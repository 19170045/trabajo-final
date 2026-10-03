// ===== Motor Temperature Dashboard - Client App =====

const socket = io();
let motorsData = [];
let alertsHistory = [];
const MAX_ALERTS = 20;
let startTime = Date.now();

// ===== CONNECTION HANDLING =====
socket.on('connect', () => {
  updateConnectionStatus(true);
  setTimeout(() => {
    document.getElementById('loadingOverlay').classList.add('hidden');
  }, 800);
});

socket.on('disconnect', () => {
  updateConnectionStatus(false);
});

function updateConnectionStatus(connected) {
  const el = document.getElementById('connectionStatus');
  if (connected) {
    el.classList.remove('disconnected');
    el.innerHTML = '<div class="status-dot"></div><span>Conectado</span>';
  } else {
    el.classList.add('disconnected');
    el.innerHTML = '<div class="status-dot"></div><span>Desconectado</span>';
  }
}

// ===== CLOCK =====
function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  // Update uptime
  const uptimeMs = Date.now() - startTime;
  const hours = Math.floor(uptimeMs / 3600000);
  const minutes = Math.floor((uptimeMs % 3600000) / 60000);
  const seconds = Math.floor((uptimeMs % 60000) / 1000);
  document.getElementById('infoUptime').textContent =
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
setInterval(updateClock, 1000);
updateClock();

// ===== DATA HANDLERS =====
socket.on('initialData', (data) => {
  motorsData = data;
  renderMotorCards();
  updateDashboard();
});

socket.on('temperatureUpdate', (data) => {
  motorsData = data;
  updateDashboard();
});

socket.on('alerts', (alerts) => {
  alerts.forEach(alert => {
    alertsHistory.unshift(alert);
  });
  if (alertsHistory.length > MAX_ALERTS) {
    alertsHistory = alertsHistory.slice(0, MAX_ALERTS);
  }
  renderAlerts();
});

// ===== RENDER MOTOR CARDS =====
function renderMotorCards() {
  const grid = document.getElementById('motorsGrid');
  grid.innerHTML = motorsData.map(motor => `
    <div class="motor-card status-${motor.status || 'normal'}" id="motor-card-${motor.id}">
      <div class="motor-header">
        <div>
          <div class="motor-name">${motor.name}</div>
          <div class="motor-meta">
            <span>📍 ${motor.location}</span>
            <span>⚡ ${motor.type}</span>
          </div>
        </div>
        <div>
          <span class="status-badge ${motor.status || 'normal'}" id="badge-${motor.id}">
            ${getStatusText(motor.status)}
          </span>
        </div>
      </div>

      <div class="gauge-container">
        ${createGaugeSVG(motor)}
      </div>

      <div style="display: flex; justify-content: center; margin-bottom: 8px;">
        <span class="trend-indicator trend-${motor.trend || 'stable'}" id="trend-${motor.id}">
          ${getTrendIcon(motor.trend)} ${getTrendText(motor.trend)}
        </span>
      </div>

      <div class="motor-metrics">
        <div class="metric">
          <div class="metric-label">RPM</div>
          <div class="metric-value" id="rpm-${motor.id}">${motor.rpm || 0}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Vibración</div>
          <div class="metric-value" id="vib-${motor.id}">${(motor.vibration || 0).toFixed(1)} mm/s</div>
        </div>
        <div class="metric">
          <div class="metric-label">Eficiencia</div>
          <div class="metric-value" id="eff-${motor.id}">${(motor.efficiency || 0).toFixed(1)}%</div>
        </div>
      </div>

      <div class="mini-chart-container">
        <div class="mini-chart-label">Historial</div>
        <svg class="mini-chart" id="chart-${motor.id}" viewBox="0 0 300 50" preserveAspectRatio="none">
        </svg>
      </div>
    </div>
  `).join('');

  // Initial chart render
  motorsData.forEach(motor => renderMiniChart(motor));
}

// ===== CREATE GAUGE SVG =====
function createGaugeSVG(motor) {
  const temp = motor.currentTemp || 0;
  const maxTemp = motor.maxTemp || 130;
  const percentage = Math.min(temp / maxTemp, 1);

  // Arc parameters
  const cx = 80, cy = 85;
  const radius = 65;
  const startAngle = -210 * (Math.PI / 180);
  const endAngle = 30 * (Math.PI / 180);
  const totalAngle = endAngle - startAngle;
  const currentAngle = startAngle + (totalAngle * percentage);

  // Background arc
  const bgX1 = cx + radius * Math.cos(startAngle);
  const bgY1 = cy + radius * Math.sin(startAngle);
  const bgX2 = cx + radius * Math.cos(endAngle);
  const bgY2 = cy + radius * Math.sin(endAngle);

  // Fill arc
  const fillX2 = cx + radius * Math.cos(currentAngle);
  const fillY2 = cy + radius * Math.sin(currentAngle);

  const largeArcBg = totalAngle > Math.PI ? 1 : 0;
  const largeArcFill = (currentAngle - startAngle) > Math.PI ? 1 : 0;

  const color = getGaugeColor(temp, motor.warningTemp, motor.criticalTemp);

  return `
    <svg class="gauge-svg" viewBox="0 0 160 110">
      <defs>
        <linearGradient id="gauge-grad-${motor.id}" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#3b82f6"/>
          <stop offset="50%" stop-color="#f59e0b"/>
          <stop offset="100%" stop-color="#ef4444"/>
        </linearGradient>
        <filter id="glow-${motor.id}">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <!-- Background arc -->
      <path d="M ${bgX1} ${bgY1} A ${radius} ${radius} 0 ${largeArcBg} 1 ${bgX2} ${bgY2}"
            class="gauge-bg"/>
      <!-- Fill arc -->
      <path d="M ${bgX1} ${bgY1} A ${radius} ${radius} 0 ${largeArcFill} 1 ${fillX2} ${fillY2}"
            class="gauge-fill" id="gauge-fill-${motor.id}"
            stroke="${color}" filter="url(#glow-${motor.id})"/>
      <!-- Temperature text -->
      <text x="${cx}" y="${cy - 5}" class="gauge-temp-text" id="gauge-temp-${motor.id}">
        ${temp.toFixed(1)}
      </text>
      <text x="${cx}" y="${cy + 10}" class="gauge-unit-text">°C</text>
      <!-- Min / Max labels -->
      <text x="${bgX1 + 5}" y="${bgY1 + 14}" class="gauge-min">0°</text>
      <text x="${bgX2 - 12}" y="${bgY2 + 14}" class="gauge-max">${maxTemp}°</text>
    </svg>
  `;
}

// ===== UPDATE DASHBOARD =====
function updateDashboard() {
  updateStats();
  updateMotorCards();
  updateRanking();
}

function updateStats() {
  const total = motorsData.length;
  const normal = motorsData.filter(m => m.status === 'normal').length;
  const warning = motorsData.filter(m => m.status === 'warning').length;
  const critical = motorsData.filter(m => m.status === 'critical').length;

  animateValue('statMotors', total);
  animateValue('statNormal', normal);
  animateValue('statWarning', warning);
  animateValue('statCritical', critical);
}

function animateValue(id, newValue) {
  const el = document.getElementById(id);
  if (el) el.textContent = newValue;
}

function updateMotorCards() {
  motorsData.forEach(motor => {
    // Update card status class
    const card = document.getElementById(`motor-card-${motor.id}`);
    if (card) {
      card.className = `motor-card status-${motor.status}`;
    }

    // Update badge
    const badge = document.getElementById(`badge-${motor.id}`);
    if (badge) {
      badge.className = `status-badge ${motor.status}`;
      badge.textContent = getStatusText(motor.status);
    }

    // Update gauge
    const gaugeContainer = card?.querySelector('.gauge-container');
    if (gaugeContainer) {
      gaugeContainer.innerHTML = createGaugeSVG(motor);
    }

    // Update trend
    const trend = document.getElementById(`trend-${motor.id}`);
    if (trend) {
      trend.className = `trend-indicator trend-${motor.trend}`;
      trend.innerHTML = `${getTrendIcon(motor.trend)} ${getTrendText(motor.trend)}`;
    }

    // Update metrics
    const rpm = document.getElementById(`rpm-${motor.id}`);
    if (rpm) rpm.textContent = motor.rpm;

    const vib = document.getElementById(`vib-${motor.id}`);
    if (vib) vib.textContent = `${motor.vibration.toFixed(1)} mm/s`;

    const eff = document.getElementById(`eff-${motor.id}`);
    if (eff) eff.textContent = `${motor.efficiency.toFixed(1)}%`;

    // Update mini chart
    renderMiniChart(motor);
  });
}

// ===== MINI CHART =====
function renderMiniChart(motor) {
  const svg = document.getElementById(`chart-${motor.id}`);
  if (!svg || !motor.history || motor.history.length < 2) return;

  const history = motor.history;
  const width = 300;
  const height = 50;
  const padding = 2;

  // Find min/max for scaling
  const temps = history.map(h => h.temp);
  const minTemp = Math.min(...temps) - 2;
  const maxTemp = Math.max(...temps) + 2;
  const range = maxTemp - minTemp || 1;

  // Create points
  const points = history.map((h, i) => {
    const x = padding + (i / (history.length - 1)) * (width - padding * 2);
    const y = height - padding - ((h.temp - minTemp) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const lineColor = getGaugeColor(motor.currentTemp, motor.warningTemp, motor.criticalTemp);

  // Create area path (for gradient fill below line)
  const areaPoints = [
    `${padding},${height}`,
    ...points,
    `${width - padding},${height}`
  ];

  svg.innerHTML = `
    <defs>
      <linearGradient id="area-grad-${motor.id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <polygon points="${areaPoints.join(' ')}" fill="url(#area-grad-${motor.id})" class="mini-chart-area"/>
    <polyline points="${points.join(' ')}" stroke="${lineColor}" class="mini-chart-line"/>
  `;
}

// ===== ALERTS =====
function renderAlerts() {
  const list = document.getElementById('alertsList');
  const count = document.getElementById('alertsCount');

  count.textContent = alertsHistory.length;

  if (alertsHistory.length === 0) {
    list.innerHTML = `
      <div class="no-alerts">
        <div class="no-alerts-icon">✅</div>
        Sin alertas activas
      </div>`;
    return;
  }

  list.innerHTML = alertsHistory.map(alert => {
    const time = new Date(alert.timestamp).toLocaleTimeString('es-MX', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    return `
      <div class="alert-item ${alert.type}">
        <div>${alert.message}</div>
        <div class="alert-time">${time}</div>
      </div>
    `;
  }).join('');
}

// ===== TEMPERATURE RANKING =====
function updateRanking() {
  const sorted = [...motorsData].sort((a, b) => b.currentTemp - a.currentTemp);
  const list = document.getElementById('rankingList');

  list.innerHTML = sorted.map((motor, index) => {
    const percentage = (motor.currentTemp / motor.maxTemp) * 100;
    const color = getGaugeColor(motor.currentTemp, motor.warningTemp, motor.criticalTemp);

    return `
      <div class="ranking-item">
        <span class="ranking-position">#${index + 1}</span>
        <div class="ranking-bar-container">
          <div class="ranking-motor-name">${motor.name}</div>
          <div class="ranking-bar">
            <div class="ranking-bar-fill" style="width: ${Math.min(percentage, 100)}%; background: ${color};"></div>
          </div>
        </div>
        <span class="ranking-temp" style="color: ${color}">${motor.currentTemp.toFixed(1)}°C</span>
      </div>
    `;
  }).join('');
}

// ===== UTILITY FUNCTIONS =====
function getGaugeColor(temp, warningTemp, criticalTemp) {
  if (temp >= criticalTemp) return '#ef4444';
  if (temp >= warningTemp) return '#f59e0b';
  if (temp >= warningTemp * 0.8) return '#06b6d4';
  return '#10b981';
}

function getStatusText(status) {
  switch (status) {
    case 'critical': return 'CRÍTICO';
    case 'warning': return 'ADVERTENCIA';
    default: return 'NORMAL';
  }
}

function getTrendIcon(trend) {
  switch (trend) {
    case 'rising': return '↑';
    case 'falling': return '↓';
    default: return '→';
  }
}

function getTrendText(trend) {
  switch (trend) {
    case 'rising': return 'Subiendo';
    case 'falling': return 'Bajando';
    default: return 'Estable';
  }
}

// ===== INITIALIZATION =====
console.log('🌡️ Motor Temperature Dashboard initialized');
