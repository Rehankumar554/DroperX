// nearby.js - Handles IP-based discovery via public MQTT using MQTT.js
let mqttClient = null;
let networkBaseTopic = null;
let myTopic = null;
let myDeviceName = "Device";

// Use sessionStorage so each tab has a unique ID, but it survives refreshes
let myDeviceId = sessionStorage.getItem("droperx_device_id");
if (!myDeviceId) {
    myDeviceId = Math.random().toString(36).substr(2, 10);
    sessionStorage.setItem("droperx_device_id", myDeviceId);
}
let activeNearbyPeers = {};

// Simple hash function for privacy
async function hashIP(ipStr) {
    if (window.crypto && window.crypto.subtle) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(ipStr);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
        } catch (e) {
            // fallback
        }
    }
    // Fallback simple hash if crypto.subtle is unavailable (e.g. HTTP over local IP)
    let hash = 0;
    for (let i = 0; i < ipStr.length; i++) {
        const char = ipStr.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0') + "fallback";
}

// Generate a friendly device name based on User-Agent
function getDeviceName() {
    const ua = navigator.userAgent;
    let device = "Device";
    if (/windows/i.test(ua)) device = "Windows PC";
    else if (/macintosh/i.test(ua)) device = "Mac";
    else if (/iphone/i.test(ua)) device = "iPhone";
    else if (/ipad/i.test(ua)) device = "iPad";
    else if (/android/i.test(ua)) {
        if (/mobile/i.test(ua)) device = "Android Phone";
        else device = "Android Tablet";
    }
    else if (/linux/i.test(ua)) device = "Linux PC";
    
    // Add a random 4 digit suffix to avoid duplicate names if same device type
    const suffix = Math.floor(1000 + Math.random() * 9000);
    return `${device} ${suffix}`;
}

async function initNearby() {
    try {
        myDeviceName = localStorage.getItem("droperx_device_name");
        if (!myDeviceName) {
            myDeviceName = getDeviceName();
            localStorage.setItem("droperx_device_name", myDeviceName);
        }
        
        // Setup device name text but keep it hidden until peers exist
        const nameDisplay = document.getElementById('my-device-name-text');
        if (nameDisplay) {
            nameDisplay.innerText = myDeviceName;
        }

        let topicKey = null;
        const hostname = window.location.hostname;
        
        // If we are NOT in production (e.g., localhost, ngrok, port forwarding), 
        // group all development traffic into one shared topic to fix CGNAT & hostname mismatch issues.
        if (hostname !== "droperx.vercel.app" && !hostname.endsWith("vercel.app")) {
            topicKey = "local_development_mode";
            console.log("Development mode detected. Using shared local discovery topic.");
        } else {
            // Production: Fetch public IP using free API with fallback
            try {
                const response = await fetch('https://api.ipify.org?format=json');
                const data = await response.json();
                if (data && data.ip) topicKey = data.ip;
            } catch(e) {
                try {
                    const response = await fetch('https://api.seeip.org/jsonip');
                    const data = await response.json();
                    if (data && data.ip) topicKey = data.ip;
                } catch(e2) {
                    console.warn("Could not fetch IP from fallbacks.", e2);
                }
            }
        }
        
        if (topicKey) {
            networkBaseTopic = "droperx/v2/" + await hashIP(topicKey);
            myTopic = networkBaseTopic + "/" + myDeviceId;
            console.log("Joined Network Topic:", networkBaseTopic);
            connectMQTT();
        }
    } catch (e) {
        console.warn("Error in initNearby:", e);
    }
}

function connectMQTT() {
    if (typeof mqtt === 'undefined') {
        console.error("MQTT.js library not loaded.");
        return;
    }
    
    // Generate a random client ID for MQTT
    const clientId = "droperx_" + Math.random().toString(16).substr(2, 8);
    // Use HiveMQ public broker for better stability across devices
    const brokerUrl = "wss://broker.hivemq.com:8884/mqtt";
    
    mqttClient = mqtt.connect(brokerUrl, {
        clientId: clientId,
        clean: true,
        connectTimeout: 10000,
        reconnectPeriod: 5000,
        // Last Will and Testament: if we disconnect ungracefully, clear our retained message
        will: {
            topic: myTopic,
            payload: "",
            qos: 0,
            retain: true
        }
    });

    mqttClient.on('connect', () => {
        console.log("MQTT Connected");
        // Subscribe to ALL devices on our network
        mqttClient.subscribe(networkBaseTopic + "/#");
        
        // If we already have a room open, broadcast it now
        if (window.currentRoomId && typeof window.broadcastNearbyPresence === 'function') {
            window.broadcastNearbyPresence(window.currentRoomId, true);
        }
    });

    mqttClient.on('message', (topic, message) => {
        try {
            const msgStr = message.toString();
            if (!msgStr) {
                // If a subtopic is cleared, extract the deviceId from the topic to remove it from UI
                const topicParts = topic.split('/');
                const clearedDeviceId = topicParts[topicParts.length - 1];
                
                // Find and remove any peer that has this deviceId
                // Since we stored roomId in activeNearbyPeers, we should also track deviceId.
                // Let's just do a reverse lookup if needed, or we can broadcast 'action: closed'
                // But if it's LWT, it's just an empty string. We'll handle it below.
                
                // We need to find which roomId belonged to this deviceId and remove it
                for (let roomId in activeNearbyPeers) {
                    if (activeNearbyPeers[roomId].deviceId === clearedDeviceId) {
                        delete activeNearbyPeers[roomId];
                        renderNearbyCards();
                        break;
                    }
                }
                return; 
            }
            
            const payload = JSON.parse(msgStr);
            handleNearbyMessage(payload, topic);
        } catch(e) {
            console.error("Invalid MQTT message", e);
        }
    });

    mqttClient.on('error', (err) => {
        if (err && err.message && err.message.includes('connack timeout')) {
            // Public MQTT brokers often timeout. Suppress this to keep console clean.
            return; 
        }
        console.warn("MQTT Connection Error:", err);
    });
}

