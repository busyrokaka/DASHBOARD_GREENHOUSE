// ================= MQTT CONFIG =================
const MQTT_CONFIG = {
    url: 'wss://062eb6c7e7a340739ba840bf0bd6f8a2.s1.eu.hivemq.cloud:8884/mqtt',
    username: 'Dashboard_Greenhouse1314',
    password: 'GreenHouse7',
    clientId: 'web_dash_' + Math.random().toString(16).substr(2, 8)
};

const TOPICS = {
    sensor: 'greenhouse/sensor/data',
    command: 'greenhouse/command',
    setpoint: 'greenhouse/setpoint',
    connection: 'greenhouse/connection'
};

// ================= VARIABLES =================
let client = null;
let tempChart, soilChart;
let isAuto = true;
let reconnectAttempts = 0;
let messageQueue = [];
let espConnected = false;
let lastEspResponse = 0;

const setpoints = { tempMin: 20, tempMax: 30, soilMin: 50, soilMax: 80 };

// ================= CHARTS =================
function initCharts() {
    const tempCtx = document.getElementById('tempChart').getContext('2d');
    const soilCtx = document.getElementById('soilChart').getContext('2d');
    
    tempChart = new Chart(tempCtx, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Temperature (°C)', data: [], borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 2, tension: 0.4, fill: true }] },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: true } }, scales: { y: { min: 20, max: 35 } } }
    });
    
    soilChart = new Chart(soilCtx, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Soil Moisture (%)', data: [], borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 2, tension: 0.4, fill: true }] },
        options: { responsive: true, maintainAspectRatio: true, scales: { y: { min: 0, max: 100 } } }
    });
}

// ================= UI UPDATE =================
function updateUI(data) {
    // Update Temperature
    document.getElementById('temperature').textContent = data.temperature.toFixed(1);
    const tempPercent = ((data.temperature - 20) / 15) * 100;
    document.getElementById('tempBar').style.width = Math.min(Math.max(tempPercent, 0), 100) + '%';
    document.getElementById('tempBar').textContent = data.temperature.toFixed(1) + '°C';
    
    const tempStatus = document.getElementById('tempStatus');
    if (data.temperature > setpoints.tempMax) {
        tempStatus.textContent = '⚠️ Overheat!';
        tempStatus.style.background = '#fee2e2';
        tempStatus.style.color = '#dc2626';
    } else if (data.temperature < setpoints.tempMin) {
        tempStatus.textContent = '❄️ Too Cold';
        tempStatus.style.background = '#dbeafe';
        tempStatus.style.color = '#2563eb';
    } else {
        tempStatus.textContent = '✅ Optimal';
        tempStatus.style.background = '#d1fae5';
        tempStatus.style.color = '#059669';
    }
    
    // Update Soil
    document.getElementById('soilAvg').textContent = Math.round(data.soil_avg);
    document.getElementById('soilBar').style.width = data.soil_avg + '%';
    document.getElementById('soilBar').textContent = Math.round(data.soil_avg) + '%';
    
    const soilStatus = document.getElementById('soilStatus');
    if (data.soil_avg < setpoints.soilMin) {
        soilStatus.textContent = '💧 Too Dry!';
        soilStatus.style.background = '#fed7aa';
        soilStatus.style.color = '#c2410c';
    } else if (data.soil_avg > setpoints.soilMax) {
        soilStatus.textContent = '🌊 Too Wet';
        soilStatus.style.background = '#bfdbfe';
        soilStatus.style.color = '#1e40af';
    } else {
        soilStatus.textContent = '✅ Ideal';
        soilStatus.style.background = '#d1fae5';
        soilStatus.style.color = '#065f46';
    }
    
    // Update Individual Sensors
    updateSensor('soil1', data.soil1);
    updateSensor('soil2', data.soil2);
    updateSensor('soil3', data.soil3);
    
    // Update Actuators
    updateActuator('uv', data.uv);
    updateActuator('pump', data.pump);
    updateActuator('fan', data.fan);
    
    if (data.hasOwnProperty('auto_mode')) {
        isAuto = data.auto_mode;
        updateModeUI();
    }
    
    // Update Charts
    const time = new Date().toLocaleTimeString();
    updateChart(tempChart, time, data.temperature);
    updateChart(soilChart, time, data.soil_avg);
}

function updateSensor(id, value) {
    document.getElementById(id).textContent = value;
    const status = document.getElementById(id + 'Status');
    if (value < setpoints.soilMin) { status.textContent = 'Dry 💧'; status.className = 'sensor-status dry'; }
    else if (value > setpoints.soilMax) { status.textContent = 'Wet 🌊'; status.className = 'sensor-status wet'; }
    else { status.textContent = 'Ideal ✅'; status.className = 'sensor-status ideal'; }
}

function updateActuator(name, state) {
    const btn = document.getElementById(name + 'Btn');
    btn.textContent = state ? 'ON' : 'OFF';
    btn.className = `ctrl-btn ${state ? 'on' : 'off'}`;
    btn.disabled = isAuto;
}

