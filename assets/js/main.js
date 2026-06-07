// ==========================================
// CONSOLE SILENCER (For Production/Clean Console)
// Comment out the function call below to re-enable console logs
// ==========================================
function disableConsoleLogs() {
    console.log = function() {};
    console.warn = function() {};
    console.error = function() {};
    console.info = function() {};
    console.debug = function() {};
}
disableConsoleLogs(); // <-- Comment this line to see console messages again.
// ==========================================

// SECURITY: Sanitize inputs to prevent XSS (Cross-Site Scripting)
function sanitizeHTML(str) {
    if (!str) return '';
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

// --- End-to-End Encryption (AES-GCM) ---
let sharedCryptoKey = null;

async function deriveKey(roomId) {
    if (!window.crypto || !window.crypto.subtle) {
        console.warn("crypto.subtle is unavailable (HTTP context). End-to-end encryption disabled.");
        sharedCryptoKey = null;
        return;
    }
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        enc.encode(roomId),
        { name: "PBKDF2" },
        false,
        ["deriveBits", "deriveKey"]
    );
    const salt = enc.encode("DroperX_Salt_v1"); 
    sharedCryptoKey = await window.crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

async function encryptChunk(chunkBuffer) {
    if (!sharedCryptoKey) return chunkBuffer;
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        sharedCryptoKey,
        chunkBuffer
    );
    const payload = new Uint8Array(iv.length + encrypted.byteLength);
    payload.set(iv, 0);
    payload.set(new Uint8Array(encrypted), iv.length);
    return payload.buffer;
}

async function decryptChunk(encryptedPayload) {
    if (!sharedCryptoKey) return encryptedPayload;
    const payloadBytes = new Uint8Array(encryptedPayload);
    const iv = payloadBytes.subarray(0, 12);
    const encryptedData = payloadBytes.subarray(12);
    try {
        return await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            sharedCryptoKey,
            encryptedData
        );
    } catch (e) {
        console.error("Decryption failed!", e);
        return null;
    }
}

// UI Elements
const homeScreen = document.getElementById('home-screen');
const roomScreen = document.getElementById('room-screen');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('modal-join-room-btn');
const roomIdInput = document.getElementById('modal-room-id-input');
const displayRoomId = document.getElementById('display-room-id');
const connectionStatus = document.getElementById('connection-status');
const fileInput = document.getElementById('file-input');
const fileDetails = document.getElementById('file-details');
const sendFileBtn = document.getElementById('send-file-btn');
const sendTextBtn = document.getElementById('sendTextBtn');
const textMessageInput = document.getElementById('textMessageInput');
const receivedTextContainer = document.getElementById('received-text-container');
const receivedTextContent = document.getElementById('received-text-content');
const copyTextBtn = document.getElementById('copy-text-btn');

if (sendTextBtn) {
    sendTextBtn.addEventListener('click', () => {
        if (!dataConnection || !dataConnection.open) return;
        const text = textMessageInput.value.trim();
        if (text) {
            dataConnection.send(JSON.stringify({
                command: 'TEXT_MESSAGE',
                text: text
            }));
            textMessageInput.value = '';
            showToast('Message sent!', 'success');
        }
    });
}
if (copyTextBtn) {
    copyTextBtn.addEventListener('click', () => {
        if (receivedTextContent && receivedTextContent.innerText) {
            const textToCopy = receivedTextContent.innerText;
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(textToCopy).then(() => {
                    showToast('Text copied to clipboard!', 'success');
                }).catch(err => {
                    showToast('Failed to copy text', 'error');
                });
            } else {
                let textArea = document.createElement("textarea");
                textArea.value = textToCopy;
                textArea.style.position = "fixed";
                textArea.style.left = "-999999px";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                try {
                    document.execCommand('copy');
                    showToast('Text copied to clipboard!', 'success');
                } catch (err) {
                    showToast('Failed to copy text', 'error');
                }
                textArea.remove();
            }
        }
    });
}

const leaveRoomBtn = document.getElementById('leave-room-btn');
const sendProgressContainer = document.getElementById('send-progress-container');
const sendProgressFill = document.getElementById('send-progress-fill');
const sendProgressText = document.getElementById('send-progress-text');
const sendStatus = document.getElementById('send-status');
const cancelTransferBtn = document.getElementById('cancel-transfer-btn');
const pauseTransferBtn = document.getElementById('pause-transfer-btn');
const receiverPauseBtn = document.getElementById('receiver-pause-btn');
const receiverCancelBtn = document.getElementById('receiver-cancel-btn');
const receiverSkipBtn = document.getElementById('receiver-skip-btn');

const receiveProgressContainer = document.getElementById('receive-progress-container');
const receiveProgressFill = document.getElementById('receive-progress-fill');
const receiveProgressText = document.getElementById('receive-progress-text');
const receiveStatus = document.getElementById('receive-status');

const fileSelectionContainer = document.getElementById('file-selection-container');
const qrCodeContainer = document.getElementById('qrcode-container');
const scanQrBtn = document.getElementById('modal-scan-qr-btn');
const cancelScanBtn = document.getElementById('cancel-scan-btn');
const readerElement = document.getElementById('reader');
const qrWrapper = document.getElementById('qr-wrapper');
const downloadLinksContainer = document.getElementById('download-links-container');
const downloadListHeader = document.getElementById('download-list-header');
const clearDownloadsBtn = document.getElementById('clear-downloads-btn');
const sentFilesDropdown = document.getElementById('sent-files-dropdown');
const sentFilesContainer = document.getElementById('sent-files-container');
const customTooltip = document.getElementById('custom-tooltip');

// UI Modals and Toasts
const toastContainer = document.getElementById('toast-container');
const alertModal = document.getElementById('alert-modal');
const alertModalTitle = document.getElementById('alert-modal-title');
const alertModalMessage = document.getElementById('alert-modal-message');
const alertModalBtn = document.getElementById('alert-modal-btn');
const qrModal = document.getElementById('qr-modal');

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    // Material Icons based on type
    let icon = `<span class="material-symbols-rounded">info</span>`;
    if (type === 'error') {
        icon = `<span class="material-symbols-rounded" style="color:var(--error);">error</span>`;
    } else if (type === 'success') {
        icon = `<span class="material-symbols-rounded" style="color:var(--success);">check_circle</span>`;
    }
    toast.innerHTML = `${icon} <span>${message}</span>`;
    toastContainer.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after 3s
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Global Modal System
 * @param {Object} options Configuration for the modal
 * @param {string} options.title - The title text
 * @param {string} options.message - The main message or subtitle
 * @param {string} [options.icon] - Optional material icon name
 * @param {Object} [options.checkbox] - Optional checkbox { id, label, checked }
 * @param {Array} options.buttons - Array of button objects { text, role, onClick } (role: 'default'|'danger'|'bold')
 */
function showGlobalModal(options) {
    const overlay = document.getElementById('global-modal-overlay');
    const titleEl = document.getElementById('global-modal-title');
    const messageEl = document.getElementById('global-modal-message');
    const iconContainer = document.getElementById('global-modal-icon-container');
    const iconEl = document.getElementById('global-modal-icon');
    const checkboxContainer = document.getElementById('global-modal-checkbox-container');
    const checkboxInput = document.getElementById('global-modal-checkbox');
    const checkboxLabel = document.getElementById('global-modal-checkbox-label');
    const buttonsContainer = document.getElementById('global-modal-buttons');

    if (!overlay) return;

    // Reset State
    titleEl.innerText = options.title || '';
    messageEl.innerHTML = options.message || ''; // allow basic html like <br>
    
    if (options.icon) {
        iconEl.innerText = options.icon;
        iconContainer.classList.remove('hidden');
    } else {
        iconContainer.classList.add('hidden');
    }

    if (options.checkbox) {
        checkboxInput.checked = !!options.checkbox.checked;
        checkboxLabel.innerText = options.checkbox.label || '';
        checkboxContainer.classList.remove('hidden');
    } else {
        checkboxContainer.classList.add('hidden');
    }

    buttonsContainer.innerHTML = ''; // Clear old buttons

    const closeAndCleanup = () => {
        overlay.classList.remove('show');
        setTimeout(() => {
            overlay.classList.add('hidden');
        }, 300);
    };

    if (options.buttons && options.buttons.length > 0) {
        options.buttons.forEach((btnConfig, index) => {
            const btn = document.createElement('button');
            btn.className = 'ios17-row-btn modal-ios17-alert-btn';
            
            // Layout styling
            btn.style.flex = "1";
            
            // Add border between buttons if multiple
            if (options.buttons.length > 1 && index < options.buttons.length - 1) {
                btn.style.borderRight = "1px solid rgba(255, 255, 255, 0.1)";
            }

            // Role styling
            if (btnConfig.role === 'danger') {
                btn.style.color = "#FF453A"; // Exact iOS 17 Red
            } else {
                btn.style.color = "#0A84FF"; // Exact iOS 17 Blue
            }

            if (btnConfig.role === 'bold') {
                btn.style.fontWeight = "600";
            } else {
                btn.style.fontWeight = "500";
            }
            
            btn.innerText = btnConfig.text;
            btn.onclick = () => {
                const cbState = checkboxInput.checked;
                closeAndCleanup();
                if (btnConfig.onClick) {
                    btnConfig.onClick({ checkboxChecked: cbState });
                }
            };
            buttonsContainer.appendChild(btn);
        });
    } else {
        // Fallback default button
        const btn = document.createElement('button');
        btn.className = 'ios17-row-btn modal-ios17-alert-btn';
        btn.style.color = "#0A84FF";
        btn.style.fontWeight = "600";
        btn.style.flex = "1";
        btn.innerText = 'OK';
        btn.onclick = closeAndCleanup;
        buttonsContainer.appendChild(btn);
    }

    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.add('show'), 10);
}

