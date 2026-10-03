const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Motor configuration
const motors = [
  { id: 1, name: 'Motor Principal A', type: 'Trifásico 480V', location: 'Línea de Producción 1', maxTemp: 120, warningTemp: 85, criticalTemp: 100 },
  { id: 2, name: 'Motor Bomba B', type: 'Monofásico 220V', location: 'Sistema Hidráulico', maxTemp: 110, warningTemp: 80, criticalTemp: 95 },
  { id: 3, name: 'Motor Compresor C', type: 'Trifásico 380V', location: 'Sala de Compresores', maxTemp: 130, warningTemp: 90, criticalTemp: 110 },
  { id: 4, name: 'Motor Ventilador D', type: 'Monofásico 110V', location: 'Sistema HVAC', maxTemp: 100, warningTemp: 70, criticalTemp: 85 },
];

// Simulated temperature state for each motor
const motorStates = motors.map(motor => ({
  ...motor,
  currentTemp: 45 + Math.random() * 20,
  trend: 'stable',
  history: [],
  vibration: 0.5 + Math.random() * 2,
  rpm: 1500 + Math.floor(Math.random() * 300),
  efficiency: 85 + Math.random() * 12,
  runtime: Math.floor(Math.random() * 720), // minutes
}));

// Temperature simulation
function simulateTemperature(state) {
  const variation = (Math.random() - 0.48) * 2.5;
  let newTemp = state.currentTemp + variation;

  // Add occasional spikes
  if (Math.random() < 0.02) {
    newTemp += Math.random() * 15;
  }

  // Add occasional cooling
  if (Math.random() < 0.03) {
    newTemp -= Math.random() * 8;
  }

  // Keep within realistic bounds
  newTemp = Math.max(30, Math.min(state.maxTemp + 5, newTemp));

  // Determine trend
  if (newTemp > state.currentTemp + 0.5) {
    state.trend = 'rising';
  } else if (newTemp < state.currentTemp - 0.5) {
    state.trend = 'falling';
  } else {
    state.trend = 'stable';
  }

  state.currentTemp = parseFloat(newTemp.toFixed(1));

  // Update other metrics
  state.vibration = parseFloat((0.5 + Math.random() * 3 + (newTemp > state.warningTemp ? Math.random() * 2 : 0)).toFixed(2));
  state.rpm = Math.floor(1500 + Math.random() * 300 - (newTemp > state.criticalTemp ? Math.random() * 200 : 0));
  state.efficiency = parseFloat((95 - (newTemp / state.maxTemp) * 15 + Math.random() * 5).toFixed(1));
  state.runtime += 1;

  // Store history (keep last 60 readings)
  const now = new Date();
  state.history.push({
    time: now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    timestamp: now.getTime(),
    temp: state.currentTemp,
    vibration: state.vibration,
  });

  if (state.history.length > 60) {
    state.history.shift();
  }

  // Determine status
  if (state.currentTemp >= state.criticalTemp) {
    state.status = 'critical';
  } else if (state.currentTemp >= state.warningTemp) {
    state.status = 'warning';
  } else {
    state.status = 'normal';
  }

  return state;
}

// Initialize history with some data
for (let i = 0; i < 30; i++) {
  motorStates.forEach(state => simulateTemperature(state));
}

// REST API
app.get('/api/motors', (req, res) => {
  res.json(motorStates);
});

app.get('/api/motors/:id', (req, res) => {
  const motor = motorStates.find(m => m.id === parseInt(req.params.id));
  if (!motor) return res.status(404).json({ error: 'Motor no encontrado' });
  res.json(motor);
});

// WebSocket connection
io.on('connection', (socket) => {
  console.log('📊 Cliente conectado al dashboard');
  socket.emit('initialData', motorStates);

  socket.on('disconnect', () => {
    console.log('📊 Cliente desconectado');
  });
});

// Update and broadcast every 2 seconds
setInterval(() => {
  motorStates.forEach(state => simulateTemperature(state));
  io.emit('temperatureUpdate', motorStates);
}, 2000);

// Generate alerts
setInterval(() => {
  const alerts = [];
  motorStates.forEach(state => {
    if (state.status === 'critical') {
      alerts.push({
        motorId: state.id,
        motorName: state.name,
        type: 'critical',
        message: `⚠️ CRÍTICO: ${state.name} a ${state.currentTemp}°C (Límite: ${state.criticalTemp}°C)`,
        timestamp: new Date().toISOString(),
      });
    } else if (state.status === 'warning') {
      alerts.push({
        motorId: state.id,
        motorName: state.name,
        type: 'warning',
        message: `🔶 ADVERTENCIA: ${state.name} a ${state.currentTemp}°C (Límite: ${state.warningTemp}°C)`,
        timestamp: new Date().toISOString(),
      });
    }
  });
  if (alerts.length > 0) {
    io.emit('alerts', alerts);
  }
}, 5000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🌡️  Motor Temperature Dashboard`);
  console.log(`   Servidor corriendo en http://localhost:${PORT}`);
  console.log(`   Monitoreando ${motors.length} motores\n`);
});
