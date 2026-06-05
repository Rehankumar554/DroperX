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
    const iv = payloadBytes.slice(0, 12);
    const encryptedData = payloadBytes.slice(12);
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
const joinRoomBtn = document.getElementById('join-room-btn');
const roomIdInput = document.getElementById('room-id-input');
const displayRoomId = document.getElementById('display-room-id');
const connectionStatus = document.getElementById('connection-status');
const fileInput = document.getElementById('file-input');
const fileDetails = document.getElementById('file-details');
const sendFileBtn = document.getElementById('send-file-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const sendProgressContainer = document.getElementById('send-progress-container');
const sendProgressFill = document.getElementById('send-progress-fill');
const sendProgressText = document.getElementById('send-progress-text');
const sendStatus = document.getElementById('send-status');
const cancelTransferBtn = document.getElementById('cancel-transfer-btn');
const pauseTransferBtn = document.getElementById('pause-transfer-btn');

const receiveProgressContainer = document.getElementById('receive-progress-container');
const receiveProgressFill = document.getElementById('receive-progress-fill');
const receiveProgressText = document.getElementById('receive-progress-text');
const receiveStatus = document.getElementById('receive-status');

const fileSelectionContainer = document.getElementById('file-selection-container');
const qrCodeContainer = document.getElementById('qrcode-container');
const scanQrBtn = document.getElementById('scan-qr-btn');
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

function showAlert(title, message, callback = null) {
    alertModalTitle.innerText = title;
    alertModalMessage.innerText = message;
    alertModal.classList.remove('hidden');
    setTimeout(() => alertModal.classList.add('show'), 10);
    
    alertModalBtn.onclick = () => {
        alertModal.classList.remove('show');
        setTimeout(() => {
            alertModal.classList.add('hidden');
            if (callback) callback();
        }, 300);
    };
}

// === COPY ROOM ID ===
displayRoomId.addEventListener('click', () => {
    if (roomId) {
        navigator.clipboard.writeText(roomId).then(() => {
            showToast('Passcode Copied!', 'success');
        });
    }
});

// PeerJS Variables
let peer = null;
let dataConnection = null;

// PWA Service Worker Registration
let serviceWorkerRegistration = null;
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
        serviceWorkerRegistration = reg;
        console.log('Service Worker Registered');
    }).catch(err => {
        console.warn('Service Worker Registration Failed:', err);
    });
}

let roomId;
let selectedFiles = [];
let currentFileIndex = 0;
let html5QrcodeScanner = null;

// Chunk size for file transfer (16KB is safe for WebRTC)
const CHUNK_SIZE = 16384; 

// Generate a random room ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Switch Screens
function showScreen(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
}

let html5QrCode = null;

// === SCAN QR CODE ===
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

// === INIT PEER ===
function initPeer(id) {
    // PeerJS uses its public cloud server by default
    peer = new Peer(id);
    
    peer.on('open', (id) => {
        createRoomBtn.disabled = false;
        createRoomBtn.innerHTML = 'Create Room';
        roomId = id;
        displayRoomId.innerText = id;
        showScreen(roomScreen);
        
        // If we created a new room (no existing connection yet)
        if (!dataConnection) {
            qrCodeContainer.innerHTML = "";
            const joinUrl = window.location.href.split('?')[0] + "?room=" + id;
            new QRCode(qrCodeContainer, {
                text: joinUrl,
                width: 220,
                height: 220,
                colorDark : "#000000",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.L
            });
            connectionStatus.innerText = "Waiting for a peer to join...";
        }
    });

    peer.on('connection', (conn) => {
        // Someone joined our room
        if (dataConnection) return; // Already connected
        dataConnection = conn;
        setupDataConnection();
    });
    
    peer.on('error', (err) => {
        createRoomBtn.disabled = false;
        createRoomBtn.innerHTML = 'Create Room';
        joinRoomBtn.disabled = false;
        joinRoomBtn.innerHTML = 'Join Room';
        console.error(err);
        if (err.type === 'unavailable-id') {
            showAlert('Error', 'Room ID is already taken. Try joining it.');
        } else {
            showToast('PeerJS Error: ' + err.message, 'error');
        }
    });

    peer.on('disconnected', () => {
        showAlert("Disconnected", "Connection lost. Exiting room...", () => {
            if (peer) peer.destroy();
            window.location.href = window.location.href.split('?')[0];
        });
    });
}