function showAlert(title, message, callback = null) {
    showGlobalModal({
        title: title,
        message: message,
        buttons: [
            { text: 'OK', role: 'bold', onClick: callback }
        ]
    });
}

let pendingDeclineCallback = null;

function showConfirm(title, message, onAccept, onDecline) {
    if (pendingDeclineCallback) {
        pendingDeclineCallback();
    }
    pendingDeclineCallback = onDecline;

    showGlobalModal({
        title: title,
        message: message,
        buttons: [
            { 
                text: 'Decline', 
                role: 'danger', 
                onClick: () => {
                    pendingDeclineCallback = null;
                    if (onDecline) onDecline();
                } 
            },
            { 
                text: 'Accept', 
                role: 'bold', 
                onClick: () => {
                    pendingDeclineCallback = null;
                    if (onAccept) onAccept();
                } 
            }
        ]
    });
}

// === COPY ROOM ID ===
displayRoomId.addEventListener('click', () => {
    if (roomId) {
        navigator.clipboard.writeText(roomId).then(() => {
            showToast('Passcode Copied!', 'success');
        });
    }
});

const homeDisplayRoomId = document.getElementById('home-display-room-id');
const copyHomeIdBtn = document.getElementById('copy-home-id-btn');

if (homeDisplayRoomId) {
    homeDisplayRoomId.addEventListener('click', () => {
        if (roomId) {
            navigator.clipboard.writeText(roomId).then(() => {
                showToast('Passcode Copied!', 'success');
            });
        }
    });
}
if (copyHomeIdBtn) {
    copyHomeIdBtn.addEventListener('click', () => {
        if (roomId) {
            navigator.clipboard.writeText(roomId).then(() => {
                showToast('Passcode Copied!', 'success');
            });
        }
    });
}

const deleteRoomBtn = document.getElementById('delete-room-btn');
if (deleteRoomBtn) {
    deleteRoomBtn.addEventListener('click', () => {
        isExiting = true;
        if (peer) {
            peer.destroy();
            peer = null;
        }
        roomId = null;
        createRoomBtn.disabled = false;
        createRoomBtn.innerHTML = 'Create Room';
        
        document.getElementById('create-room-initial').classList.remove('hidden');
        document.getElementById('create-room-waiting').classList.remove('show'); 
        setTimeout(() => document.getElementById('create-room-waiting').classList.add('hidden'), 300);
        showToast('Room deleted successfully.', 'info');
        
        // Ensure we go back to the home screen if we were stranded
        if (typeof showScreen === 'function' && typeof homeScreen !== 'undefined') {
            showScreen(homeScreen);
        }
    });
}

const shareLinkBtn = document.getElementById('share-link-btn');
if (shareLinkBtn) {
    shareLinkBtn.addEventListener('click', () => {
        if (roomId) {
            const joinUrl = window.location.href.split('?')[0] + "?room=" + roomId;
            if (navigator.share) {
                navigator.share({
                    title: 'Join my Secure Room',
                    text: 'Click the link to join my secure file transfer room',
                    url: joinUrl,
                }).catch(console.error);
            } else {
                navigator.clipboard.writeText(joinUrl).then(() => {
                    showToast('Room link copied to clipboard!', 'success');
                });
            }
        }
    });
}

// PeerJS Variables
let peer = null;
let dataConnection = null;
let isExiting = false;

// PWA Service Worker Registration
let serviceWorkerRegistration = null;
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
        serviceWorkerRegistration = reg;
        // console.log('Service Worker Registered');
    }).catch(err => {
        console.warn('Service Worker Registration Failed:', err);
    });
}

let roomId;
let selectedFiles = [];
let currentFileIndex = 0;
let html5QrcodeScanner = null;

// Chunk size for file transfer (64KB for optimal speed)
const CHUNK_SIZE = 65536;  

// Generate a random room ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Switch Screens
function showScreen(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
    
    // Reset scroll position to top when switching screens
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Toggle "Get Started" nav link visibility
    const navGetStartedBtn = document.getElementById('nav-get-started-btn');
    const mobileGetStartedBtn = document.getElementById('mobile-get-started-btn');
    
    if (screen.id === 'room-screen') {
        if (navGetStartedBtn) navGetStartedBtn.style.display = 'none';
        if (mobileGetStartedBtn) mobileGetStartedBtn.style.display = 'none';
    } else {
        if (navGetStartedBtn) navGetStartedBtn.style.display = 'inline-block';
        if (mobileGetStartedBtn) mobileGetStartedBtn.style.display = 'flex';
    }
}

let html5QrCode = null;

// === SCAN QR CODE ===
if (scanQrBtn) {
    scanQrBtn.addEventListener('click', () => {
        qrModal.classList.remove('hidden');
        setTimeout(() => qrModal.classList.add('show'), 10);
        
        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode("reader");
        }
        
        html5QrCode.start(
            { facingMode: "environment" },
            { fps: 10 },
            (decodedText) => {
                try {
                    let roomParam = null;
                    if (decodedText.includes('room=')) {
                        roomParam = decodedText.split('room=')[1].split('&')[0];
                    } else if (decodedText.length === 6) {
                        roomParam = decodedText;
                    }
                    
                    if (roomParam) {
                        html5QrCode.stop().then(() => {
                            qrModal.classList.remove('show');
                            setTimeout(() => qrModal.classList.add('hidden'), 300);
                            roomIdInput.value = roomParam;
                            joinRoomBtn.click();
                        }).catch(err => {
                            console.error("Stop error", err);
                        });
                    }
                } catch (e) {
                    console.error("Invalid QR Code content:", decodedText);
                }
            },
            (errorMessage) => {
                // parse error, ignore
            }
        ).catch((err) => {
            showToast("Camera access error: " + err, "error");
            qrModal.classList.remove('show');
            setTimeout(() => qrModal.classList.add('hidden'), 300);
        });
    });
}

if (cancelScanBtn) {
    cancelScanBtn.addEventListener('click', () => {
        if (html5QrCode) {
            html5QrCode.stop().then(() => {
                qrModal.classList.remove('show');
                setTimeout(() => qrModal.classList.add('hidden'), 300);
            }).catch(err => console.error(err));
        } else {
            qrModal.classList.remove('show');
            setTimeout(() => qrModal.classList.add('hidden'), 300);
        }
    });
}

// === STANDBY PEER INIT ===
async function initStandbyPeer() {
    roomId = generateRoomId();
    await deriveKey(roomId); // For our own room
    
    peer = new Peer(roomId);
    
    peer.on('open', (id) => {
        createRoomBtn.disabled = false;
        createRoomBtn.innerHTML = 'Create Room';
        
        // --- NEARBY DEVICES BROADCAST ---
        window.currentRoomId = id;
        if (typeof window.broadcastNearbyPresence === 'function') {
            window.broadcastNearbyPresence(id, true);
        }
    });

    peer.on('connection', (conn) => {
        // Someone joined our standby room!
        if (dataConnection) {
            conn.close();
            return; 
        }
        
        const isNearby = conn.metadata && conn.metadata.method === 'nearby';
        
        if (isNearby) {
            // Ask for permission before accepting nearby connections
            showConfirm("Incoming Connection", "A nearby device wants to connect to you.", () => {
                // ACCEPTED
                dataConnection = conn;
                // Ensure we are using our own room's key since we are the host
                deriveKey(roomId).then(() => {
                    displayRoomId.innerText = roomId;
                    showScreen(roomScreen);
                    setupDataConnection();
                    
                    // Notify the sender that we accepted
                    dataConnection.send({ command: 'CONNECTION_ACCEPTED' });
                    
                    // Stop broadcasting
                    if (typeof window.broadcastNearbyPresence === 'function') {
                        window.broadcastNearbyPresence(window.currentRoomId, false);
                    }
                });
            }, () => {
                // DECLINED
                conn.close();
            });
        } else {
            // Auto-accept passcode/QR code connections (consent is implied by having the code)
            dataConnection = conn;
            deriveKey(roomId).then(() => {
                displayRoomId.innerText = roomId;
                showScreen(roomScreen);
                setupDataConnection();
                
                // Hide the waiting modal for the host
                const waitingModal = document.getElementById('create-room-waiting');
                if (waitingModal) {
                    waitingModal.classList.remove('show');
                    setTimeout(() => waitingModal.classList.add('hidden'), 300);
                }
                
                // Stop broadcasting
                if (typeof window.broadcastNearbyPresence === 'function') {
                    window.broadcastNearbyPresence(window.currentRoomId, false);
                }
            });
        }
    });
    
    peer.on('error', (err) => {
        console.error("Standby Peer Error:", err);
    });

    peer.on('disconnected', () => {
        if (isExiting) return;
        if (!dataConnection && peer) {
            peer.reconnect(); // Silently reconnect if we are still just waiting
        } else {
            isExiting = true;
            showAlert("Disconnected", "Connection lost. Exiting room...", () => {
                if (peer) peer.destroy();
                window.location.href = window.location.href.split('?')[0];
            });
        }
    });
}