function updateModeUI() {
    document.getElementById('autoBtn').classList.toggle('active', isAuto);
    document.getElementById('manualBtn').classList.toggle('active', !isAuto);
    document.getElementById('modeText').textContent = isAuto ? 'AUTOMATIC' : 'MANUAL';
    document.getElementById('modeText').style.color = isAuto ? '#10b981' : '#f59e0b';
    ['uvBtn', 'pumpBtn', 'fanBtn'].forEach(id => document.getElementById(id).disabled = isAuto);
}

function updateSetpoints(data) {
    Object.assign(setpoints, data);
    document.getElementById('tempMin').textContent = setpoints.tempMin;
    document.getElementById('tempMax').textContent = setpoints.tempMax;
    document.getElementById('soilMin').textContent = setpoints.soilMin;
    document.getElementById('soilMax').textContent = setpoints.soilMax;
}

function updateChart(chart, label, value) {
    if (chart.data.labels.length > 20) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
    }
    chart.data.labels.push(label);
    chart.data.datasets[0].data.push(value);
    chart.update('none');
}

function updateConnectionStatus(connected, message) {
    const dot = document.querySelector('.dot');
    const text = document.getElementById('statusText');
    dot.className = `dot ${connected ? 'online' : ''}`;
    text.textContent = connected ? '✅ Online (ESP connected)' : `⚠️ ${message || 'Offline'}`;
    if (connected) lastEspResponse = Date.now();
}

function updateTimestamp() {
    document.getElementById('timestamp').textContent = 'Last update: ' + new Date().toLocaleString('id-ID');
}

// ================= MQTT =================
function publish(topic, message) {
    if (client && client.connected) {
        client.publish(topic, message);
    } else {
        messageQueue.push({ topic, message });
    }
}

function setMode(auto) {
    publish(TOPICS.command, JSON.stringify({ mode: auto }));
    isAuto = auto;
    updateModeUI();
}

function toggleActuator(name) {
    if (!isAuto) {
        const btn = document.getElementById(name + 'Btn');
        const state = btn.textContent === 'OFF';
        publish(TOPICS.command, JSON.stringify({ [name]: state }));
    }
}

function connectMQTT() {
    const options = {
        clientId: MQTT_CONFIG.clientId,
        username: MQTT_CONFIG.username,
        password: MQTT_CONFIG.password,
        clean: true,
        reconnectPeriod: 0,
        connectTimeout: 30000,
        keepalive: 60
    };
    
    try {
        client = mqtt.connect(MQTT_CONFIG.url, options);
        
        client.on('connect', () => {
            console.log('✅ Connected to HiveMQ');
            client.subscribe(TOPICS.sensor);
            client.subscribe(TOPICS.setpoint);
            client.subscribe(TOPICS.connection);
            reconnectAttempts = 0;
            
            // Flush queue
            while (messageQueue.length > 0) {
                const msg = messageQueue.shift();
                client.publish(msg.topic, msg.message);
            }
            
            // Request data
            setTimeout(() => {
                publish(TOPICS.command, JSON.stringify({ request: 'status' }));
                publish(TOPICS.command, JSON.stringify({ request: 'setpoints' }));
            }, 500);
        });
        
        client.on('message', (topic, message) => {
            try {
                const data = JSON.parse(message.toString());
                if (topic === TOPICS.sensor) {
                    updateUI(data);
                    updateTimestamp();
                    // Update connection status based on data receipt
                    if (!espConnected) {
                        espConnected = true;
                        updateConnectionStatus(true);
                    }
                } else if (topic === TOPICS.setpoint) {
                    updateSetpoints(data);
                } else if (topic === TOPICS.connection) {
                    espConnected = data.connected;
                    updateConnectionStatus(data.connected);
                }
            } catch (e) { console.error('Parse error:', e); }
        });
        
        client.on('error', () => { updateConnectionStatus(false, 'MQTT Error'); scheduleReconnect(); });
        client.on('close', () => { updateConnectionStatus(false, 'Disconnected'); scheduleReconnect(); });
        client.on('offline', () => { updateConnectionStatus(false, 'Offline'); scheduleReconnect(); });
        
    } catch (error) {
        updateConnectionStatus(false, 'Connection failed');
        scheduleReconnect();
    }
}

function scheduleReconnect() {
    if (reconnectAttempts < 10) {
        reconnectAttempts++;
        const delay = Math.min(2000 * Math.pow(1.5, reconnectAttempts), 30000);
        setTimeout(connectMQTT, delay);
    }
}

// ================= INIT =================
window.addEventListener('load', () => {
    initCharts();
    updateModeUI();
    
    if (typeof mqtt !== 'undefined') {
        connectMQTT();
    } else {
        console.error('MQTT library not loaded');
        updateConnectionStatus(false, 'MQTT library missing');
    }
    
    updateTimestamp();
    setInterval(updateTimestamp, 1000);
    
    // Check ESP connection timeout (3 detik tanpa data = offline)
    setInterval(() => {
        if (Date.now() - lastEspResponse > 3000 && espConnected) {
            espConnected = false;
            updateConnectionStatus(false, 'ESP timeout');
        }
    }, 2000);
});

window.setMode = setMode;
window.toggleActuator = toggleActuator;