// === JOIN OR CREATE ===
window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
        roomId = roomParam.toUpperCase();
        // Generate a random ID for ourselves, then connect to the room ID
        joinRoomBtn.disabled = true;
        joinRoomBtn.innerHTML = '<span class="spinner"></span> Joining...';
        
        peer = new Peer();
        peer.on('open', () => {
            joinRoomBtn.disabled = false;
            joinRoomBtn.innerHTML = 'Join Room';
            displayRoomId.innerText = roomId;
            qrCodeContainer.innerHTML = "";
            showScreen(roomScreen);
            connectionStatus.innerText = "Connecting to peer...";
            
            dataConnection = peer.connect(roomId);
            setupDataConnection();
        });
        peer.on('disconnected', () => {
            alert("Connection lost. Exiting room...");
            if (peer) peer.destroy();
            window.location.href = window.location.href.split('?')[0];
        });
        peer.on('error', (err) => {
            joinRoomBtn.disabled = false;
            joinRoomBtn.innerHTML = 'Join Room';
            showToast('Error connecting: ' + err.message, 'error');
        });
    }
});

createRoomBtn.addEventListener('click', async () => {
    createRoomBtn.disabled = true;
    createRoomBtn.innerHTML = '<span class="spinner"></span> Creating...';
    const newRoomId = generateRoomId();
    await deriveKey(newRoomId);
    initPeer(newRoomId);
});

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
            showScreen(roomScreen);
            connectionStatus.innerText = "Connecting to peer...";
            document.getElementById('header-status-dot').style.backgroundColor = "var(--info)";
            
            dataConnection = peer.connect(roomId);
            setupDataConnection();
        });
        peer.on('disconnected', () => {
            showAlert("Disconnected", "Connection lost. Exiting room...", () => {
                if (peer) peer.destroy();
                window.location.href = window.location.href.split('?')[0];
            });
        });
        peer.on('error', (err) => {
            joinRoomBtn.disabled = false;
            joinRoomBtn.innerHTML = 'Join Room';
            showToast('Error connecting: ' + err.message, 'error');
        });
    } else {
        showToast("Please enter a Room ID", "error");
    }
});

// === DATA CONNECTION ===
let receiveBuffer = [];
let receivedSize = 0;
let fileMeta = null;