// === JOIN OR CREATE ===
window.addEventListener('load', async () => {
    // Start standby automatically
    initStandbyPeer();
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    const actionParam = urlParams.get('action');
    
    if (roomParam) {
        roomId = roomParam.toUpperCase();
        
        if (joinRoomBtn) {
            joinRoomBtn.disabled = true;
            joinRoomBtn.innerHTML = '<span class="spinner"></span> Joining...';
        }
        
        // CRITICAL BUG FIX: Derive key before connecting so encryption works!
        await deriveKey(roomId);
        
        peer = new Peer();
        peer.on('open', () => {
            if (joinRoomBtn) {
                joinRoomBtn.disabled = false;
                joinRoomBtn.innerHTML = 'Join Room';
            }
            if (displayRoomId) displayRoomId.innerText = roomId;
            if (qrCodeContainer) qrCodeContainer.innerHTML = "";
            
            if (connectionStatus) connectionStatus.innerText = "Connecting to peer...";
            const statusDot = document.getElementById('header-status-dot');
            if (statusDot) statusDot.style.backgroundColor = "var(--info)";
            
            dataConnection = peer.connect(roomId);
            setupDataConnection();
        });
        peer.on('disconnected', () => {
            if (isExiting) return;
            isExiting = true;
            showAlert("Disconnected", "Connection lost. Exiting room...", () => {
                if (peer) peer.destroy();
                window.location.href = window.location.href.split('?')[0];
            });
        });
        peer.on('error', (err) => {
            if (joinRoomBtn) {
                joinRoomBtn.disabled = false;
                joinRoomBtn.innerHTML = 'Join Room';
            }
            if (err.type === 'peer-unavailable') {
                showScreen(homeScreen);
                showToast('Invalid Passcode or Room expired.', 'error');
            } else {
                showToast('Error connecting: ' + err.message, 'error');
            }
        });
    } else if (actionParam === 'create') {
        // Clear the URL param without reloading
        window.history.replaceState({}, document.title, window.location.pathname);
        setTimeout(() => {
            if(createRoomBtn) createRoomBtn.click();
        }, 100);
    }
    
    const navCreateBtn = document.getElementById('nav-create-room-btn');
    if (navCreateBtn) {
        navCreateBtn.addEventListener('click', () => {
            if(createRoomBtn) createRoomBtn.click();
        });
    }
});

if (createRoomBtn) {
    createRoomBtn.addEventListener('click', async () => {
        if (!roomId || !peer || peer.disconnected) {
            showToast("Initializing connection... please try again in a moment", "info");
            return;
        }
        
        // Just show the modal for the existing standby room
        document.getElementById('create-room-initial').classList.add('hidden');
        document.getElementById('create-room-waiting').classList.remove('hidden'); 
        setTimeout(() => document.getElementById('create-room-waiting').classList.add('show'), 10);
        
        document.getElementById('home-display-room-id').innerText = roomId;
        displayRoomId.innerText = roomId;
        
        const qrContainer = document.getElementById('qrcode-container');
        qrContainer.innerHTML = "";
        const joinUrl = window.location.href.split('?')[0] + "?room=" + roomId;
        new QRCode(qrContainer, {
            text: joinUrl,
            width: 150,
            height: 150,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.L
        });
        if (connectionStatus) connectionStatus.innerText = "Waiting for a peer to join...";
    });
}

// --- NEARBY DEVICES INTEGRATION ---
window.joinNearbyRoom = async function(targetRoomId) {
    if (!targetRoomId || !peer) return;
    targetRoomId = targetRoomId.toUpperCase();
    
    // We are SENDER, so derive SENDER key (target room id)
    await deriveKey(targetRoomId);
    
    displayRoomId.innerText = targetRoomId;
    
    // Pass metadata so the receiver knows this is a nearby connection and requires a prompt
    const localConn = peer.connect(targetRoomId, { metadata: { method: 'nearby' } });
    dataConnection = localConn;
    
    let hasAccepted = false;
    
    // Fallback timeout in case receiver doesn't answer or declines
    const connTimeout = setTimeout(() => {
        if (!hasAccepted && localConn) {
            if (typeof window.resetNearbyCards === 'function') window.resetNearbyCards();
            if (dataConnection === localConn) {
                showToast("Connection declined or timed out", "error");
                dataConnection = null;
            }
            localConn.close();
        }
    }, 15000); // 15 seconds to accept
    
    localConn.on('open', () => {
        showToast("Waiting for receiver to accept...", "info");
        
        const acceptListener = (data) => {
            if (data && data.command === 'CONNECTION_ACCEPTED') {
                hasAccepted = true;
                clearTimeout(connTimeout);
                if (typeof window.resetNearbyCards === 'function') window.resetNearbyCards();
                // We'll call setupDataConnection which adds its own listeners to global dataConnection.
                showScreen(roomScreen);
                setupDataConnection();
                
                // Stop broadcasting our presence since we're busy
                if (typeof window.broadcastNearbyPresence === 'function') {
                    window.broadcastNearbyPresence(window.currentRoomId, false);
                }
            }
        };
        
        localConn.on('data', acceptListener);
    });
    
    localConn.on('close', () => {
        if (!hasAccepted) {
            if (typeof window.resetNearbyCards === 'function') window.resetNearbyCards();
            if (dataConnection === localConn) {
                showToast("Connection declined", "error");
                dataConnection = null;
            }
        }
    });
};

if (joinRoomBtn) {
    joinRoomBtn.addEventListener('click', async () => {
        const idToJoin = roomIdInput.value.trim().toUpperCase();
        const isValidRoomId = /^[A-Z0-9]{6}$/i.test(idToJoin);
        
        if (!isValidRoomId) {
            showToast("Invalid Room ID. Please enter a valid 6-digit code.");
            return;
        }
        
        if (idToJoin) {
            roomId = idToJoin;
            joinRoomBtn.disabled = true;
            joinRoomBtn.innerHTML = '<span class="spinner"></span> Joining...';
            
            await deriveKey(roomId);
            
            peer = new Peer();
            peer.on('open', () => {
                joinRoomBtn.disabled = false;
                joinRoomBtn.innerHTML = 'Join Room';
                displayRoomId.innerText = roomId;
                qrCodeContainer.innerHTML = "";
                
                const joinModal = document.getElementById('join-room-modal');
                if (joinModal) {
                    joinModal.classList.remove('show');
                    setTimeout(() => joinModal.classList.add('hidden'), 300);
                }
                
                connectionStatus.innerText = "Connecting to peer...";
                document.getElementById('header-status-dot').style.backgroundColor = "var(--info)";
                
                dataConnection = peer.connect(roomId);
                setupDataConnection();
            });
            peer.on('disconnected', () => {
                if (isExiting) return;
                isExiting = true;
                showAlert("Disconnected", "Connection lost. Exiting room...", () => {
                    if (peer) peer.destroy();
                    window.location.href = window.location.href.split('?')[0];
                });
            });
            peer.on('error', (err) => {
                if (joinRoomBtn) {
                    joinRoomBtn.disabled = false;
                    joinRoomBtn.innerHTML = 'Join Room';
                }
                if (err.type === 'peer-unavailable') {
                    showScreen(homeScreen);
                    showToast('Invalid Passcode or Room expired.', 'error');
                    const joinModal = document.getElementById('join-room-modal');
                    if (joinModal) {
                        joinModal.classList.remove('hidden');
                        setTimeout(() => joinModal.classList.add('show'), 10);
                    }
                } else {
                    showToast('Error connecting: ' + err.message, 'error');
                }
            });
        } else {
            showToast("Please enter a Room ID", "error");
        }
    });
}

// === DATA CONNECTION ===
let receiveBuffer = [];
let receivedSize = 0;
let fileMeta = null;

