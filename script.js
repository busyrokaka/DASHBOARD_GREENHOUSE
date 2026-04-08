// ================= KONFIGURASI HIVEMQ CLOUD =================
// ⚠️ PERHATIAN: Ganti dengan kredensial Anda dari HiveMQ Cloud
const MQTT_CONFIG = {
    // Gunakan port 8884 untuk WebSocket Secure (WSS)
    url: 'wss://062eb6c7e7a340739ba840bf0bd6f8a2.s1.eu.hivemq.cloud:8884/mqtt',
    username: 'Dashboard_Greenhouse1314',     // Ganti dengan username Anda
    password: 'GreenHouse7',     // Ganti dengan password Anda
    clientId: 'web_dashboard_' + Math.random().toString(16).substr(2, 8)
};

const TOPICS = {
    sensor: 'greenhouse/sensor/data',
    command: 'greenhouse/command'
};

// ================= GLOBAL VARIABLES =================
let mqttClient = null;
let tempChart, soilChart;
let isAutoMode = true;
let reconnectAttempts = 0;
let messageQueue = [];

// ================= INITIALIZATION =================
function initCharts() {
    const tempCtx = document.getElementById('tempChart').getContext('2d');
    const soilCtx = document.getElementById('soilChart').getContext('2d');
    
    tempChart = new Chart(tempCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Temperature (°C)',
                data: [],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { color: '#1f2937' }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: { color: '#e5e7eb' },
                    ticks: { color: '#6b7280' }
                },
                x: {
                    ticks: { 
                        maxRotation: 45,
                        minRotation: 45,
                        color: '#6b7280'
                    }
                }
            }
        }
    });
    
    soilChart = new Chart(soilCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Soil Moisture (%)',
                data: [],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { color: '#1f2937' }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: { color: '#e5e7eb' },
                    ticks: { color: '#6b7280' }
                },
                x: {
                    ticks: { 
                        maxRotation: 45,
                        minRotation: 45,
                        color: '#6b7280'
                    }
                }
            }
        }
    });
}

// ================= UI UPDATE FUNCTIONS =================
function updateUI(data) {
    console.log('Updating UI with data:', data);
    
    // Update temperature
    const tempValue = document.getElementById('temperature');
    const tempBar = document.getElementById('tempBar');
    const tempStatus = document.getElementById('tempStatus');
    
    if (tempValue) tempValue.textContent = data.temperature.toFixed(1);
    if (tempBar) {
        const tempPercent = Math.min((data.temperature / 50) * 100, 100);
        tempBar.style.width = tempPercent + '%';
    }
    
    if (tempStatus) {
        if (data.temperature > 30) {
            tempStatus.textContent = '⚠️ Overheat!';
            tempStatus.style.background = '#fee2e2';
            tempStatus.style.color = '#dc2626';
        } else if (data.temperature < 20) {
            tempStatus.textContent = '❄️ Too Cold';
            tempStatus.style.background = '#dbeafe';
            tempStatus.style.color = '#2563eb';
        } else {
            tempStatus.textContent = '✅ Optimal';
            tempStatus.style.background = '#d1fae5';
            tempStatus.style.color = '#059669';
        }
    }
    
    // Update soil moisture average
    const soilAvg = document.getElementById('soilAvg');
    const soilBar = document.getElementById('soilBar');
    if (soilAvg) soilAvg.textContent = Math.round(data.soil_avg);
    if (soilBar) soilBar.style.width = data.soil_avg + '%';
    
    // Update individual sensors
    const soil1 = document.getElementById('soil1');
    const soil2 = document.getElementById('soil2');
    const soil3 = document.getElementById('soil3');
    if (soil1) soil1.textContent = data.soil1;
    if (soil2) soil2.textContent = data.soil2;
    if (soil3) soil3.textContent = data.soil3;
    
    // Update actuator buttons
    updateActuatorButton('uv', data.uv);
    updateActuatorButton('pump', data.pump);
    updateActuatorButton('fan', data.fan);
    
    // Update mode
    isAutoMode = data.auto_mode;
    updateModeUI();
    
    // Update charts
    updateCharts(data);
}