function setupDataConnection() {
    dataConnection.on('open', () => {
        connectionStatus.innerText = "Connected! Ready to transfer.";
        document.getElementById('header-status-dot').classList.add('status-connected');
        const roomTransferPane = document.getElementById('room-transfer-pane');
        if (roomTransferPane) roomTransferPane.classList.remove('hidden');
        
        fileSelectionContainer.classList.remove('hidden');
        qrWrapper.classList.add('hidden');
        downloadLinksContainer.innerHTML = '';
        sentFilesContainer.innerHTML = '';
        downloadListHeader.classList.add('hidden');
        
        if (html5QrCode) {
            html5QrCode.stop().catch(e => {});
            qrModal.classList.remove('show');
            setTimeout(() => qrModal.classList.add('hidden'), 300);
        }
    });

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
            if (parsed.command === 'CANCEL_TRANSFER') {
                receiveStatus.innerText = "Transfer Cancelled by Sender!";
                receiveProgressContainer.classList.add('state-error');
                receiveBuffer = [];
                setTimeout(() => {
                    receiveProgressContainer.classList.add('hidden');
                    receiveProgressContainer.classList.remove('state-error');
                }, 4000);
                return;
            }

            if (parsed.command === 'PAUSE_TRANSFER') {
                receiveStatus.innerText = "Transfer Paused by Sender";
                receiveProgressContainer.classList.add('state-error');
                return;
            }

            if (parsed.command === 'RESUME_TRANSFER') {
                receiveStatus.innerText = `Receiving: ${sanitizeHTML(fileMeta.name)} (${fileMeta.fileIndex + 1}/${fileMeta.totalFiles})`;
                receiveProgressContainer.classList.remove('state-error');
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
                    showToast("No HTTPS detected. Falling back to RAM limit.", "warning");
                }
                
                // Automatically accept the file (RAM Fallback)
                if (dataConnection && dataConnection.open) {
                    dataConnection.send({ command: 'ACCEPT_FILE' });
                }
                return;
            }
        } else {
            // Must be a file chunk
            let bufferToDecrypt = data;
            if (data instanceof Blob) {
                bufferToDecrypt = await data.arrayBuffer();
            }
            const decryptedBuffer = await decryptChunk(bufferToDecrypt);
            if (!decryptedBuffer) {
                showToast("Decryption error. File corrupted.", "error");
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
                    console.error("Stream write error:", e);
                    showToast("Streaming failed. Connection lost?", "error");
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
        clearAllFiles();
        showAlert("Peer Left", "The other peer has left the room. Exiting...", () => {
            if (dataConnection) dataConnection.close();
            if (peer) peer.destroy();
            window.location.href = window.location.href.split('?')[0];
        });
    });

    dataConnection.on('error', (err) => {
        clearAllFiles();
        console.error(err);
        showAlert("Connection Error", err.message, () => {
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
    }
});

cancelTransferBtn.addEventListener('click', () => {
    isTransferCancelled = true;
    cancelTransferBtn.classList.add('hidden');
    
    if (dataConnection && dataConnection.open) {
        dataConnection.send(JSON.stringify({ command: 'CANCEL_TRANSFER' }));
    }
    
    sendStatus.innerText = "Transfer Cancelled!";
    sendProgressContainer.classList.add('state-error');
    
    setTimeout(() => {
        sendProgressContainer.classList.add('hidden');
        sendProgressContainer.classList.remove('state-error');
        sendFileBtn.disabled = true;
        fileInput.value = '';
        fileDetails.innerText = '';
        selectedFiles = [];
        isTransferring = false;
        fileInput.disabled = false;
    }, 3000);
});

function handleFolderSelection(filesArray) {
    if (isTransferring) {
        showToast("Cannot select new files while a transfer is in progress.", "error");
        return;
    }
    if (filesArray.length > 0) {
        window.isZippingFolder = true;
        selectedFiles = Array.from(filesArray);
        const firstPath = selectedFiles[0].webkitRelativePath || "";
        const folderName = firstPath.split('/')[0] || "Shared_Folder";
        const totalSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);
        
        fileDetails.innerText = `Selected Folder: ${folderName} (${selectedFiles.length} files, ~${(totalSize / 1024 / 1024).toFixed(2)} MB)`;
        window.folderTransferMeta = { name: `${folderName}.zip`, totalSize };
        sendFileBtn.disabled = false;
    } else {
        selectedFiles = [];
        fileDetails.innerText = "No files selected";
        sendFileBtn.disabled = true;
    }
}

function handleFileSelection(filesArray) {
    if (isTransferring) {
        showToast("Cannot select new files while a transfer is in progress.", "error");
        return;
    }
    if (filesArray.length > 0) {
        window.isZippingFolder = false;
        selectedFiles = Array.from(filesArray);
        const totalSize = selectedFiles.reduce((acc, file) => acc + file.size, 0);
        fileDetails.innerText = `Selected: ${selectedFiles.length} file(s) (${(totalSize / 1024 / 1024).toFixed(2)} MB)`;
        sendFileBtn.disabled = false;
    } else {
        selectedFiles = [];
        fileDetails.innerText = "No files selected";
        sendFileBtn.disabled = true;
    }
}