function handleNearbyMessage(payload, topic) {
    if (!payload.roomId || !payload.action || !payload.deviceId) return;
    
    // Ignore our own broadcast from this TAB
    if (payload.deviceId === myDeviceId) return;

    if (payload.action === 'open') {
        activeNearbyPeers[payload.roomId] = {
            deviceName: payload.deviceName || "Unknown Device",
            deviceId: payload.deviceId
        };
        renderNearbyCards();
    } else if (payload.action === 'closed') {
        delete activeNearbyPeers[payload.roomId];
        renderNearbyCards();
    }
}

function renderNearbyCards() {
    const container = document.getElementById('nearby-devices-container');
    const nameContainer = document.getElementById('my-device-name-display');
    if (!container) return;

    container.innerHTML = ''; // Clear current

    const roomIds = Object.keys(activeNearbyPeers);
    
    // Show/hide my device name depending on if there are peers
    if (nameContainer) {
        if (roomIds.length > 0) {
            nameContainer.style.display = "block";
            // small delay to allow display:block to apply before fading in
            setTimeout(() => { nameContainer.style.opacity = "1"; }, 10);
        } else {
            nameContainer.style.opacity = "0";
            setTimeout(() => { nameContainer.style.display = "none"; }, 300);
        }
    }
    
    roomIds.forEach((roomId, index) => {
        const peerInfo = activeNearbyPeers[roomId];
        const deviceName = peerInfo.deviceName;
        let icon = "devices";
        if (deviceName.includes("Mac") || deviceName.includes("PC")) icon = "computer";
        if (deviceName.includes("iPhone") || deviceName.includes("Android Phone")) icon = "smartphone";
        if (deviceName.includes("iPad") || deviceName.includes("Tablet")) icon = "tablet_mac";

        const card = document.createElement('div');
        card.className = "stack-card";
        card.style.animationDelay = `${index * 0.1}s`;
        
        card.innerHTML = `
            <div class="stack-icon"><span class="material-symbols-rounded">${icon}</span></div>
            <div class="stack-info">
                <p class="stack-title">${deviceName}</p>
                <p class="stack-sub">Nearby Device</p>
            </div>
            <div class="stack-action"><span class="material-symbols-rounded">add</span></div>
        `;
        
        // When clicked, join the room!
        card.onclick = () => {
            if (window.isConnectingToNearby || card.classList.contains('connecting')) return; // Prevent multiple clicks on ANY card
            
            window.isConnectingToNearby = true;
            card.classList.add('connecting');
            card.style.opacity = '0.7';
            card.style.pointerEvents = 'none'; // Disable interactions
            
            // Show loader in the action div
            const actionDiv = card.querySelector('.stack-action');
            if (actionDiv) {
                actionDiv.innerHTML = '<span class="material-symbols-rounded" style="animation: spin 1s linear infinite;">autorenew</span>';
            }
            
            if (typeof window.joinNearbyRoom === 'function') {
                window.joinNearbyRoom(roomId);
            }
            
            // Fallback timeout to reset if connection hangs or is rejected
            setTimeout(() => {
                if (typeof window.resetNearbyCards === 'function') {
                    window.resetNearbyCards();
                }
            }, 10000); // 10s timeout reset
        };

        container.appendChild(card);
    });
}

// Global helper to instantly unlock the nearby UI (called when accepted or declined)
window.resetNearbyCards = function() {
    window.isConnectingToNearby = false;
    const cards = document.querySelectorAll('.stack-card.connecting');
    cards.forEach(card => {
        card.classList.remove('connecting');
        card.style.opacity = '1';
        card.style.pointerEvents = 'auto';
        const actionDiv = card.querySelector('.stack-action');
        if (actionDiv) {
            actionDiv.innerHTML = '<span class="material-symbols-rounded">add</span>';
        }
    });
};

// Function to be called by main.js when user creates a room
window.broadcastNearbyPresence = function(roomId, isOpen) {
    if (!mqttClient || !mqttClient.connected || !myTopic) return;
    
    const messageObj = {
        roomId: roomId,
        deviceId: myDeviceId,
        deviceName: myDeviceName,
        action: isOpen ? "open" : "closed"
    };
    
    if (!isOpen) {
        // Clear retained message by sending empty payload
        mqttClient.publish(myTopic, "", { retain: true });
    } else {
        mqttClient.publish(myTopic, JSON.stringify(messageObj), { retain: true });
    }
};

// Clear retained message gracefully on page unload/refresh
window.addEventListener('beforeunload', () => {
    if (mqttClient && mqttClient.connected && myTopic) {
        mqttClient.publish(myTopic, "", { retain: true });
    }
});

// Initialize on page load
window.addEventListener('load', initNearby);