function updateActuatorButton(actuator, state) {
    const btn = document.getElementById(`${actuator}Btn`);
    if (btn) {
        btn.textContent = state ? 'ON' : 'OFF';
        btn.className = `control-btn ${state ? 'on' : 'off'}`;
        btn.disabled = isAutoMode;
    }
}

function updateModeUI() {
    const autoBtn = document.getElementById('autoMode');
    const manualBtn = document.getElementById('manualMode');
    
    if (autoBtn && manualBtn) {
        if (isAutoMode) {
            autoBtn.classList.add('active');
            manualBtn.classList.remove('active');
        } else {
            autoBtn.classList.remove('active');
            manualBtn.classList.add('active');
        }
    }
    
    // Enable/disable manual controls
    const btns = ['uvBtn', 'pumpBtn', 'fanBtn'];
    btns.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) btn.disabled = isAutoMode;
    });
}

function updateCharts(data) {
    const timestamp = new Date().toLocaleTimeString();
    
    // Update temperature chart
    if (tempChart && tempChart.data) {
        if (tempChart.data.labels.length > 20) {
            tempChart.data.labels.shift();
            tempChart.data.datasets[0].data.shift();
        }
        tempChart.data.labels.push(timestamp);
        tempChart.data.datasets[0].data.push(data.temperature);
        tempChart.update('none');
    }
    
    // Update soil chart
    if (soilChart && soilChart.data) {
        if (soilChart.data.labels.length > 20) {
            soilChart.data.labels.shift();
            soilChart.data.datasets[0].data.shift();
        }
        soilChart.data.labels.push(timestamp);
        soilChart.data.datasets[0].data.push(data.soil_avg);
        soilChart.update('none');
    }
}

// ================= MQTT FUNCTIONS =================
function updateConnectionStatus(connected, message = '') {
    const statusDiv = document.getElementById('connectionStatus');
    if (!statusDiv) return;
    
    const dot = statusDiv.querySelector('.status-dot');
    
    if (connected) {
        if (dot) dot.classList.add('connected');
        statusDiv.innerHTML = '<span class="status-dot connected"></span> ✅ Connected to HiveMQ Cloud';
        reconnectAttempts = 0;
        // Kirim pesan yang tertunda
        while (messageQueue.length > 0) {
            const msg = messageQueue.shift();
            publishMessage(msg.topic, msg.message);
        }
    } else {
        if (dot) dot.classList.remove('connected');
        statusDiv.innerHTML = `<span class="status-dot"></span> ⚠️ ${message || 'Disconnected - Reconnecting...'}`;
    }
}

function publishMessage(topic, message) {
    if (mqttClient && mqttClient.connected) {
        mqttClient.publish(topic, message);
        console.log('Message published:', topic, message);
    } else {
        messageQueue.push({ topic, message });
        console.log('Message queued:', topic, message);
    }
}

function setMode(auto) {
    const message = JSON.stringify({ mode: auto });
    publishMessage(TOPICS.command, message);
    isAutoMode = auto;
    updateModeUI();
}

function toggleActuator(actuator) {
    if (!isAutoMode) {
        const btn = document.getElementById(`${actuator}Btn`);
        const currentState = btn.textContent === 'ON';
        const message = JSON.stringify({ [actuator]: !currentState });
        publishMessage(TOPICS.command, message);
    }
}