function setupDataConnection() {
    const onConnectionOpen = () => {
        showScreen(roomScreen);
        connectionStatus.innerText = "Connected! Ready to transfer.";
        document.getElementById('header-status-dot').classList.add('status-connected');
        const roomTransferPane = document.getElementById('room-transfer-pane');
        if (roomTransferPane) roomTransferPane.classList.remove('hidden');
        
        fileSelectionContainer.classList.remove('hidden');
        if (qrWrapper) qrWrapper.classList.add('hidden');
        
        const sendTextBtn = document.getElementById('sendTextBtn');
        if(sendTextBtn) sendTextBtn.disabled = false;

        downloadLinksContainer.innerHTML = '';
        sentFilesContainer.innerHTML = '';
        downloadListHeader.classList.add('hidden');
        
        if (html5QrCode) {
            html5QrCode.stop().catch(e => {});
            qrModal.classList.remove('show');
            setTimeout(() => qrModal.classList.add('hidden'), 300);
        }
    };

    if (dataConnection.open) {
        onConnectionOpen();
    } else {
        dataConnection.on('open', onConnectionOpen);
    }

    dataConnection.on('data', async (data) => {
        let parsed = null;

        if (typeof data === 'string') {
            try {
                parsed = JSON.parse(data);
            } catch (e) {
                console.warn("Could not parse string data", e);
            }
        } else if (data && typeof data === 'object' && data.command) {
            parsed = data; // Already an object (PeerJS json serialization quirk)
        } else if (data instanceof ArrayBuffer || data instanceof Uint8Array || data instanceof Blob) {
            try {
                // In some browsers, strings might be wrapped in ArrayBuffer or Blob
                let text = "";
                if (data instanceof Blob) {
                    text = await data.text();
                } else {
                    text = new TextDecoder().decode(data);
                }
                if (text.includes('"command"')) {
                    parsed = JSON.parse(text);
                }
            } catch(e) {
                // Not a JSON string, ignore error and treat as chunk
            }
        }

        if (parsed && parsed.command) {
            if (parsed.command === 'FILE_DONE') {
                if (fileStream) {
                    try { await fileStream.close(); } catch(e){}
                    fileStream = null;
                    
                    receiveProgressContainer.classList.add('state-success');
                    receiveStatus.innerText = `Saved: ${sanitizeHTML(fileMeta.name)}`;
                    addReceivedFileRow(fileMeta.name, null, true);
                } else if (fileMeta && fileMeta.isZipStream) {
                    finalizeReceive();
                }
                
                setTimeout(() => {
                    receiveProgressContainer.classList.add('hidden');
                    receiveProgressContainer.classList.remove('state-success');
                }, 3000);
                return;
            }
            if (parsed.command === 'TEXT_MESSAGE') {
                const txtContainer = document.getElementById('received-text-container');
                const txtContent = document.getElementById('received-text-content');
                if (txtContainer && txtContent) {
                    txtContainer.classList.remove('hidden');
                    txtContent.innerText = parsed.text;
                }
                return;
            }

            if (parsed.command === 'CANCEL_TRANSFER') {
                isTransferCancelled = true;
                
                // If we were receiving
                if (fileMeta) {
                    receiveStatus.innerText = "Transfer Cancelled!";
                    receiveProgressContainer.classList.add('state-error');
                    if (receiverPauseBtn) receiverPauseBtn.classList.add('hidden');
                    if (receiverCancelBtn) receiverCancelBtn.classList.add('hidden');
                    if (receiverSkipBtn) receiverSkipBtn.classList.add('hidden');
                    receiveBuffer = [];
                    if (fileStream) {
                        try { fileStream.abort(); } catch(e){}
                        fileStream = null;
                    }
                    setTimeout(() => {
                        receiveProgressContainer.classList.add('hidden');
                        receiveProgressContainer.classList.remove('state-error');
                    }, 4000);
                }
                
                // If we were sending
                if (isTransferring) {
                    sendStatus.innerText = "Transfer Cancelled by Receiver!";
                    sendProgressContainer.classList.add('state-error');
                    cancelTransferBtn.classList.add('hidden');
                    pauseTransferBtn.classList.add('hidden');
                    setTimeout(() => {
                        sendProgressContainer.classList.add('hidden');
                        sendProgressContainer.classList.remove('state-error');
                        sendFileBtn.disabled = true;
                        document.getElementById('file-selection-form').reset();
                        fileDetails.innerText = '';
                        selectedFiles = [];
                        window.isZippingFolder = false;
                        isTransferring = false;
                    }, 3000);
                }
                return;
            }

            if (parsed.command === 'SKIP_CURRENT_FILE') {
                if (isTransferring) {
                    // Sender is notified that Receiver skipped
                    isCurrentFileSkipped = true;
                    sendStatus.innerText = "File Skipped by Receiver!";
                    sendProgressContainer.classList.add('state-error');
                } else {
                    // Receiver is notified that Sender skipped
                    receiveStatus.innerText = "File Skipped by Sender!";
                    receiveProgressContainer.classList.add('state-error');
                    receiveBuffer = [];
                    if (fileStream) {
                        try { fileStream.abort(); } catch(e){}
                        fileStream = null;
                    }
                    fileMeta = null; // Drop subsequent chunks for this file
                }
                return;
            }

            if (parsed.command === 'PAUSE_TRANSFER') {
                receiveStatus.innerText = "Transfer Paused by Sender";
                receiveProgressContainer.classList.add('state-error');
                isReceiverPaused = true;
                if (typeof receiverPauseBtn !== 'undefined' && receiverPauseBtn) {
                    receiverPauseBtn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span> Resume';
                }
                return;
            }

            if (parsed.command === 'RESUME_TRANSFER') {
                receiveStatus.innerText = `Receiving: ${sanitizeHTML(fileMeta.name)} (${fileMeta.fileIndex + 1}/${fileMeta.totalFiles})`;
                receiveProgressContainer.classList.remove('state-error');
                isReceiverPaused = false;
                if (typeof receiverPauseBtn !== 'undefined' && receiverPauseBtn) {
                    receiverPauseBtn.innerHTML = '<span class="material-symbols-rounded">pause</span> Pause';
                }
                return;
            }

            if (parsed.command === 'RECEIVER_PAUSE') {
                isPaused = true;
                sendStatus.innerText = "Paused by Receiver";
                sendProgressContainer.classList.add('state-error');
                if (pauseTransferBtn) {
                    pauseTransferBtn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span> Resume';
                }
                return;
            }

            if (parsed.command === 'RECEIVER_RESUME') {
                isPaused = false;
                sendStatus.innerText = "Transfer Resumed...";
                sendProgressContainer.classList.remove('state-error');
                if (pauseTransferBtn) {
                    pauseTransferBtn.innerHTML = '<span class="material-symbols-rounded">pause</span> Pause';
                }
                
                // Revert to Sending after 2s
                setTimeout(() => {
                    if (!isPaused && !isTransferCancelled && isTransferring && selectedFiles && selectedFiles.length > 0) {
                        const currentFile = selectedFiles[currentFileIndex];
                        if (currentFile) {
                            sendStatus.innerText = `Sending: ${sanitizeHTML(currentFile.name)} (${currentFileIndex + 1}/${selectedFiles.length})`;
                        }
                    }
                }, 2000);
                
                return;
            }

            if (parsed.command === 'ACCEPT_FILE') {
                isWaitingForAccept = false;
                if (selectedFiles && selectedFiles.length > 0) {
                    const currentFile = selectedFiles[currentFileIndex];
                    if (currentFile) {
                        sendStatus.innerText = `Sending: ${sanitizeHTML(currentFile.name)} (${currentFileIndex + 1}/${selectedFiles.length})`;
                    }
                }
                return;
            }

            if (parsed.command === 'FILE_METADATA') {
                fileMeta = parsed;
                receiveBuffer = [];
                receivedSize = 0;
                isTransferCancelled = false;
                isReceiverPaused = false;
                
                if (receiverPauseBtn) {
                    receiverPauseBtn.classList.remove('hidden');
                    receiverPauseBtn.innerHTML = '<span class="material-symbols-rounded">pause</span> Pause';
                }
                if (receiverCancelBtn) receiverCancelBtn.classList.remove('hidden');
                if (receiverSkipBtn) receiverSkipBtn.classList.remove('hidden');
                
                receiveStartTime = 0; lastReceiveTime = 0; lastReceiveBytes = 0;
                if(receiveChart) { receiveChart.data.labels=[]; receiveChart.data.datasets[0].data=[]; receiveChart.update('none'); }
                
                receiveProgressContainer.classList.remove('hidden', 'state-error', 'state-success');
                if (fileMeta.isZipStream || (fileMeta.type === 'application/zip' && fileMeta.name.endsWith('.zip'))) {
                    receiveStatus.innerText = `Receiving Folder Zip: ${sanitizeHTML(fileMeta.name)}`;
                } else {
                    receiveStatus.innerText = `Receiving: ${sanitizeHTML(fileMeta.name)} (${fileMeta.fileIndex + 1}/${fileMeta.totalFiles})`;
                }
                
                receiveProgressFill.style.width = '0%';
                receiveProgressText.innerText = '0%';
                fileStream = null;

                // --- STREAM SAVER LOGIC ---
                // If SW is active and TransformStream is supported, use limitless streaming
                if (navigator.serviceWorker && navigator.serviceWorker.controller && window.TransformStream) {
                    try {
                        const ts = new TransformStream();
                        fileStream = ts.writable.getWriter();
                        const uniqueId = Math.random().toString(36).substring(2);
                        const downloadUrl = `./stream-download/${uniqueId}/${encodeURIComponent(fileMeta.name)}`;
                        
                        const channel = new MessageChannel();
                        channel.port1.onmessage = (e) => {
                            if (e.data.status === 'READY') {
                                // Create invisible iframe to trigger the download prompt
                                const iframe = document.createElement('iframe');
                                iframe.hidden = true;
                                iframe.src = downloadUrl;
                                document.body.appendChild(iframe);
                                
                                // Tell sender we are ready
                                if (dataConnection && dataConnection.open) {
                                    dataConnection.send({ command: 'ACCEPT_FILE' });
                                }
                            }
                        };
                        
                        navigator.serviceWorker.controller.postMessage({
                            type: 'STREAM_DOWNLOAD',
                            id: uniqueId,
                            stream: ts.readable
                        }, [ts.readable, channel.port2]);
                        
                        return; // Exit early, wait for SW to reply READY
                    } catch (e) {
                        console.warn("StreamSaver setup failed, falling back to RAM", e);
                        fileStream = null;
                    }
                } else if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
                    console.warn("No HTTPS detected. Falling back to RAM limit.");
                }
                
                // Automatically accept the file (RAM Fallback)
                if (dataConnection && dataConnection.open) {
                    dataConnection.send({ command: 'ACCEPT_FILE' });
                }
                return;
            }
        } else {
            // Must be a file chunk
            if (isTransferCancelled) return;
            let bufferToDecrypt = data;
            if (data instanceof Blob) {
                bufferToDecrypt = await data.arrayBuffer();
            }
            const decryptedBuffer = await decryptChunk(bufferToDecrypt);
            if (!decryptedBuffer) {
                console.warn("Decryption error. File corrupted.");
                return;
            }
            
            if (fileStream) {
                try {
                    await fileStream.write(new Uint8Array(decryptedBuffer));
                    receivedSize += decryptedBuffer.byteLength;
                    updateReceiveProgress(receivedSize, fileMeta.size);
                    
                    if (receivedSize >= fileMeta.size && !fileMeta.isZipStream) {
                        await fileStream.close();
                        fileStream = null;
                        
                        receiveProgressContainer.classList.add('state-success');
                        receiveStatus.innerText = `Saved: ${sanitizeHTML(fileMeta.name)}`;
                        addReceivedFileRow(fileMeta.name, null, true); // True flag = streaming done
                    }
                } catch(e) {
                    if (isTransferCancelled) return;
                    console.warn("Direct stream rejected by browser. Falling back to RAM...");
                    
                    try { fileStream.abort(); } catch(err){}
                    fileStream = null;
                    
                    // Immediately process this chunk in RAM instead
                    receiveBuffer.push(decryptedBuffer);
                    receivedSize += decryptedBuffer.byteLength;
                    updateReceiveProgress(receivedSize, fileMeta.size);
                    
                    if (receivedSize >= fileMeta.size && !fileMeta.isZipStream) {
                        finalizeReceive();
                    }
                }
            } else {
                receiveBuffer.push(decryptedBuffer);
                receivedSize += decryptedBuffer.byteLength;
                
                updateReceiveProgress(receivedSize, fileMeta.size);

                if (receivedSize >= fileMeta.size && !fileMeta.isZipStream) {
                    finalizeReceive();
                }
            }
        }
    });

    dataConnection.on('close', () => {
        if (isExiting) return;
        isExiting = true;
        clearAllFiles();
        showAlert("Peer Left", "The other peer has left the room. Exiting...", () => {
            if (dataConnection) dataConnection.close();
            // --- NEARBY DEVICES CLOSE BROADCAST ---
            if (typeof window.broadcastNearbyPresence === 'function' && window.currentRoomId) {
                window.broadcastNearbyPresence(window.currentRoomId, false);
            }
            if (peer) peer.destroy();
            window.location.href = window.location.href.split('?')[0];
        });
    });

    dataConnection.on('error', (err) => {
        clearAllFiles();
        console.error(err);
        showAlert("Connection Error", err.message, () => {
            // --- NEARBY DEVICES CLOSE BROADCAST ---
            if (typeof window.broadcastNearbyPresence === 'function' && window.currentRoomId) {
                window.broadcastNearbyPresence(window.currentRoomId, false);
            }
            if (peer) peer.destroy();
            window.location.href = window.location.href.split('?')[0];
        });
    });
}

