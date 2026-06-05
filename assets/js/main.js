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
let peer;
let dataConnection;
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

createRoomBtn.addEventListener('click', () => {
    createRoomBtn.disabled = true;
    createRoomBtn.innerHTML = '<span class="spinner"></span> Creating...';
    const newRoomId = generateRoomId();
    initPeer(newRoomId);
});

joinRoomBtn.addEventListener('click', () => {
    const idToJoin = roomIdInput.value.trim().toUpperCase();
    if (idToJoin) {
        roomId = idToJoin;
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

    dataConnection.on('data', (data) => {
        if (typeof data === 'string') {
            const parsed = JSON.parse(data);
            
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
            
            fileMeta = parsed;
            receiveBuffer = [];
            receivedSize = 0;
            
            receiveProgressContainer.classList.remove('hidden');
            receiveProgressContainer.classList.remove('state-error', 'state-success');
            receiveStatus.innerText = `Receiving: ${fileMeta.name} (${fileMeta.fileIndex + 1}/${fileMeta.totalFiles})`;
        } else {
            receiveBuffer.push(data);
            receivedSize += data.byteLength;
            
            updateReceiveProgress(receivedSize, fileMeta.size);

            if (receivedSize >= fileMeta.size) {
                showDownloadButton(receiveBuffer, fileMeta.name, fileMeta.type);
                
                if (fileMeta.fileIndex + 1 === fileMeta.totalFiles) {
                    receiveStatus.innerText = "All Files Received!";
                    receiveProgressContainer.classList.add('state-success');
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

function clearAllFiles() {
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
}

// === FILE TRANSFER LOGIC ===
let isTransferring = false;
let isTransferCancelled = false;

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

fileInput.addEventListener('change', (e) => {
    if (isTransferring) {
        e.preventDefault();
        showToast("Cannot select new files while a transfer is in progress.", "error");
        return;
    }
    if (e.target.files.length > 0) {
        selectedFiles = Array.from(e.target.files);
        const totalSize = selectedFiles.reduce((acc, file) => acc + file.size, 0);
        fileDetails.innerText = `Selected: ${selectedFiles.length} file(s) (${(totalSize / 1024 / 1024).toFixed(2)} MB)`;
        sendFileBtn.disabled = false;
    }
});

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
    fileInput.disabled = true;
    sendFileBtn.disabled = true;
    sendProgressContainer.classList.remove('hidden');
    cancelTransferBtn.classList.remove('hidden');
    currentFileIndex = 0;
    
    sendNextFile();
});

function sendNextFile() {
    if (currentFileIndex >= selectedFiles.length) {
        cancelTransferBtn.classList.add('hidden');
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
    sendStatus.innerText = `Sending: ${currentFile.name} (${currentFileIndex + 1}/${selectedFiles.length})`;
    
    // Send metadata first
    const metadata = {
        name: currentFile.name,
        size: currentFile.size,
        type: currentFile.type,
        fileIndex: currentFileIndex,
        totalFiles: selectedFiles.length
    };
    dataConnection.send(JSON.stringify(metadata));

    // Send chunks
    let offset = 0;
    const fileReader = new FileReader();
    
    fileReader.onload = (e) => {
        if (!dataConnection || !dataConnection.open) return;
        if (isTransferCancelled) return; // Halt sending
        
        dataConnection.send(e.target.result);
        offset += e.target.result.byteLength;
        
        updateSendProgress(offset, currentFile.size);

        if (offset < currentFile.size) {
            readSlice(offset);
        } else {
            addSentFileRow(currentFile.name);
            currentFileIndex++;
            setTimeout(sendNextFile, 100);
        }
    };

    const readSlice = (o) => {
        const slice = currentFile.slice(offset, o + CHUNK_SIZE);
        fileReader.readAsArrayBuffer(slice);
    };

    readSlice(0);
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

function showDownloadButton(buffer, name, type) {
    const blob = new Blob(buffer, { type: type });
    const blobUrl = URL.createObjectURL(blob);
    
    const fileRow = document.createElement('div');
    fileRow.className = 'download-file-row';
    
    const fileNameDisplay = document.createElement('span');
    fileNameDisplay.className = 'file-name';
    fileNameDisplay.innerText = name;
    fileNameDisplay.title = name;
    
    const btn = document.createElement('button');
    btn.className = 'btn primary icon-btn';
    btn.title = 'Download';
    btn.innerHTML = '<span class="material-symbols-rounded">download</span>';
    btn.onclick = () => {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };
    
    fileRow.appendChild(fileNameDisplay);
    fileRow.appendChild(btn);
    downloadLinksContainer.appendChild(fileRow);
    downloadListHeader.classList.remove('hidden');
}

function addSentFileRow(name) {
    const fileRow = document.createElement('div');
    fileRow.className = 'sent-file-chip';
    
    const fileNameDisplay = document.createElement('span');
    fileNameDisplay.className = 'file-name';
    fileNameDisplay.innerText = name;
    fileNameDisplay.title = name;
    
    const iconSpan = document.createElement('span');
    iconSpan.className = 'material-symbols-rounded';
    iconSpan.style.color = 'var(--success)';
    iconSpan.innerText = 'check_circle';
    
    fileRow.appendChild(iconSpan);
    fileRow.appendChild(fileNameDisplay);
    sentFilesContainer.appendChild(fileRow);
    sentFilesDropdown.classList.remove('hidden');
    
    fileRow.addEventListener('mouseenter', () => {
        customTooltip.innerText = name;
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