fileInput.addEventListener('change', (e) => {
    handleFileSelection(e.target.files);
});

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
        showToast("A transfer is already in progress.", "error");
        return;
    }
    if (selectedFiles.length === 0 || !dataConnection || !dataConnection.open) {
        showToast("Connection not ready or no files selected.", "error");
        return;
    }

    isTransferring = true;
    isTransferCancelled = false;
    isPaused = false;
    pauseTransferBtn.innerHTML = '<span class="material-symbols-rounded">pause</span> Pause';
    fileInput.disabled = true;
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
            fileInput.value = '';
            fileDetails.innerText = '';
            selectedFiles = [];
            isTransferring = false;
            fileInput.disabled = false;
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
            showToast("Error processing file chunk", "error");
        }
    };

    fileReader.onerror = () => {
        console.error("FileReader error:", fileReader.error);
        showToast("Error reading file", "error");
    };

    const readSlice = (o) => {
        const slice = currentFile.slice(offset, o + CHUNK_SIZE);
        fileReader.readAsArrayBuffer(slice);
    };

    const checkPauseAndRead = () => {
        if (isTransferCancelled) return;
        if (isPaused || isWaitingForAccept) {
            setTimeout(checkPauseAndRead, 100);
            return;
        }
        
        // Prevent WebRTC silent buffer overflow (keeps buffer under 1MB)
        if (dataConnection.dataChannel && dataConnection.dataChannel.bufferedAmount > 1024 * 1024) {
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

function updateSendProgress(current, total) {
    const percent = Math.min(Math.round((current / total) * 100), 100);
    sendProgressFill.style.width = percent + '%';
    sendProgressText.innerText = percent + '%';
}

function updateReceiveProgress(current, total) {
    const percent = Math.min(Math.round((current / total) * 100), 100);
    receiveProgressFill.style.width = percent + '%';
    receiveProgressText.innerText = percent + '%';
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
        downloadBtn.className = 'btn primary icon-btn small';
        downloadBtn.href = fileUrl;
        downloadBtn.download = fileName;
        downloadBtn.innerHTML = '<span class="material-symbols-rounded">download</span>';
        actions.appendChild(downloadBtn);
    }
    
    row.appendChild(nameSpan);
    row.appendChild(actions);
    downloadLinksContainer.appendChild(row);
}

// Empty to delete the function

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
    showToast('Received files cleared', 'info');
});

leaveRoomBtn.addEventListener('click', () => {
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
    sendStatus.innerText = \Zipping & Transferring Folder: \;
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
    sendStatus.innerText = \Initializing transfer: \...\;

    while (isWaitingForAccept && !isTransferCancelled) {
        await new Promise(r => setTimeout(r, 100));
    }

    if (isTransferCancelled) return;
    
    let offset = 0;
    
    const zip = new fflate.Zip((err, dat, final) => {
        if (err) {
            console.error(err);
            return;
        }
        if (dat && dat.length > 0) {
            offset += dat.length;
            updateSendProgress(offset, totalSize);
            const chunk = dat.buffer.slice(dat.byteOffset, dat.byteOffset + dat.byteLength);
            encryptChunk(chunk).then(encrypted => {
                dataConnection.send(encrypted);
            });
        }
        if (final) {
            dataConnection.send({ command: 'FILE_DONE' });
            currentFileIndex = selectedFiles.length; 
            sendNextFile(); 
        }
    });

    for (let i = 0; i < selectedFiles.length; i++) {
        if (isTransferCancelled) break;
        const file = selectedFiles[i];
        const path = file.webkitRelativePath || file.name;
        
        const zipStream = new fflate.ZipPassThrough(path);
        zip.add(zipStream);

        const reader = file.stream().getReader();
        while (true) {
            if (isTransferCancelled) break;
            const { done, value } = await reader.read();
            if (done) {
                zipStream.push(new Uint8Array(0), true);
                break;
            }
            while (dataConnection.dataChannel && dataConnection.dataChannel.bufferedAmount > 1024 * 1024) {
                await new Promise(r => setTimeout(r, 50));
            }
            zipStream.push(value);
        }
    }
    if (!isTransferCancelled) {
        zip.end();
    }
}


const folderInput = document.getElementById('folderInput');
if (folderInput) {
    folderInput.addEventListener('change', (e) => {
        handleFolderSelection(e.target.files);
    });
}