function connectMQTT() {
    console.log('Attempting to connect to HiveMQ Cloud...');
    console.log('URL:', MQTT_CONFIG.url);
    
    const options = {
        clientId: MQTT_CONFIG.clientId,
        username: MQTT_CONFIG.username,
        password: MQTT_CONFIG.password,
        clean: true,
        reconnectPeriod: 0, // Kita handle reconnect manual
        connectTimeout: 30 * 1000,
        keepalive: 60,
        protocol: 'wss'
    };
    
    try {
        mqttClient = mqtt.connect(MQTT_CONFIG.url, options);
        
        mqttClient.on('connect', () => {
            console.log('✅ Connected to HiveMQ Cloud successfully!');
            updateConnectionStatus(true);
            
            // Subscribe ke topic sensor
            mqttClient.subscribe(TOPICS.sensor, { qos: 1 }, (err) => {
                if (!err) {
                    console.log('✅ Subscribed to:', TOPICS.sensor);
                } else {
                    console.error('Subscription error:', err);
                }
            });
            
            // Request status
            setTimeout(() => {
                publishMessage(TOPICS.command, JSON.stringify({ request: 'status' }));
            }, 500);
        });
        
        mqttClient.on('message', (topic, message) => {
            console.log('📨 Message received on topic:', topic);
            if (topic === TOPICS.sensor) {
                try {
                    const data = JSON.parse(message.toString());
                    console.log('Data:', data);
                    updateUI(data);
                    updateTimestamp();
                } catch (e) {
                    console.error('Error parsing message:', e);
                }
            }
        });
        
        mqttClient.on('error', (err) => {
            console.error('❌ MQTT Error:', err);
            updateConnectionStatus(false, 'Connection error - Retrying...');
        });
        
        mqttClient.on('close', () => {
            console.log('MQTT connection closed');
            updateConnectionStatus(false, 'Connection closed - Reconnecting...');
            scheduleReconnect();
        });
        
        mqttClient.on('offline', () => {
            console.log('MQTT client offline');
            updateConnectionStatus(false, 'Offline - Reconnecting...');
        });
        
    } catch (error) {
        console.error('Failed to create MQTT connection:', error);
        updateConnectionStatus(false, 'Connection failed - Retrying...');
        scheduleReconnect();
    }
}

function scheduleReconnect() {
    if (reconnectAttempts < 10) {
        reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        console.log(`Reconnecting in ${delay/1000} seconds... (Attempt ${reconnectAttempts})`);
        setTimeout(connectMQTT, delay);
    } else {
        updateConnectionStatus(false, 'Failed to connect - Please refresh page');
    }
}

function updateTimestamp() {
    const now = new Date();
    const timestamp = now.toLocaleDateString('id-ID') + ' ' + now.toLocaleTimeString('id-ID');
    const timestampEl = document.getElementById('timestamp');
    if (timestampEl) timestampEl.textContent = `Last update: ${timestamp}`;
}

// ================= DEMO DATA (UNTUK TESTING TANPA ESP32) =================
let demoInterval = null;

function startDemoMode() {
    console.log('Starting demo mode...');
    let demoData = {
        temperature: 25.5,
        soil_avg: 65,
        soil1: 60,
        soil2: 65,
        soil3: 70,
        uv: false,
        pump: false,
        fan: false,
        auto_mode: true
    };
    
    updateUI(demoData);
    
    demoInterval = setInterval(() => {
        // Simulasi perubahan data
        demoData.temperature = 22 + Math.random() * 10;
        demoData.soil_avg = 50 + Math.random() * 40;
        demoData.soil1 = demoData.soil_avg - 5 + Math.random() * 10;
        demoData.soil2 = demoData.soil_avg - 2 + Math.random() * 10;
        demoData.soil3 = demoData.soil_avg + 3 + Math.random() * 10;
        
        updateUI(demoData);
        updateTimestamp();
    }, 3000);
}

// ================= INITIALIZE =================
window.addEventListener('load', () => {
    console.log('Page loaded, initializing...');
    initCharts();
    
    // Cek apakah MQTT library tersedia
    if (typeof mqtt !== 'undefined') {
        console.log('MQTT library found, connecting to broker...');
        connectMQTT();
    } else {
        console.error('MQTT library not loaded! Starting demo mode...');
        startDemoMode();
    }
    
    updateTimestamp();
    setInterval(updateTimestamp, 1000);
});

// Export functions untuk global access
window.setMode = setMode;
window.toggleActuator = toggleActuator;