function finalizeReceive() {
    const blob = new Blob(receiveBuffer, { type: fileMeta.type });
    const blobUrl = URL.createObjectURL(blob);
    
    // Automatically trigger RAM download for non-streamed chunks
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileMeta.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    addReceivedFileRow(fileMeta.name, blobUrl, false);

    if (fileMeta.fileIndex + 1 === fileMeta.totalFiles) {
        receiveStatus.innerText = "All Files Received!";
        receiveProgressContainer.classList.add('state-success');
        if (receiverPauseBtn) receiverPauseBtn.classList.add('hidden');
        if (receiverCancelBtn) receiverCancelBtn.classList.add('hidden');
        if (receiverSkipBtn) receiverSkipBtn.classList.add('hidden');
    }
}

function clearAllFiles() {
    // Abort active stream to prevent stuck downloads
    if (fileStream) {
        try {
            fileStream.abort("Connection lost or room closed");
        } catch (e) {
            console.error("Error aborting stream", e);
        }
        fileStream = null;
    }
    
    // Reset memory buffers
    fileMeta = null;
    receiveBuffer = [];
    receivedSize = 0;
    
    // Reset flags
    isTransferring = false;
    isTransferCancelled = false;
    isWaitingForAccept = false;

    downloadLinksContainer.innerHTML = '';
    sentFilesContainer.innerHTML = '';
    fileInput.value = '';
    selectedFiles = [];
    fileDetails.innerText = '';
    downloadListHeader.classList.add('hidden');
    sentFilesDropdown.classList.add('hidden');
    sendFileBtn.disabled = true;
    sendProgressContainer.classList.add('hidden');
    receiveProgressContainer.classList.add('hidden');
    receiveProgressContainer.classList.remove('state-success', 'state-error');
}

// === FILE TRANSFER LOGIC ===
let isTransferring = false;
let isTransferCancelled = false;
let isCurrentFileSkipped = false;
let isPaused = false;
let isWaitingForAccept = false;
let fileStream = null;

pauseTransferBtn.addEventListener('click', () => {
    isPaused = !isPaused;
    if (isPaused) {
        pauseTransferBtn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span> Resume';
        sendStatus.innerText = "Transfer Paused";
        sendProgressContainer.classList.add('state-error'); // Yellow-ish or red-ish
        if (dataConnection && dataConnection.open) {
            dataConnection.send(JSON.stringify({ command: 'PAUSE_TRANSFER' }));
        }
    } else {
        pauseTransferBtn.innerHTML = '<span class="material-symbols-rounded">pause</span> Pause';
        sendStatus.innerText = "Transfer Resumed...";
        sendProgressContainer.classList.remove('state-error');
        if (dataConnection && dataConnection.open) {
            dataConnection.send(JSON.stringify({ command: 'RESUME_TRANSFER' }));
        }
        
        // Revert to Sending after 2s
        setTimeout(() => {
            if (!isPaused && !isTransferCancelled && isTransferring && selectedFiles && selectedFiles.length > 0) {
                const currentFile = selectedFiles[currentFileIndex];
                if (currentFile) {
                    sendStatus.innerText = `Sending: ${sanitizeHTML(currentFile.name)} (${currentFileIndex + 1}/${selectedFiles.length})`;
                }
            }
        }, 2000);
    }
});

function showCancelWarningModal(onConfirm) {
    if (localStorage.getItem('hideCancelWarning') === 'true') {
        onConfirm();
        return;
    }
    
    showGlobalModal({
        title: "Cancel Batch Transfer?",
        message: "This will cancel the ENTIRE batch transfer.<br><br>If you only want to cancel the current file, please use the <strong>Skip</strong> button.",
        checkbox: {
            id: 'cancel-modal-dont-show',
            label: "Don't show this again",
            checked: false
        },
        buttons: [
            {
                text: "Keep Transferring",
                role: "bold",
                onClick: () => {}
            },
            {
                text: "Cancel Batch",
                role: "danger",
                onClick: (result) => {
                    if (result.checkboxChecked) {
                        localStorage.setItem('hideCancelWarning', 'true');
                    }
                    onConfirm();
                }
            }
        ]
    });
}

cancelTransferBtn.addEventListener('click', () => {
    const doCancel = () => {
        isTransferCancelled = true;
        isWaitingForAccept = false;
        isPaused = false;
        cancelTransferBtn.classList.add('hidden');
        pauseTransferBtn.classList.add('hidden');
        
        if (dataConnection && dataConnection.open) {
            dataConnection.send(JSON.stringify({ command: 'CANCEL_TRANSFER' }));
        }
        
        sendStatus.innerText = "Transfer Cancelled!";
        sendProgressContainer.classList.add('state-error');
        
        setTimeout(() => {
            sendProgressContainer.classList.add('hidden');
            sendProgressContainer.classList.remove('state-error');
            sendFileBtn.disabled = true;
            document.getElementById('file-selection-form').reset();
            fileDetails.innerText = '';
            selectedFiles = [];
            window.isZippingFolder = false;
            isTransferring = false;
        }, 3000);
    };

    if (selectedFiles && selectedFiles.length > 1) {
        showCancelWarningModal(doCancel);
    } else {
        doCancel();
    }
});

let isReceiverPaused = false;

if (receiverPauseBtn) {
    receiverPauseBtn.addEventListener('click', () => {
        isReceiverPaused = !isReceiverPaused;
        if (isReceiverPaused) {
            receiverPauseBtn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span> Resume';
            receiveStatus.innerText = "Transfer Paused by You";
            receiveProgressContainer.classList.add('state-error');
            if (dataConnection && dataConnection.open) {
                dataConnection.send(JSON.stringify({ command: 'RECEIVER_PAUSE' }));
            }
        } else {
            receiverPauseBtn.innerHTML = '<span class="material-symbols-rounded">pause</span> Pause';
            if (fileMeta) {
                receiveStatus.innerText = `Receiving: ${sanitizeHTML(fileMeta.name)} (${fileMeta.fileIndex + 1}/${fileMeta.totalFiles})`;
            } else {
                receiveStatus.innerText = "Transfer Resumed...";
            }
            receiveProgressContainer.classList.remove('state-error');
            if (dataConnection && dataConnection.open) {
                dataConnection.send(JSON.stringify({ command: 'RECEIVER_RESUME' }));
            }
        }
    });
}

if (receiverCancelBtn) {
    const doReceiverCancel = () => {
        isTransferCancelled = true;
        isWaitingForAccept = false;
        isReceiverPaused = false;
        receiverCancelBtn.classList.add('hidden');
        if (receiverPauseBtn) receiverPauseBtn.classList.add('hidden');
        if (receiverSkipBtn) receiverSkipBtn.classList.add('hidden');
        
        if (dataConnection && dataConnection.open) {
            dataConnection.send(JSON.stringify({ command: 'CANCEL_TRANSFER' }));
        }
        
        receiveStatus.innerText = "Transfer Cancelled!";
        receiveProgressContainer.classList.add('state-error');
        receiveBuffer = [];
        if (fileStream) {
            try { fileStream.abort(); } catch(e){}
            fileStream = null;
        }
        
        setTimeout(() => {
            receiveProgressContainer.classList.add('hidden');
            receiveProgressContainer.classList.remove('state-error');
            isTransferring = false;
        }, 3000);
    };

    receiverCancelBtn.addEventListener('click', () => {
        // Let's assume if fileMeta has totalFiles > 1, it's a batch
        if (fileMeta && fileMeta.totalFiles > 1) {
            showCancelWarningModal(doReceiverCancel);
        } else {
            doReceiverCancel();
        }
    });
}

if (receiverSkipBtn) {
    receiverSkipBtn.addEventListener('click', () => {
        // If it's the last file in the queue, treat skip as cancel (bypass warning)
        if (fileMeta && fileMeta.fileIndex + 1 === fileMeta.totalFiles) {
            if (typeof doReceiverCancel !== 'undefined') {
                // To avoid scope issues with doReceiverCancel, just click the cancel button
                // but wait, clicking cancel triggers the modal!
            }
            // Let's implement inline or use a custom event.
            // Better: just run the logic directly.
            isTransferCancelled = true;
            isWaitingForAccept = false;
            isReceiverPaused = false;
            receiverCancelBtn.classList.add('hidden');
            if (receiverPauseBtn) receiverPauseBtn.classList.add('hidden');
            receiverSkipBtn.classList.add('hidden');
            
            if (dataConnection && dataConnection.open) {
                dataConnection.send(JSON.stringify({ command: 'CANCEL_TRANSFER' }));
            }
            
            receiveStatus.innerText = "Transfer Cancelled!";
            receiveProgressContainer.classList.add('state-error');
            receiveBuffer = [];
            if (fileStream) {
                try { fileStream.abort(); } catch(e){}
                fileStream = null;
            }
            
            setTimeout(() => {
                receiveProgressContainer.classList.add('hidden');
                receiveProgressContainer.classList.remove('state-error');
                isTransferring = false;
            }, 3000);
            return;
        }

        isCurrentFileSkipped = true;
        if (dataConnection && dataConnection.open) {
            dataConnection.send(JSON.stringify({ command: 'SKIP_CURRENT_FILE' }));
        }
        receiveStatus.innerText = "Skipping file...";
        receiveProgressContainer.classList.add('state-error');
        receiveBuffer = [];
        if (fileStream) {
            try { fileStream.abort(); } catch(e){}
            fileStream = null;
        }
    });
}

function getFileIcon(type, name) {
    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('video/')) return 'video_file';
    if (type.startsWith('audio/')) return 'audio_file';
    if (name.endsWith('.pdf')) return 'picture_as_pdf';
    if (name.endsWith('.zip') || name.endsWith('.rar')) return 'folder_zip';
    if (name.endsWith('.apk')) return 'apk_install';
    return 'description';
}

window.removeSelectedFile = function(index) {
    if (isTransferring) {
        showToast("Cannot remove files during an active transfer.", "error");
        return;
    }
    selectedFiles.splice(index, 1);
    if (selectedFiles.length === 0) {
        fileDetails.innerHTML = "";
        sendFileBtn.disabled = true;
        window.isZippingFolder = false;
        window.folderTransferMeta = null;
    } else {
        renderFileDetailsUI();
    }
};

function renderFileDetailsUI() {
    if (!selectedFiles || selectedFiles.length === 0) {
        fileDetails.innerHTML = "";
        sendFileBtn.disabled = true;
        return;
    }

    let html = '<div class="ios-list">';
    const maxRender = 50;
    const renderCount = Math.min(selectedFiles.length, maxRender);

    for (let i = 0; i < renderCount; i++) {
        const f = selectedFiles[i];
        const icon = getFileIcon(f.type, f.name);
        const sizeStr = (f.size / 1024 / 1024).toFixed(2) + ' MB';
        
        html += `
            <div class="ios-file-item">
                <div class="ios-file-icon"><span class="material-symbols-rounded">${icon}</span></div>
                <div class="ios-file-info">
                    <span class="ios-file-name" title="${sanitizeHTML(f.name)}">${sanitizeHTML(f.name)}</span>
                    <span class="ios-file-meta">${sizeStr}</span>
                </div>
                <button class="ios-remove-btn" onclick="removeSelectedFile(${i})"><span class="material-symbols-rounded">close</span></button>
            </div>
        `;
    }

    if (selectedFiles.length > maxRender) {
        html += `
            <div class="ios-file-item" style="justify-content: center; background: rgba(10,132,255,0.05); color: var(--accent); cursor: default;">
                <span style="font-size: 0.9rem; font-weight: 500;">+ ${selectedFiles.length - maxRender} more files...</span>
            </div>
        `;
    }

    html += '</div>';

    // If it's a folder transfer, show summary at top
    if (window.isZippingFolder) {
        const folderName = window.folderTransferMeta ? window.folderTransferMeta.name : 'Folder';
        const totalSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);
        html = `<div style="margin-bottom: 12px; color: var(--text-secondary); font-size: 0.85rem;">
                    Packaging as <strong>${sanitizeHTML(folderName)}</strong> (${(totalSize / 1024 / 1024).toFixed(2)} MB)
                </div>` + html;
    } else {
        const totalSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);
        html = `<div style="margin-bottom: 12px; color: var(--text-secondary); font-size: 0.85rem;">
                    <strong>${selectedFiles.length} file(s) selected</strong> (${(totalSize / 1024 / 1024).toFixed(2)} MB total)
                </div>` + html;
    }

    fileDetails.innerHTML = html;
    sendFileBtn.disabled = false;
}

function handleFolderSelection(filesArray) {
    if (isTransferring) {
        showToast("Cannot select new files while a transfer is in progress.", "error");
        console.warn("Cannot select new files while a transfer is in progress.");
        return;
    }
    if (filesArray.length > 0) {
        window.isZippingFolder = true;
        
        // Append new files instead of overwriting
        selectedFiles = [...selectedFiles, ...Array.from(filesArray)];
        
        // Preserve original folder name if one already exists, else create it
        if (!window.folderTransferMeta) {
            const firstPath = Array.from(filesArray)[0].webkitRelativePath || "";
            const folderName = firstPath.split('/')[0] || "Shared_Folder";
            window.folderTransferMeta = { name: `${folderName}.zip`, totalSize: 0 };
        }
        
        // Recalculate total size
        window.folderTransferMeta.totalSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);
        
        renderFileDetailsUI();
    }
}

function handleFileSelection(filesArray) {
    if (isTransferring) {
        showToast("Cannot select new files while a transfer is in progress.", "error");
        console.warn("Cannot select new files while a transfer is in progress.");
        return;
    }
    if (filesArray.length > 0) {
        // Append new files instead of overwriting
        selectedFiles = [...selectedFiles, ...Array.from(filesArray)];
        renderFileDetailsUI();
    }
}

fileInput.addEventListener('change', (e) => {
    handleFileSelection(e.target.files);
});

function interceptFileSelection(e) {
    if (isTransferring) {
        e.preventDefault();
        showToast("Cannot select new files while a transfer is in progress.", "error");
        console.warn('Cannot select new files while a transfer is in progress.');
    }
}
fileInput.addEventListener('click', interceptFileSelection);
const fInput = document.getElementById('folder-input');
if (fInput) {
    fInput.addEventListener('click', interceptFileSelection);
}

// --- Drag and Drop Feature ---
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    roomScreen.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    roomScreen.addEventListener(eventName, () => {
        if (!roomScreen.classList.contains('hidden') && !isTransferring) {
            roomScreen.classList.add('drag-over');
        }
    }, false);
});

['dragleave', 'drop'].forEach(eventName => {
    roomScreen.addEventListener(eventName, () => {
        roomScreen.classList.remove('drag-over');
    }, false);
});

roomScreen.addEventListener('drop', (e) => {
    if (!roomScreen.classList.contains('hidden') && !isTransferring) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFileSelection(files);
    }
}, false);

sendFileBtn.addEventListener('click', () => {
    if (isTransferring) {
        console.warn("A transfer is already in progress.");
        return;
    }
    if (selectedFiles.length === 0 || !dataConnection || !dataConnection.open) {
        console.warn("Connection not ready or no files selected.");
        return;
    }

    isTransferring = true;
    isTransferCancelled = false;
    isPaused = false;
    sendStartTime = 0; lastSendTime = 0; lastSendBytes = 0;
    if(sendChart) { sendChart.data.labels=[]; sendChart.data.datasets[0].data=[]; sendChart.update('none'); }
    pauseTransferBtn.innerHTML = '<span class="material-symbols-rounded">pause</span> Pause';
    sendFileBtn.disabled = true;
    sendProgressContainer.classList.remove('hidden');
    cancelTransferBtn.classList.remove('hidden');
    pauseTransferBtn.classList.remove('hidden');
    currentFileIndex = 0;
    
    if (window.isZippingFolder) {
        sendFolderStream();
    } else {
        sendNextFile();
    }
});

function sendNextFile() {
    if (currentFileIndex >= selectedFiles.length) {
        cancelTransferBtn.classList.add('hidden');
        pauseTransferBtn.classList.add('hidden');
        sendStatus.innerText = "All Files Sent Successfully!";
        sendProgressContainer.classList.add('state-success');
        sendProgressFill.style.width = '100%';
        sendProgressText.innerText = '100%';
        setTimeout(() => {
            sendProgressContainer.classList.add('hidden');
            sendProgressContainer.classList.remove('state-success');
            sendFileBtn.disabled = true;
            document.getElementById('file-selection-form').reset();
            fileDetails.innerText = '';
            selectedFiles = [];
            window.isZippingFolder = false;
            isTransferring = false;
        }, 3000);
        return;
    }

    const currentFile = selectedFiles[currentFileIndex];
    sendProgressContainer.classList.remove('state-error', 'state-success');
    sendStatus.innerText = `Sending: ${sanitizeHTML(currentFile.name)} (${currentFileIndex + 1}/${selectedFiles.length})`;
    
    // Send metadata first
    const metadata = {
        command: 'FILE_METADATA',
        name: currentFile.name,
        size: currentFile.size,
        type: currentFile.type,
        fileIndex: currentFileIndex,
        totalFiles: selectedFiles.length
    };

    dataConnection.send(metadata); // Use native object serialization

    isWaitingForAccept = true;
    sendStatus.innerText = `Initializing transfer: ${sanitizeHTML(currentFile.name)}...`;

    // Send chunks
    let offset = 0;
    const fileReader = new FileReader();
    
    fileReader.onload = async (e) => {
        if (!dataConnection || !dataConnection.open) return;
        if (isTransferCancelled) return; // Halt sending
        
        try {
            const rawBuffer = e.target.result;
            
            if (!rawBuffer || rawBuffer.byteLength === 0) {
                console.warn("Read 0 bytes. Ending chunk loop for this file.");
                offset = currentFile.size; // Force finish this file
                checkPauseAndRead();
                return;
            }
            
            const encryptedBuffer = await encryptChunk(rawBuffer);
            
            dataConnection.send(encryptedBuffer);
            offset += rawBuffer.byteLength;
            
            updateSendProgress(offset, currentFile.size);
            
            // Proceed to next chunk
            checkPauseAndRead();
        } catch (err) {
            console.error("Chunk processing error:", err);
            console.warn("Error processing file chunk");
        }
    };

    fileReader.onerror = () => {
        console.error("FileReader error:", fileReader.error);
        console.warn("Error reading file");
    };

    const readSlice = (o) => {
        const slice = currentFile.slice(offset, o + CHUNK_SIZE);
        fileReader.readAsArrayBuffer(slice);
    };

    const checkPauseAndRead = () => {
        if (isTransferCancelled) return;
        if (isCurrentFileSkipped) {
            isCurrentFileSkipped = false;
            currentFileIndex++;
            setTimeout(sendNextFile, 100);
            return;
        }
        if (isPaused || isWaitingForAccept) {
            setTimeout(checkPauseAndRead, 100);
            return;
        }
        
        // Prevent WebRTC silent buffer overflow (keeps buffer under 8MB for high speed)
        if (dataConnection.dataChannel && dataConnection.dataChannel.bufferedAmount > 8 * 1024 * 1024) {
            setTimeout(checkPauseAndRead, 50);
            return;
        }

        if (offset < currentFile.size) {
            readSlice(offset);
        } else {
            addSentFileRow(currentFile.name);
            currentFileIndex++;
            setTimeout(sendNextFile, 100);
        }
    };

    checkPauseAndRead();
}

let sendStartTime = 0;
let lastSendTime = 0;
let lastSendBytes = 0;

let receiveStartTime = 0;
let lastReceiveTime = 0;
let lastReceiveBytes = 0;

function formatETA(seconds) {
    if (!isFinite(seconds) || seconds < 0) return "--:--";
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
}

function updateSendProgress(current, total) {
    const percent = Math.min(Math.round((current / total) * 100), 100);
    sendProgressFill.style.width = percent + '%';
    sendProgressText.innerText = percent + '%';
    
    const now = Date.now();
    if (current === 0 || lastSendTime === 0 || sendStartTime === 0) {
        sendStartTime = now;
        lastSendTime = now;
        lastSendBytes = current;
        return;
    }
    
    if (now - lastSendTime >= 500 || current === total) {
        const timeDiff = (now - lastSendTime) / 1000;
        const bytesDiff = current - lastSendBytes;
        
        if (timeDiff > 0) {
            const speedBps = bytesDiff / timeDiff;
            const speedMBps = (speedBps / (1024 * 1024)).toFixed(2);
            const speedSpan = document.getElementById('send-speed');
            if(speedSpan) speedSpan.innerText = `${speedMBps} MB/s`;
            
            const remainingBytes = total - current;
            const etaSeconds = speedBps > 0 ? Math.ceil(remainingBytes / speedBps) : 0;
            const etaSpan = document.getElementById('send-eta');
            if(etaSpan) etaSpan.innerText = formatETA(etaSeconds);
            
            if (sendChart) {
                let timeElapsedStr = '';
                if (sendStartTime > 0) {
                    const elapsedSecs = Math.floor((now - sendStartTime) / 1000);
                    timeElapsedStr = elapsedSecs + 's';
                }
                sendChart.data.labels.push(timeElapsedStr);
                sendChart.data.datasets[0].data.push(speedMBps);
                if (sendChart.data.labels.length > 20) {
                    sendChart.data.labels.shift();
                    sendChart.data.datasets[0].data.shift();
                }
                sendChart.update('none');
            }
        }
        
        lastSendTime = now;
        lastSendBytes = current;
    }
}

function updateReceiveProgress(current, total) {
    const percent = Math.min(Math.round((current / total) * 100), 100);
    receiveProgressFill.style.width = percent + '%';
    receiveProgressText.innerText = percent + '%';

    const now = Date.now();
    if (current === 0 || lastReceiveTime === 0 || receiveStartTime === 0) {
        receiveStartTime = now;
        lastReceiveTime = now;
        lastReceiveBytes = current;
        return;
    }
    
    if (now - lastReceiveTime >= 500 || current === total) {
        const timeDiff = (now - lastReceiveTime) / 1000;
        const bytesDiff = current - lastReceiveBytes;
        
        if (timeDiff > 0) {
            const speedBps = bytesDiff / timeDiff;
            const speedMBps = (speedBps / (1024 * 1024)).toFixed(2);
            const rSpeedSpan = document.getElementById('receive-speed');
            if(rSpeedSpan) rSpeedSpan.innerText = `${speedMBps} MB/s`;
            
            const remainingBytes = total - current;
            const etaSeconds = speedBps > 0 ? Math.ceil(remainingBytes / speedBps) : 0;
            const rEtaSpan = document.getElementById('receive-eta');
            if(rEtaSpan) rEtaSpan.innerText = formatETA(etaSeconds);
            
            if (receiveChart) {
                let timeElapsedStr = '';
                if (receiveStartTime > 0) {
                    const elapsedSecs = Math.floor((now - receiveStartTime) / 1000);
                    timeElapsedStr = elapsedSecs + 's';
                }
                receiveChart.data.labels.push(timeElapsedStr);
                receiveChart.data.datasets[0].data.push(speedMBps);
                if (receiveChart.data.labels.length > 20) {
                    receiveChart.data.labels.shift();
                    receiveChart.data.datasets[0].data.shift();
                }
                receiveChart.update('none');
            }
        }
        
        lastReceiveTime = now;
        lastReceiveBytes = current;
    }
}

function addReceivedFileRow(fileName, fileUrl, isStreamed = false) {
    downloadListHeader.classList.remove('hidden');
    
    const row = document.createElement('div');
    row.className = 'download-file-row';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'file-name';
    nameSpan.innerText = fileName;
    
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '8px';
    
    if (isStreamed) {
        const streamedBadge = document.createElement('span');
        streamedBadge.className = 'sent-file-chip';
        streamedBadge.innerHTML = '<span class="material-symbols-rounded">check_circle</span> Streamed';
        streamedBadge.style.background = 'rgba(16, 185, 129, 0.1)';
        streamedBadge.style.color = 'var(--success)';
        streamedBadge.style.border = 'none';
        actions.appendChild(streamedBadge);
    } else {
        const downloadBtn = document.createElement('a');
        downloadBtn.className = 'btn transparent icon-btn small';
        downloadBtn.href = fileUrl;
        downloadBtn.download = fileName;
        downloadBtn.innerHTML = '<span class="material-symbols-rounded">download</span>';
        actions.appendChild(downloadBtn);
    }
    
    row.appendChild(nameSpan);
    row.appendChild(actions);
    downloadLinksContainer.appendChild(row);
}

function addSentFileRow(name) {
    const safeName = sanitizeHTML(name);
    const fileRow = document.createElement('div');
    fileRow.className = 'sent-file-chip';
    
    const fileNameDisplay = document.createElement('span');
    fileNameDisplay.className = 'file-name';
    fileNameDisplay.innerText = safeName;
    fileNameDisplay.title = safeName;
    
    const iconSpan = document.createElement('span');
    iconSpan.className = 'material-symbols-rounded';
    iconSpan.style.color = 'var(--success)';
    iconSpan.innerText = 'check_circle';
    
    fileRow.appendChild(iconSpan);
    fileRow.appendChild(fileNameDisplay);
    sentFilesContainer.appendChild(fileRow);
    sentFilesDropdown.classList.remove('hidden');
    
    fileRow.addEventListener('mouseenter', () => {
        customTooltip.innerText = safeName;
        customTooltip.classList.remove('hidden');
        
        const rect = fileRow.getBoundingClientRect();
        customTooltip.style.left = `${rect.left + rect.width / 2}px`;
        customTooltip.style.top = `${rect.top - 8}px`;
    });
    
    fileRow.addEventListener('mouseleave', () => {
        customTooltip.classList.add('hidden');
    });
}

clearDownloadsBtn.addEventListener('click', () => {
    downloadLinksContainer.innerHTML = '';
    downloadListHeader.classList.add('hidden');
    receiveProgressContainer.classList.add('hidden');
    receiveProgressContainer.classList.remove('state-success', 'state-error');
    console.log('Received files cleared');
});

leaveRoomBtn.addEventListener('click', () => {
    isExiting = true;
    clearAllFiles();
    if (dataConnection) dataConnection.close();
    if (peer) peer.destroy();
    window.location.href = window.location.href.split('?')[0];
});

function resetUI() {
    clearAllFiles();
}


async function sendFolderStream() {
    const { name, totalSize } = window.folderTransferMeta;
    sendStatus.innerText = `Zipping & Transferring Folder: ${name}`;
    sendProgressContainer.classList.remove('state-error', 'state-success');
    
    const metadata = {
        command: 'FILE_METADATA',
        name: name,
        size: totalSize,
        type: 'application/zip',
        fileIndex: 0,
        totalFiles: 1,
        isZipStream: true
    };
    dataConnection.send(metadata);
    isWaitingForAccept = true;
    sendStatus.innerText = `Initializing transfer: ${name}...`;

    while (isWaitingForAccept && !isTransferCancelled) {
        await new Promise(r => setTimeout(r, 100));
    }

    if (isTransferCancelled) return;
    
    let offset = 0;
    const chunkQueue = [];
    let isZippingDone = false;
    
    const zip = new fflate.Zip((err, dat, final) => {
        if (err) {
            console.error(err);
            return;
        }
        if (dat && dat.length > 0) {
            // copy the buffer because fflate reuses it
            chunkQueue.push(new Uint8Array(dat));
        }
        if (final) {
            isZippingDone = true;
        }
    });

    const sendLoop = async () => {
        while (!isTransferCancelled) {
            if (isPaused || isWaitingForAccept) {
                await new Promise(r => setTimeout(r, 100));
                continue;
            }
            if (chunkQueue.length > 0) {
                const chunk = chunkQueue.shift();
                
                while (!isTransferCancelled && dataConnection.dataChannel && dataConnection.dataChannel.bufferedAmount > 8 * 1024 * 1024) {
                    await new Promise(r => setTimeout(r, 50));
                }
                if (isTransferCancelled || isCurrentFileSkipped) break;
                
                offset += chunk.length;
                updateSendProgress(offset, totalSize);
                
                const encrypted = await encryptChunk(chunk);
                dataConnection.send(encrypted);
                
            } else if (isZippingDone) {
                if (!isTransferCancelled) {
                    dataConnection.send({ command: 'FILE_DONE' });
                    addSentFileRow(name);
                    currentFileIndex = selectedFiles.length; 
                    sendNextFile(); 
                }
                break;
            } else {
                await new Promise(r => setTimeout(r, 10));
            }
        }
    };
    
    // Start the sender loop
    sendLoop();

    for (let i = 0; i < selectedFiles.length; i++) {
        if (isTransferCancelled || isCurrentFileSkipped) break;
        const file = selectedFiles[i];
        const path = file.webkitRelativePath || file.name;
        
        const zipStream = new fflate.ZipPassThrough(path);
        zipStream.compression = 0; // Disable compression for maximum CPU/Transfer speed
        zip.add(zipStream);

        const reader = file.stream().getReader();
        while (true) {
            if (isTransferCancelled || isCurrentFileSkipped) break;
            const { done, value } = await reader.read();
            if (done) {
                zipStream.push(new Uint8Array(0), true);
                break;
            }
            // Prevent zip streaming from getting too far ahead of sending
            while (!isTransferCancelled && chunkQueue.length > 50) {
                await new Promise(r => setTimeout(r, 50));
            }
            zipStream.push(value);
        }
    }
    if (!isTransferCancelled && !isCurrentFileSkipped) {
        zip.end();
    }
}


const folderInput = document.getElementById('folder-input');
if (folderInput) {
    folderInput.addEventListener('change', (e) => {
        handleFolderSelection(e.target.files);
    });
}


// CHART.JS INITIALIZATION
// ==========================================
let sendChart = null;
let receiveChart = null;

function initCharts() {
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js not loaded yet.');
        return;
    }

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
            x: { 
                display: true,
                grid: { display: false, drawBorder: true },
                ticks: { color: '#888', maxTicksLimit: 5 }
            },
            y: { 
                display: true, 
                beginAtZero: true,
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: { color: '#888', callback: function(value) { return value + ' MB/s'; }, maxTicksLimit: 5 }
            }
        },
        elements: {
            point: { radius: 0 },
            line: { tension: 0.4, borderWidth: 2 }
        }
    };

    const sendCtx = document.getElementById('sendSpeedChart');
    if (sendCtx && !sendChart) {
        sendChart = new Chart(sendCtx, {
            type: 'line',
            data: {
                labels: Array(20).fill(''),
                datasets: [{
                    data: Array(20).fill(0),
                    borderColor: '#4ade80',
                    backgroundColor: 'rgba(74, 222, 128, 0.1)',
                    fill: true
                }]
            },
            options: chartOptions
        });
    }

    const receiveCtx = document.getElementById('receiveSpeedChart');
    if (receiveCtx && !receiveChart) {
        receiveChart = new Chart(receiveCtx, {
            type: 'line',
            data: {
                labels: Array(20).fill(''),
                datasets: [{
                    data: Array(20).fill(0),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: true
                }]
            },
            options: chartOptions
        });
    }
}

// Initialize charts for normal use
setTimeout(initCharts, 500);


const clearTextBtn = document.getElementById('clear-text-btn');
if (clearTextBtn) {
    clearTextBtn.addEventListener('click', () => {
        const receivedTextContent = document.getElementById('received-text-content');
        const receivedTextContainer = document.getElementById('received-text-container');
        if (receivedTextContent) receivedTextContent.innerText = '';
        if (receivedTextContainer) receivedTextContainer.classList.add('hidden');
    });
}
