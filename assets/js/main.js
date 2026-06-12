// ==========================================
// SMART CONSOLE SILENCER
// Auto-disables logs in production, keeps them enabled on localhost
// ==========================================
function disableConsoleLogs() {
  console.log = function () {};
  console.warn = function () {};
  console.error = function () {};
  console.info = function () {};
  console.debug = function () {};
}

// Check if the environment is NOT localhost or local IP
const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

if (!isLocalhost) {
  disableConsoleLogs();
} else {
  console.log("🛠️ Development mode detected: Console logs are ENABLED.");
}
// ==========================================

// SECURITY: Sanitize inputs to prevent XSS (Cross-Site Scripting)
function sanitizeHTML(str) {
  if (!str) return "";
  const temp = document.createElement("div");
  temp.textContent = str;
  return temp.innerHTML;
}

// --- AIV (Adaptive Integrity Verification) Helper ---
async function getChunkHash(buffer) {
  // CRITICAL FIX: Agar HTTPS nahi hai (Local network IP), to crash hone se bachao
  if (!window.crypto || !window.crypto.subtle) {
    return "NO_CRYPTO_ENV";
  }
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// --- End-to-End Encryption (AES-GCM) ---
let sharedCryptoKey = null;

async function deriveKey(roomId) {
  if (!window.crypto || !window.crypto.subtle) {
    console.warn(
      "crypto.subtle is unavailable (HTTP context). End-to-end encryption disabled."
    );
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

let baseIv = new Uint8Array(12);
let ivCounter = 0;
if (window.crypto && window.crypto.getRandomValues) {
  window.crypto.getRandomValues(baseIv);
}

async function encryptChunk(chunkBuffer) {
  if (!sharedCryptoKey) return chunkBuffer;

  // High-performance IV generation (OS CSPRNG is too slow on mobile if called 10k times/sec)
  const iv = new Uint8Array(12);
  iv.set(baseIv);
  const dv = new DataView(iv.buffer);
  dv.setUint32(8, dv.getUint32(8, false) + ivCounter, false);
  ivCounter++;

  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    sharedCryptoKey,
    chunkBuffer
  );
  const payload = new Uint8Array(12 + encrypted.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(encrypted), 12);
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
const homeScreen = document.getElementById("home-screen");
const roomScreen = document.getElementById("room-screen");
const createRoomBtn = document.getElementById("create-room-btn");
const joinRoomBtn = document.getElementById("modal-join-room-btn");
const roomIdInput = document.getElementById("modal-room-id-input");
const displayRoomId = document.getElementById("display-room-id");
const connectionStatus = document.getElementById("connection-status");
const fileInput = document.getElementById("file-input");
const fileDetails = document.getElementById("file-details");
const sendFileBtn = document.getElementById("send-file-btn");
const sendTextBtn = document.getElementById("sendTextBtn");
const textMessageInput = document.getElementById("textMessageInput");
const receivedTextContainer = document.getElementById(
  "received-text-container"
);
const receivedTextContent = document.getElementById("received-text-content");
const copyTextBtn = document.getElementById("copy-text-btn");
const transferModeToggle = document.getElementById("transfer-mode-toggle");
const transferModeLabel = document.getElementById("transfer-mode-label");

// Transfer Mode Toggle Toast Notification
if (transferModeToggle) {
  transferModeToggle.addEventListener("change", (e) => {
    if (e.target.checked) {
      showToast("Fast Mode Enabled", "success");
    } else {
      showToast("Secure Mode Enabled", "info");
    }
  });
}

if (sendTextBtn) {
  sendTextBtn.addEventListener("click", () => {
    if (!dataConnection || !dataConnection.open) return;
    const text = textMessageInput.value.trim();
    if (text) {
      dataConnection.send(
        JSON.stringify({
          command: "TEXT_MESSAGE",
          text: text,
        })
      );
      textMessageInput.value = "";
      showToast("Message sent!", "success");
    }
  });
}
if (copyTextBtn) {
  copyTextBtn.addEventListener("click", () => {
    if (receivedTextContent && receivedTextContent.innerText) {
      const textToCopy = receivedTextContent.innerText;
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard
          .writeText(textToCopy)
          .then(() => {
            showToast("Text copied to clipboard!", "success");
          })
          .catch((err) => {
            showToast("Failed to copy text", "error");
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
          document.execCommand("copy");
          showToast("Text copied to clipboard!", "success");
        } catch (err) {
          showToast("Failed to copy text", "error");
        }
        textArea.remove();
      }
    }
  });
}
// Task 3: Sleep Mode Drop Prevention (Wakelock API)
let wakeLock = null;
async function requestWakeLock() {
  if ("wakeLock" in navigator) {
    if (document.visibilityState !== "visible") {
      console.warn("WakeLock request deferred: Page is not visible right now.");
      return;
    }
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        console.log("Screen Wake Lock released");
      });
      console.log("Screen Wake Lock acquired");
    } catch (err) {
      console.warn(`WakeLock error: ${err.name}, ${err.message}`);
    }
  }
}

function releaseWakeLock() {
  if (wakeLock !== null) {
    wakeLock.release().then(() => {
      wakeLock = null;
    });
  }
}

// Automatically re-acquire wake lock if page becomes visible during a transfer
document.addEventListener("visibilitychange", () => {
  if (
    wakeLock === null &&
    document.visibilityState === "visible" &&
    typeof isTransferring !== "undefined" &&
    isTransferring
  ) {
    requestWakeLock();
  }
});

const leaveRoomBtn = document.getElementById("leave-room-btn");
const sendProgressContainer = document.getElementById(
  "send-progress-container"
);
const sendProgressFill = document.getElementById("send-progress-fill");
const sendProgressText = document.getElementById("send-progress-text");
const sendStatus = document.getElementById("send-status");
const cancelTransferBtn = document.getElementById("cancel-transfer-btn");
const pauseTransferBtn = document.getElementById("pause-transfer-btn");
const receiverPauseBtn = document.getElementById("receiver-pause-btn");
const receiverCancelBtn = document.getElementById("receiver-cancel-btn");
const receiverSkipBtn = document.getElementById("receiver-skip-btn");

const receiveProgressContainer = document.getElementById(
  "receive-progress-container"
);
const receiveProgressFill = document.getElementById("receive-progress-fill");
const receiveProgressText = document.getElementById("receive-progress-text");
const receiveStatus = document.getElementById("receive-status");

const fileSelectionContainer = document.getElementById(
  "file-selection-container"
);
const qrCodeContainer = document.getElementById("qrcode-container");
const scanQrBtn = document.getElementById("modal-scan-qr-btn");
const cancelScanBtn = document.getElementById("cancel-scan-btn");
const readerElement = document.getElementById("reader");
const qrWrapper = document.getElementById("qr-wrapper");
const downloadLinksContainer = document.getElementById(
  "download-links-container"
);
const downloadListHeader = document.getElementById("download-list-header");
const clearDownloadsBtn = document.getElementById("clear-downloads-btn");
const sentFilesDropdown = document.getElementById("sent-files-dropdown");
const sentFilesContainer = document.getElementById("sent-files-container");
const customTooltip = document.getElementById("custom-tooltip");

// UI Modals and Toasts
const toastContainer = document.getElementById("toast-container");
const alertModal = document.getElementById("alert-modal");
const alertModalTitle = document.getElementById("alert-modal-title");
const alertModalMessage = document.getElementById("alert-modal-message");
const alertModalBtn = document.getElementById("alert-modal-btn");
const qrModal = document.getElementById("qr-modal");

// === GLOBAL CUSTOM TOOLTIP SYSTEM (Event Delegation) ===
document.addEventListener("mouseover", (e) => {
  const target = e.target.closest("[data-tooltip]");
  if (!target || !customTooltip) return;

  customTooltip.innerText = target.dataset.tooltip;
  customTooltip.classList.remove("hidden");

  const rect = target.getBoundingClientRect();
  customTooltip.style.left = `${rect.left + rect.width / 2}px`;
  customTooltip.style.top = `${rect.top - 8}px`;
});

document.addEventListener("mouseout", (e) => {
  const target = e.target.closest("[data-tooltip]");
  if (target && customTooltip) {
    customTooltip.classList.add("hidden");
  }
});

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  // Material Icons based on type
  let icon = `<span class="material-symbols-rounded">info</span>`;
  if (type === "error") {
    icon = `<span class="material-symbols-rounded" style="color:var(--error);">error</span>`;
  } else if (type === "success") {
    icon = `<span class="material-symbols-rounded" style="color:var(--success);">check_circle</span>`;
  }
  toast.innerHTML = `${icon} <span>${message}</span>`;
  toastContainer.appendChild(toast);

  // Animate in
  setTimeout(() => toast.classList.add("show"), 10);

  // Remove after 3s
  setTimeout(() => {
    toast.classList.remove("show");
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
  const overlay = document.getElementById("global-modal-overlay");
  const titleEl = document.getElementById("global-modal-title");
  const messageEl = document.getElementById("global-modal-message");
  const iconContainer = document.getElementById("global-modal-icon-container");
  const iconEl = document.getElementById("global-modal-icon");
  const checkboxContainer = document.getElementById(
    "global-modal-checkbox-container"
  );
  const checkboxInput = document.getElementById("global-modal-checkbox");
  const checkboxLabel = document.getElementById("global-modal-checkbox-label");
  const buttonsContainer = document.getElementById("global-modal-buttons");

  if (!overlay) return;

  // Reset State
  titleEl.innerText = options.title || "";
  messageEl.innerHTML = options.message || ""; // allow basic html like <br>

  if (options.icon) {
    iconEl.innerText = options.icon;
    iconContainer.classList.remove("hidden");
  } else {
    iconContainer.classList.add("hidden");
  }

  if (options.checkbox) {
    checkboxInput.checked = !!options.checkbox.checked;
    checkboxLabel.innerText = options.checkbox.label || "";
    checkboxContainer.classList.remove("hidden");
  } else {
    checkboxContainer.classList.add("hidden");
  }

  buttonsContainer.innerHTML = ""; // Clear old buttons

  const closeAndCleanup = () => {
    overlay.classList.remove("show");
    setTimeout(() => {
      overlay.classList.add("hidden");
    }, 300);
  };

  if (options.buttons && options.buttons.length > 0) {
    options.buttons.forEach((btnConfig, index) => {
      const btn = document.createElement("button");
      btn.className = "ios17-row-btn modal-ios17-alert-btn";

      // Layout styling
      btn.style.flex = "1";

      // Add border between buttons if multiple
      if (options.buttons.length > 1 && index < options.buttons.length - 1) {
        btn.style.borderRight = "1px solid rgba(255, 255, 255, 0.1)";
      }

      // Role styling
      if (btnConfig.role === "danger") {
        btn.style.color = "#FF453A"; // Exact iOS 17 Red
      } else {
        btn.style.color = "#0A84FF"; // Exact iOS 17 Blue
      }

      if (btnConfig.role === "bold") {
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
    const btn = document.createElement("button");
    btn.className = "ios17-row-btn modal-ios17-alert-btn";
    btn.style.color = "#0A84FF";
    btn.style.fontWeight = "600";
    btn.style.flex = "1";
    btn.innerText = "OK";
    btn.onclick = closeAndCleanup;
    buttonsContainer.appendChild(btn);
  }

  overlay.classList.remove("hidden");
  setTimeout(() => overlay.classList.add("show"), 10);
}

function showAlert(title, message, callback = null) {
  showGlobalModal({
    title: title,
    message: message,
    buttons: [{ text: "OK", role: "bold", onClick: callback }],
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
        text: "Decline",
        role: "danger",
        onClick: () => {
          pendingDeclineCallback = null;
          if (onDecline) onDecline();
        },
      },
      {
        text: "Accept",
        role: "bold",
        onClick: () => {
          pendingDeclineCallback = null;
          if (onAccept) onAccept();
        },
      },
    ],
  });
}

// === COPY ROOM ID ===
displayRoomId.addEventListener("click", () => {
  if (roomId) {
    navigator.clipboard.writeText(roomId).then(() => {
      showToast("Passcode Copied!", "success");
    });
  }
});

const homeDisplayRoomId = document.getElementById("home-display-room-id");
const copyHomeIdBtn = document.getElementById("copy-home-id-btn");

if (homeDisplayRoomId) {
  homeDisplayRoomId.addEventListener("click", () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId).then(() => {
        showToast("Passcode Copied!", "success");
      });
    }
  });
}
if (copyHomeIdBtn) {
  copyHomeIdBtn.addEventListener("click", () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId).then(() => {
        showToast("Passcode Copied!", "success");
      });
    }
  });
}

const deleteRoomBtn = document.getElementById("delete-room-btn");
if (deleteRoomBtn) {
  deleteRoomBtn.addEventListener("click", () => {
    isExiting = true; // Temporary true taaki peer destroy hone par default disconnect alert na aaye
    if (peer) {
      peer.destroy();
      peer = null;
    }
    roomId = null;

    // Naye connection ke re-initialize hone tak button ko temporary loading state me daalein
    createRoomBtn.disabled = true;
    createRoomBtn.innerHTML = '<span class="spinner"></span> Initializing...';

    document.getElementById("create-room-initial").classList.remove("hidden");
    document.getElementById("create-room-waiting").classList.remove("show");
    setTimeout(
      () =>
        document.getElementById("create-room-waiting").classList.add("hidden"),
      300
    );
    showToast("Room deleted successfully.", "info");

    // Ensure we go back to the home screen if we were stranded
    if (typeof showScreen === "function" && typeof homeScreen !== "undefined") {
      showScreen(homeScreen);
    }

    // ==========================================
    // 🔥 CRITICAL BUG FIX 🔥
    // ==========================================
    // exiting flag ko reset karein aur background me naya standby peer socket shuru karein
    isExiting = false;
    initStandbyPeer();
  });
}

const shareLinkBtn = document.getElementById("share-link-btn");
if (shareLinkBtn) {
  shareLinkBtn.addEventListener("click", () => {
    if (roomId) {
      const joinUrl = window.location.href.split("?")[0] + "?room=" + roomId;
      if (navigator.share) {
        navigator
          .share({
            title: "Join my Secure Room",
            text: "Click the link to join my secure file transfer room",
            url: joinUrl,
          })
          .catch(console.error);
      } else {
        navigator.clipboard.writeText(joinUrl).then(() => {
          showToast("Room link copied to clipboard!", "success");
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
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("./sw.js")
    .then((reg) => {
      serviceWorkerRegistration = reg;
      // console.log('Service Worker Registered');
    })
    .catch((err) => {
      console.warn("Service Worker Registration Failed:", err);
    });
}

let roomId;
let selectedFiles = [];
let currentFileIndex = 0;
let html5QrcodeScanner = null;

// 256KB chunks: best balance for WebRTC throughput on both desktop and mobile.
// Smaller chunks (64KB) cause excessive per-chunk overhead; larger chunks risk mobile drops.
const CHUNK_SIZE = 262144; // 256KB

// Generate a random room ID
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Switch Screens
function showScreen(screen) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  screen.classList.add("active");

  // Reset scroll position to top when switching screens
  window.scrollTo({ top: 0, behavior: "smooth" });

  // Toggle "Get Started" nav link visibility
  const navGetStartedBtn = document.getElementById("nav-get-started-btn");
  const mobileGetStartedBtn = document.getElementById("mobile-get-started-btn");

  if (screen.id === "room-screen") {
    if (navGetStartedBtn) navGetStartedBtn.style.display = "none";
    if (mobileGetStartedBtn) mobileGetStartedBtn.style.display = "none";
  } else {
    if (navGetStartedBtn) navGetStartedBtn.style.display = "inline-block";
    if (mobileGetStartedBtn) mobileGetStartedBtn.style.display = "flex";
  }
}

let html5QrCode = null;

// === SCAN QR CODE ===
if (scanQrBtn) {
  scanQrBtn.addEventListener("click", () => {
    qrModal.classList.remove("hidden");
    setTimeout(() => qrModal.classList.add("show"), 10);

    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode("reader");
    }

    html5QrCode
      .start(
        { facingMode: "environment" },
        { fps: 10 },
        (decodedText) => {
          try {
            let roomParam = null;
            if (decodedText.includes("room=")) {
              roomParam = decodedText.split("room=")[1].split("&")[0];
            } else if (decodedText.length === 6) {
              roomParam = decodedText;
            }

            if (roomParam) {
              html5QrCode
                .stop()
                .then(() => {
                  qrModal.classList.remove("show");
                  setTimeout(() => qrModal.classList.add("hidden"), 300);
                  roomIdInput.value = roomParam;
                  joinRoomBtn.click();
                })
                .catch((err) => {
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
      )
      .catch((err) => {
        showToast("Camera access error: " + err, "error");
        qrModal.classList.remove("show");
        setTimeout(() => qrModal.classList.add("hidden"), 300);
      });
  });
}

if (cancelScanBtn) {
  cancelScanBtn.addEventListener("click", () => {
    if (html5QrCode) {
      html5QrCode
        .stop()
        .then(() => {
          qrModal.classList.remove("show");
          setTimeout(() => qrModal.classList.add("hidden"), 300);
        })
        .catch((err) => console.error(err));
    } else {
      qrModal.classList.remove("show");
      setTimeout(() => qrModal.classList.add("hidden"), 300);
    }
  });
}

// === STANDBY PEER INIT ===
async function initStandbyPeer() {
  if (typeof Peer === "undefined") {
    console.warn("PeerJS library is not defined yet (Offline launch).");
    return;
  }

  roomId = generateRoomId();
  await deriveKey(roomId); // For our own room

  peer = new Peer(roomId);

  peer.on("open", (id) => {
    createRoomBtn.disabled = false;
    createRoomBtn.innerHTML = "Create Room";

    // --- NEARBY DEVICES BROADCAST ---
    window.currentRoomId = id;
    if (typeof window.broadcastNearbyPresence === "function") {
      window.broadcastNearbyPresence(id, true);
    }
  });

  peer.on("connection", (conn) => {
    // Someone joined our standby room!
    if (dataConnection) {
      conn.close();
      return;
    }

    const isNearby = conn.metadata && conn.metadata.method === "nearby";

    if (isNearby) {
      // Ask for permission before accepting nearby connections
      showConfirm(
        "Incoming Connection",
        "A nearby device wants to connect to you.",
        () => {
          // ACCEPTED
          dataConnection = conn;
          // Ensure we are using our own room's key since we are the host
          deriveKey(roomId).then(() => {
            displayRoomId.innerText = roomId;
            showScreen(roomScreen);
            setupDataConnection();

            // Notify the sender that we accepted
            dataConnection.send({ command: "CONNECTION_ACCEPTED" });

            // Stop broadcasting
            if (typeof window.broadcastNearbyPresence === "function") {
              window.broadcastNearbyPresence(window.currentRoomId, false);
            }
          });
        },
        () => {
          // DECLINED
          conn.close();
        }
      );
    } else {
      // Auto-accept passcode/QR code connections (consent is implied by having the code)
      dataConnection = conn;
      deriveKey(roomId).then(() => {
        displayRoomId.innerText = roomId;
        showScreen(roomScreen);
        setupDataConnection();

        // Hide the waiting modal for the host
        const waitingModal = document.getElementById("create-room-waiting");
        if (waitingModal) {
          waitingModal.classList.remove("show");
          setTimeout(() => waitingModal.classList.add("hidden"), 300);
        }

        // Stop broadcasting
        if (typeof window.broadcastNearbyPresence === "function") {
          window.broadcastNearbyPresence(window.currentRoomId, false);
        }
      });
    }
  });

  peer.on("error", (err) => {
    // Suppress generic network/server errors from spamming the console
    if (
      err.type === "network" ||
      err.type === "server-error" ||
      err.message.includes("Lost connection")
    ) {
      // Silently ignore or log as debug
    } else {
      console.error("Standby Peer Error:", err);
    }
  });

  peer.on("disconnected", () => {
    if (isExiting) return;
    setTimeout(() => {
      if (!peer.destroyed) {
        try {
          peer.reconnect();
        } catch (e) {}
      }
    }, 1000);
  });
}

// === FULL SCREEN OFFLINE OVERLAY LOGIC ===
let launchedOffline = !navigator.onLine; // Store karein ki kya page offline open hua tha

const offlineOverlay = document.getElementById("offline-overlay");
const offlineIconWrapper = document.getElementById("offline-icon-wrapper");
const offlineIcon = document.getElementById("offline-icon");
const offlineTitle = document.getElementById("offline-title");
const offlineDesc = document.getElementById("offline-desc");
const offlineSpinner = document.getElementById("offline-spinner");
const offlineStatusText = document.getElementById("offline-status-text");

let offlineTimeout = null;

function resetOfflineUI() {
  if (!offlineOverlay) return;
  offlineIconWrapper.style.background = "rgba(255, 69, 58, 0.1)"; // Red background
  offlineIcon.style.color = "#FF453A"; // Red icon
  offlineIcon.innerText = "wifi_off";

  offlineTitle.innerText = "You're Offline";
  offlineTitle.style.color = "white";

  offlineDesc.innerText =
    "It seems your internet connection is slow or disconnected. Please check your network.";

  offlineSpinner.style.display = "inline-block";
  offlineSpinner.style.opacity = "1";

  offlineStatusText.innerText = "Waiting for connection...";
  offlineStatusText.style.color = "var(--text-secondary)";
}

function showOfflineScreen() {
  if (offlineOverlay) {
    clearTimeout(offlineTimeout);
    resetOfflineUI();
    offlineOverlay.classList.remove("hidden");
    setTimeout(() => offlineOverlay.classList.add("show"), 10);
  }
}

function hideOfflineScreen() {
  if (offlineOverlay) {
    offlineOverlay.classList.remove("show");
    setTimeout(() => {
      offlineOverlay.classList.add("hidden");
    }, 300);
  }
}

// Jab normal chalti app me internet disconnect ho jaye
window.addEventListener("offline", () => {
  showOfflineScreen();
});

// Jab internet wapas aa jaye
window.addEventListener("online", () => {
  if (offlineOverlay) {
    offlineIconWrapper.style.background = "rgba(48, 209, 88, 0.1)"; // Green background
    offlineIcon.style.color = "#30D158"; // Green icon
    offlineIcon.innerText = "wifi";

    offlineTitle.innerText = "Back Online!";
    offlineTitle.style.color = "#30D158";

    // Custom text check: Agar user offline page load kiya tha
    if (launchedOffline) {
      offlineDesc.innerText =
        "Refreshing app resources and initializing secure protocols...";
      offlineStatusText.innerText = "Reloading...";
    } else {
      offlineDesc.innerText =
        "Connection restored successfully. You can continue sharing files.";
      offlineStatusText.innerText = "Ready to connect";
    }

    offlineSpinner.style.opacity = "0";
    setTimeout(() => (offlineSpinner.style.display = "none"), 300);
    offlineStatusText.style.color = "#30D158";

    clearTimeout(offlineTimeout);
    offlineTimeout = setTimeout(() => {
      if (launchedOffline) {
        // CRITICAL FIX: Page ko reload karein taaki saare missing online resources (CDN scripts/fonts) fresh load ho sakein
        window.location.reload();
      } else {
        hideOfflineScreen();
        if (!peer || peer.disconnected) {
          initStandbyPeer();
        }
      }
    }, 1500); // 1.5s ka smooth delay text aur animations ke liye
  }
});

// === SMART SLOW NETWORK TOGGLER (NO TIMERS) ===
if (navigator.connection) {
  const slowBar = document.getElementById("slow-network-bar");

  function handleNetworkChange() {
    if (!slowBar) return;

    const speedType = navigator.connection.effectiveType; // Returns: 'slow-2g', '2g', '3g', or '4g'

    // console.log("Current Effective Network Type:", speedType);

    // Agar net ki speed 2G ya 3G par drop hoti hai
    if (speedType === "slow-2g" || speedType === "2g" || speedType === "3g") {
      slowBar.style.display = "flex"; // Instantly show div

      if (window.matchMedia("(max-width: 768px)").matches) {
        slowBar.style.top = "0";
        slowBar.style.bottom = "auto";
      } else {
        slowBar.style.bottom = "0";
        slowBar.style.top = "auto";
      }
    } else if (speedType === "4g") {
      slowBar.style.display = "none";
    } else {
      slowBar.style.display = "none"; // Instantly hide div when speed is normal (4G/Wi-Fi)
    }
  }

  // 1. Listen for real-time network status changes (Instant reactive trigger)
  navigator.connection.addEventListener("change", handleNetworkChange);

  // 2. Initial check on page load
  handleNetworkChange();
}

// === JOIN OR CREATE ===
window.addEventListener("load", async () => {
  if (!navigator.onLine) {
    showOfflineScreen();
  }

  // Start standby automatically
  initStandbyPeer();
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get("room");
  const actionParam = urlParams.get("action");

  if (roomParam) {
    roomId = roomParam.toUpperCase();

    if (joinRoomBtn) {
      joinRoomBtn.disabled = true;
      joinRoomBtn.innerHTML = '<span class="spinner"></span> Joining...';
    }

    // CRITICAL BUG FIX: Derive key before connecting so encryption works!
    await deriveKey(roomId);

    peer = new Peer();
    peer.on("open", () => {
      if (joinRoomBtn) {
        joinRoomBtn.disabled = false;
        joinRoomBtn.innerHTML = "Join Room";
      }
      if (displayRoomId) displayRoomId.innerText = roomId;
      if (qrCodeContainer) qrCodeContainer.innerHTML = "";

      if (connectionStatus)
        connectionStatus.innerText = "Connecting to peer...";
      const statusDot = document.getElementById("header-status-dot");
      if (statusDot) statusDot.style.backgroundColor = "var(--info)";

      dataConnection = peer.connect(roomId);
      setupDataConnection();
    });
    peer.on("disconnected", () => {
      if (isExiting) return;
      setTimeout(() => {
        if (!peer.destroyed) {
          try {
            peer.reconnect();
          } catch (e) {}
        }
      }, 1000);
    });
    peer.on("error", (err) => {
      if (
        err.type === "network" ||
        err.type === "server-error" ||
        err.message.includes("Lost connection")
      )
        return;

      if (joinRoomBtn) {
        joinRoomBtn.disabled = false;
        joinRoomBtn.innerHTML = "Join Room";
      }
      if (err.type === "peer-unavailable") {
        showScreen(homeScreen);
        showToast("Invalid Passcode or Room expired.", "error");
      } else {
        showToast("Error connecting: " + err.message, "error");
      }
    });
  } else if (actionParam === "create") {
    // Clear the URL param without reloading
    window.history.replaceState({}, document.title, window.location.pathname);
    setTimeout(() => {
      if (createRoomBtn) createRoomBtn.click();
    }, 100);
  }

  const navCreateBtn = document.getElementById("nav-create-room-btn");
  if (navCreateBtn) {
    navCreateBtn.addEventListener("click", () => {
      if (createRoomBtn) createRoomBtn.click();
    });
  }
});

if (createRoomBtn) {
  createRoomBtn.addEventListener("click", async () => {
    if (!roomId || !peer || peer.disconnected) {
      showToast(
        "Initializing connection... please try again in a moment",
        "info"
      );
      return;
    }

    // Just show the modal for the existing standby room
    document.getElementById("create-room-initial").classList.add("hidden");
    document.getElementById("create-room-waiting").classList.remove("hidden");
    setTimeout(
      () =>
        document.getElementById("create-room-waiting").classList.add("show"),
      10
    );

    document.getElementById("home-display-room-id").innerText = roomId;
    displayRoomId.innerText = roomId;

    const qrContainer = document.getElementById("qrcode-container");
    qrContainer.innerHTML = "";
    const joinUrl = window.location.href.split("?")[0] + "?room=" + roomId;
    new QRCode(qrContainer, {
      text: joinUrl,
      width: 150,
      height: 150,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.L,
    });
    if (connectionStatus)
      connectionStatus.innerText = "Waiting for a peer to join...";
  });
}

// --- NEARBY DEVICES INTEGRATION ---
window.joinNearbyRoom = async function (targetRoomId) {
  if (!targetRoomId || !peer) return;
  targetRoomId = targetRoomId.toUpperCase();

  // We are SENDER, so derive SENDER key (target room id)
  await deriveKey(targetRoomId);

  displayRoomId.innerText = targetRoomId;

  // Pass metadata so the receiver knows this is a nearby connection and requires a prompt
  const localConn = peer.connect(targetRoomId, {
    metadata: { method: "nearby" },
  });
  dataConnection = localConn;

  let hasAccepted = false;

  // Fallback timeout in case receiver doesn't answer or declines
  const connTimeout = setTimeout(() => {
    if (!hasAccepted && localConn) {
      if (typeof window.resetNearbyCards === "function")
        window.resetNearbyCards();
      if (dataConnection === localConn) {
        showToast("Connection declined or timed out", "error");
        dataConnection = null;
      }
      localConn.close();
    }
  }, 15000); // 15 seconds to accept

  localConn.on("open", () => {
    showToast("Waiting for receiver to accept...", "info");

    const acceptListener = (data) => {
      if (data && data.command === "CONNECTION_ACCEPTED") {
        hasAccepted = true;
        clearTimeout(connTimeout);
        if (typeof window.resetNearbyCards === "function")
          window.resetNearbyCards();
        // We'll call setupDataConnection which adds its own listeners to global dataConnection.
        showScreen(roomScreen);
        setupDataConnection();

        // Stop broadcasting our presence since we're busy
        if (typeof window.broadcastNearbyPresence === "function") {
          window.broadcastNearbyPresence(window.currentRoomId, false);
        }
      }
    };

    localConn.on("data", acceptListener);
  });

  localConn.on("close", () => {
    if (!hasAccepted) {
      if (typeof window.resetNearbyCards === "function")
        window.resetNearbyCards();
      if (dataConnection === localConn) {
        showToast("Connection declined", "error");
        dataConnection = null;
      }
    }
  });
};

if (joinRoomBtn) {
  joinRoomBtn.addEventListener("click", async () => {
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
      peer.on("open", () => {
        joinRoomBtn.disabled = false;
        joinRoomBtn.innerHTML = "Join Room";
        displayRoomId.innerText = roomId;
        qrCodeContainer.innerHTML = "";

        const joinModal = document.getElementById("join-room-modal");
        if (joinModal) {
          joinModal.classList.remove("show");
          setTimeout(() => joinModal.classList.add("hidden"), 300);
        }

        connectionStatus.innerText = "Connecting to peer...";
        document.getElementById("header-status-dot").style.backgroundColor =
          "var(--info)";

        dataConnection = peer.connect(roomId);
        setupDataConnection();
      });
      peer.on("disconnected", () => {
        if (isExiting) return;
        setTimeout(() => {
          if (!peer.destroyed) {
            try {
              peer.reconnect();
            } catch (e) {}
          }
        }, 1000);
      });
      peer.on("error", (err) => {
        if (
          err.type === "network" ||
          err.type === "server-error" ||
          err.message.includes("Lost connection")
        )
          return;

        if (joinRoomBtn) {
          joinRoomBtn.disabled = false;
          joinRoomBtn.innerHTML = "Join Room";
        }
        if (err.type === "peer-unavailable") {
          showScreen(homeScreen);
          showToast("Invalid Passcode or Room expired.", "error");
          const joinModal = document.getElementById("join-room-modal");
          if (joinModal) {
            joinModal.classList.remove("hidden");
            setTimeout(() => joinModal.classList.add("show"), 10);
          }
        } else {
          showToast("Connection Error: " + err.message, "error");
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
let pendingChunks = 0;
let isReceiverPaused = false;
let streamRowAdded = false; // Guard: prevents dual addReceivedFileRow calls per file

function setupDataConnection() {
  const onConnectionOpen = () => {
    showScreen(roomScreen);
    connectionStatus.innerText = "Connected! Ready to transfer.";
    document
      .getElementById("header-status-dot")
      .classList.add("status-connected");
    const roomTransferPane = document.getElementById("room-transfer-pane");
    if (roomTransferPane) roomTransferPane.classList.remove("hidden");

    fileSelectionContainer.classList.remove("hidden");
    if (qrWrapper) qrWrapper.classList.add("hidden");

    const sendTextBtn = document.getElementById("sendTextBtn");
    if (sendTextBtn) sendTextBtn.disabled = false;

    downloadLinksContainer.innerHTML = "";
    sentFilesContainer.innerHTML = "";
    downloadListHeader.classList.add("hidden");

    if (html5QrCode) {
      html5QrCode.stop().catch((e) => {});
      qrModal.classList.remove("show");
      setTimeout(() => qrModal.classList.add("hidden"), 300);
    }
  };

  if (dataConnection.open) {
    onConnectionOpen();
  } else {
    dataConnection.on("open", onConnectionOpen);
  }

  let dataProcessingQueue = Promise.resolve();

  dataConnection.on("data", (data) => {
    // Any data from peer = proof of life for heartbeat watchdog
    window._hbLastPingTime = Date.now();

    let isFileChunk = false;
    if (data && typeof data === "object" && !data.command) {
      if (
        data instanceof Blob ||
        data instanceof ArrayBuffer ||
        data instanceof Uint8Array
      ) {
        isFileChunk = true;
      }
    }

    if (isFileChunk) {
      pendingChunks++;
      if (pendingChunks > 10 && !isReceiverPaused) {
        isReceiverPaused = true;
        if (dataConnection && dataConnection.open) {
          dataConnection.send({ command: "BACKPRESSURE_PAUSE" });
        }
      }
    }

    dataProcessingQueue = dataProcessingQueue
      .then(async () => {
        let parsed = null;

        if (typeof data === "string") {
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            console.warn("Could not parse string data", e);
          }
        } else if (data && typeof data === "object" && data.command) {
          parsed = data; // Already an object (PeerJS json serialization quirk)
        } else if (
          data instanceof ArrayBuffer ||
          data instanceof Uint8Array ||
          data instanceof Blob
        ) {
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
          } catch (e) {
            // Not a JSON string, ignore error and treat as chunk
          }
        }

        if (parsed && parsed.command) {
          if (parsed.command === "FILE_DONE") {
            const currentMeta = { ...fileMeta }; // Snapshot it to prevent overwrite

            // 1. Finalize the file based on mode
            if (fileStream) {
              try {
                await fileStream.close();
              } catch (e) {}
              fileStream = null;

              if (!streamRowAdded) {
                streamRowAdded = true;
                receiveProgressContainer.classList.add("state-success");
                receiveStatus.innerText = `Saved: ${sanitizeHTML(
                  currentMeta.name
                )}`;
                addReceivedFileRow(currentMeta.name, null, true);

                const isLastFile =
                  currentMeta.fileIndex + 1 === currentMeta.totalFiles;
                if (isLastFile) {
                  if (receiverPauseBtn)
                    receiverPauseBtn.classList.add("hidden");
                  if (receiverCancelBtn)
                    receiverCancelBtn.classList.add("hidden");
                  if (receiverSkipBtn) receiverSkipBtn.classList.add("hidden");
                  triggerFeedback("success");
                  receiveProgressFill.classList.remove("progress-pulse");
                  releaseWakeLock();
                }
              }
            } else if (currentMeta && currentMeta.isZipStream) {
              finalizeReceive(); // RAM Fallback mode handling
            }

            // 2. Fill Accordion Details (Speed, Time, Size) for both modes
            _fillAccordionIfEmpty(currentMeta);

            // 3. AIV: ZIP Hash Verification Check (Works for both Stream and RAM modes)
            if (currentMeta.isZipStream) {
              setTimeout(() => {
                const allRows = document.querySelectorAll(".download-file-row");
                let targetRow = null;
                for (let i = allRows.length - 1; i >= 0; i--) {
                  if (allRows[i].dataset.fileName === currentMeta.name) {
                    targetRow = allRows[i];
                    break;
                  }
                }

                if (targetRow) {
                  // AIV: Compare Tail-End Hash
                  let isVerified = false;

                  // Secure Mode auto-verifies via AES-GCM Auth Tag
                  if (!currentMeta.isFastMode) {
                    isVerified = !window.receiverSecureFailed;
                  } else {
                    // Fast Mode checks the manually calculated Last Chunk Hash
                    isVerified =
                      parsed.hash &&
                      parsed.hash === window.receiverLastZipChunkHash;
                  }

                  const badgeColor = isVerified
                    ? "rgba(16, 185, 129, 0.1)"
                    : "rgba(239, 68, 68, 0.1)";
                  const badgeTextColor = isVerified
                    ? "var(--success, #10b981)"
                    : "var(--error, #ef4444)";
                  const badgeIcon = isVerified ? "gpp_good" : "gpp_bad";
                  const badgeLabel = isVerified
                    ? "Verified (AIV)"
                    : "Corrupted";

                  const actDiv = targetRow.querySelector(
                    ".download-file-row-actions"
                  );
                  if (actDiv) {
                    // Remove any old verification badges just in case
                    actDiv
                      .querySelectorAll(".verification-badge")
                      .forEach((el) => el.remove());

                    // Prepend the new AIV Verified Badge before the "Streamed" badge
                    const vBadge = document.createElement("span");
                    vBadge.className = "sent-file-chip verification-badge";
                    vBadge.innerHTML = `<span class="material-symbols-rounded" style="font-size:15px;">${badgeIcon}</span>`;
                    vBadge.style.cssText = `background:${badgeColor}; color:${badgeTextColor}; border:none; width:36px; height:36px; border-radius:50%; padding:0; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; margin-right:4px;`;
                    vBadge.dataset.tooltip = badgeLabel;
                    actDiv.insertBefore(vBadge, actDiv.firstChild);
                  }

                  // If Corrupted, expand row and show warning
                  if (!isVerified) {
                    targetRow.classList.add("is-corrupted", "expanded");
                    if (!targetRow.querySelector(".corrupted-warning-bar")) {
                      const warningBar = document.createElement("div");
                      warningBar.className = "corrupted-warning-bar";
                      warningBar.innerHTML =
                        '<span class="material-symbols-rounded" style="font-size:14px;">info</span> ZIP Bundle may be damaged. Ask sender to re-send.';
                      targetRow.appendChild(warningBar);
                    }
                  }
                }
              }, 100);
            }

            // Hide the progress bar after 3 seconds
            setTimeout(() => {
              receiveProgressContainer.classList.add("hidden");
              receiveProgressContainer.classList.remove("state-success");
            }, 3000);

            return;
          }
          if (parsed.command === "TEXT_MESSAGE") {
            const txtContainer = document.getElementById(
              "received-text-container"
            );
            const txtContent = document.getElementById("received-text-content");
            if (txtContainer && txtContent) {
              txtContainer.classList.remove("hidden");
              txtContent.innerText = parsed.text;
            }
            return;
          }

          // === HEARTBEAT HANDLERS ===
          if (parsed.command === "PING") {
            // Record that peer is alive and send PONG back
            window._hbLastPingTime = Date.now();
            try {
              dataConnection.send({ command: "PONG", ts: parsed.ts });
            } catch (e) {}
            return;
          }

          if (parsed.command === "PONG") {
            window._hbLastPongTime = Date.now();
            return;
          }

          if (parsed.command === "PEER_LEAVING") {
            // Other peer is intentionally leaving (graceful exit)
            if (isExiting) return;
            isExiting = true;
            if (typeof window._stopHeartbeat === "function")
              window._stopHeartbeat();
            clearAllFiles();
            showAlert("Peer Left", "The other user has left the room.", () => {
              if (
                typeof window.broadcastNearbyPresence === "function" &&
                window.currentRoomId
              ) {
                window.broadcastNearbyPresence(window.currentRoomId, false);
              }
              if (dataConnection) dataConnection.close();
              if (peer) peer.destroy();
              window.location.href = window.location.href.split("?")[0];
            });
            return;
          }

          if (parsed.command === "CANCEL_TRANSFER") {
            isTransferCancelled = true;

            // If we were receiving
            if (fileMeta) {
              receiveStatus.innerText = "Transfer Cancelled!";
              receiveProgressContainer.classList.add("state-error");
              if (receiverPauseBtn) receiverPauseBtn.classList.add("hidden");
              if (receiverCancelBtn) receiverCancelBtn.classList.add("hidden");
              if (receiverSkipBtn) receiverSkipBtn.classList.add("hidden");
              receiveBuffer = [];
              if (fileStream) {
                try {
                  fileStream.abort();
                } catch (e) {}
                fileStream = null;
              }
              setTimeout(() => {
                receiveProgressContainer.classList.add("hidden");
                receiveProgressContainer.classList.remove("state-error");
              }, 4000);
            }

            // If we were sending
            if (isTransferring) {
              sendStatus.innerText = "Transfer Cancelled by Receiver!";
              sendProgressContainer.classList.add("state-error");
              cancelTransferBtn.classList.add("hidden");
              pauseTransferBtn.classList.add("hidden");
              setTimeout(() => {
                sendProgressContainer.classList.add("hidden");
                sendProgressContainer.classList.remove("state-error");
                sendFileBtn.disabled = true;
                document.getElementById("file-selection-form").reset();
                fileDetails.innerText = "";
                selectedFiles = [];
                window.isZippingFolder = false;
                window.folderTransferMeta = null;
                isTransferring = false;
                // BUG 1 FIX: Re-enable toggle when sender receives cancel from receiver
                if (transferModeToggle) transferModeToggle.disabled = false;
              }, 3000);
            }
            return;
          }

          if (parsed.command === "SKIP_CURRENT_FILE") {
            if (isTransferring) {
              // Sender is notified that Receiver skipped
              isCurrentFileSkipped = true;
              sendStatus.innerText = "File Skipped by Receiver!";
              sendProgressContainer.classList.add("state-error");
            } else {
              // Receiver is notified that Sender skipped
              receiveStatus.innerText = "File Skipped by Sender!";
              receiveProgressContainer.classList.add("state-error");
              receiveBuffer = [];
              if (fileStream) {
                try {
                  fileStream.abort();
                } catch (e) {}
                fileStream = null;
              }
              fileMeta = null; // Drop subsequent chunks for this file
            }
            return;
          }

          if (parsed.command === "PAUSE_TRANSFER") {
            receiveStatus.innerText = "Transfer Paused by Sender";
            receiveProgressContainer.classList.add("state-error");
            if (receiveProgressFill)
              receiveProgressFill.classList.remove("progress-pulse");
            isReceiverPaused = true;
            if (typeof receiverPauseBtn !== "undefined" && receiverPauseBtn) {
              receiverPauseBtn.innerHTML =
                '<span class="material-symbols-rounded">play_arrow</span> Resume';
            }
            return;
          }

          if (parsed.command === "RESUME_TRANSFER") {
            receiveStatus.innerText = `Receiving: ${sanitizeHTML(
              fileMeta.name
            )} (${fileMeta.fileIndex + 1}/${fileMeta.totalFiles})`;
            receiveProgressContainer.classList.remove("state-error");
            if (receiveProgressFill)
              receiveProgressFill.classList.add("progress-pulse");
            isReceiverPaused = false;
            if (typeof receiverPauseBtn !== "undefined" && receiverPauseBtn) {
              receiverPauseBtn.innerHTML =
                '<span class="material-symbols-rounded">pause</span> Pause';
            }
            return;
          }

          if (parsed.command === "RECEIVER_PAUSE") {
            isPaused = true;
            sendStatus.innerText = "Paused by Receiver";
            sendProgressContainer.classList.add("state-error");
            if (sendProgressFill)
              sendProgressFill.classList.remove("progress-pulse");
            if (pauseTransferBtn) {
              pauseTransferBtn.innerHTML =
                '<span class="material-symbols-rounded">play_arrow</span> Resume';
            }
            return;
          }

          if (parsed.command === "RECEIVER_RESUME") {
            isPaused = false;
            sendStatus.innerText = "Transfer Resumed...";
            sendProgressContainer.classList.remove("state-error");
            if (sendProgressFill)
              sendProgressFill.classList.add("progress-pulse");
            if (pauseTransferBtn) {
              pauseTransferBtn.innerHTML =
                '<span class="material-symbols-rounded">pause</span> Pause';
            }

            // BUG FIX 1: Restart the sender's reading loop which had halted on pause.
            // The loop exits via `return` when paused — we must re-kick it.
            if (typeof window._resumeCheckPauseAndRead === "function") {
              window._resumeCheckPauseAndRead();
            }

            // Revert to Sending after 2s
            setTimeout(() => {
              if (
                !isPaused &&
                !isTransferCancelled &&
                isTransferring &&
                selectedFiles &&
                selectedFiles.length > 0
              ) {
                const currentFile = selectedFiles[currentFileIndex];
                if (currentFile) {
                  sendStatus.innerText = `Sending: ${sanitizeHTML(
                    currentFile.name
                  )} (${currentFileIndex + 1}/${selectedFiles.length})`;
                }
              }
            }, 2000);

            return;
          }

          if (parsed.command === "FILE_HASH") {
            if (fileMeta) {
              const safeShortName =
                fileMeta.name.length > 20
                  ? sanitizeHTML(fileMeta.name.substring(0, 17)) + "..."
                  : sanitizeHTML(fileMeta.name);
              const statusText = `Saved: ${safeShortName}`;

              // AIV: Determine verification status intelligently
              let isVerified = true;
              let computedHash = "AIV_SECURE_VERIFIED";

              if (fileMeta.isFastMode) {
                // AIV Fast Mode: 3-Point Match Check
                computedHash = window.receiverFastHashes.join("_");
                isVerified = computedHash === parsed.hash;
              } else {
                // AIV Secure Mode: AES-GCM Auth Tag Check
                isVerified = !window.receiverSecureFailed;

                // CRITICAL FIX: Sahi UI text dikhaye based on environment (HTTPS vs HTTP)
                if (sharedCryptoKey) {
                  computedHash = isVerified
                    ? "AES-GCM Auth-Tag Match"
                    : "Auth-Tag Failed";
                  parsed.hash = "AES-GCM In-built Hash";
                } else {
                  computedHash = "Plaintext (HTTP Fallback)";
                  parsed.hash = "No Encryption";
                }
              }

              // Update receive-status bar
              const badgeColor = isVerified
                ? "rgba(16, 185, 129, 0.1)"
                : "rgba(239, 68, 68, 0.1)";
              const badgeTextColor = isVerified
                ? "var(--success, #10b981)"
                : "var(--error, #ef4444)";
              const badgeIcon = isVerified ? "gpp_good" : "gpp_bad";
              const badgeLabel = isVerified ? "Verified" : "Corrupted";

              receiveStatus.innerHTML = `${statusText} <span class="badge" style="background:${badgeColor}; color:${badgeTextColor}; padding: 3px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; margin-left: 8px;"><span class="material-symbols-rounded" style="font-size: 16px; display: flex; align-items: center;">${badgeIcon}</span> ${badgeLabel}</span>`;

              // ── Timing & size stats ──────────────────────────────────────
              let totalTimeSec = (Date.now() - receiveStartTime) / 1000;
              if (totalTimeSec <= 0) totalTimeSec = 0.1;
              const avgSpeedMBps = (
                fileMeta.size /
                (1024 * 1024) /
                totalTimeSec
              ).toFixed(2);
              const timeString =
                totalTimeSec < 60
                  ? totalTimeSec.toFixed(1) + "s"
                  : Math.floor(totalTimeSec / 60) +
                    "m " +
                    Math.floor(totalTimeSec % 60) +
                    "s";

              // File size: show in MB or GB
              const fileSizeStr =
                fileMeta.size >= 1024 * 1024 * 1024
                  ? (fileMeta.size / (1024 * 1024 * 1024)).toFixed(2) + " GB"
                  : (fileMeta.size / (1024 * 1024)).toFixed(2) + " MB";

              // Timestamp at completion
              const now = new Date();
              const timestamp = now.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              });

              // ── Find the matching row (last match with this filename) ─────
              const allRows = document.querySelectorAll(".download-file-row");
              let targetRow = null;
              for (let i = allRows.length - 1; i >= 0; i--) {
                if (allRows[i].dataset.fileName === fileMeta.name) {
                  targetRow = allRows[i];
                  break;
                }
              }

              if (targetRow) {
                // 1. Add verification badge — dedup: remove only previous verification badges,
                //    NOT the "Streamed" badge which should stay alongside it.
                const actionsDiv = targetRow.querySelector(
                  ".download-file-row-actions"
                );
                if (actionsDiv) {
                  // Only remove badges we previously inserted as verification badges
                  actionsDiv
                    .querySelectorAll(".verification-badge")
                    .forEach((el) => el.remove());

                  const badge = document.createElement("span");
                  badge.className = "sent-file-chip verification-badge"; // Mark as verification badge
                  badge.innerHTML = `<span class="material-symbols-rounded" style="font-size:16px;">${badgeIcon}</span>`;
                  badge.style.cssText = `background:${badgeColor}; color:${badgeTextColor}; border:none; width:36px; height:36px; border-radius:50%; padding:0; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;`;
                  badge.dataset.tooltip = badgeLabel;
                  actionsDiv.insertBefore(badge, actionsDiv.firstChild);
                }

                // 2. Populate the details panel
                const detailsInner = targetRow.querySelector(
                  ".download-file-row-details-inner"
                );
                if (detailsInner) {
                  let detailsHTML = "";

                  // Hash / Mode row(s)
                  if (fileMeta.isFastMode) {
                    detailsHTML += `
                      <div class="detail-row">
                        <span class="detail-label">Mode</span>
                        <span class="detail-value">Fast Mode (DTLS-secured)</span>
                      </div>`;
                  } else {
                    detailsHTML += `
                    <div class="detail-row">
                      <span class="detail-label">Sender Hash</span>
                      <span class="detail-value monospace" data-tooltip="${
                        parsed.hash
                      }">${parsed.hash || "—"}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Receiver Hash</span>
                      <span class="detail-value monospace" data-tooltip="${computedHash}">${
                      computedHash || "—"
                    }</span>
                    </div>`;
                  }

                  // File size + Timestamp in one row
                  detailsHTML += `
                    <div class="detail-row">
                      <span class="detail-label">File Size</span>
                      <span class="detail-value">${fileSizeStr}</span>
                      <span class="detail-label" style="margin-left:12px;">Completed</span>
                      <span class="detail-value">${timestamp}</span>
                    </div>`;

                  // Avg Speed + Transfer Time side-by-side in one row
                  detailsHTML += `
                    <div class="detail-row">
                      <span class="detail-label">Avg Speed</span>
                      <span class="detail-value">${avgSpeedMBps} MB/s</span>
                      <span class="detail-label" style="margin-left:12px;">Duration</span>
                      <span class="detail-value">${timeString}</span>
                    </div>`;

                  detailsInner.innerHTML = detailsHTML;
                }

                // 3. Corrupted: mark row, add warning bar, auto-expand
                if (!isVerified) {
                  targetRow.classList.add("is-corrupted", "expanded");
                  // Only add warning bar once
                  if (!targetRow.querySelector(".corrupted-warning-bar")) {
                    const warningBar = document.createElement("div");
                    warningBar.className = "corrupted-warning-bar";
                    warningBar.innerHTML =
                      '<span class="material-symbols-rounded" style="font-size:14px;">info</span> File may be damaged. Ask the sender to re-send.';
                    targetRow.appendChild(warningBar);
                  }
                }
              }
            }
            return;
          }

          if (parsed.command === "BACKPRESSURE_PAUSE") {
            isBackpressurePaused = true;
            if (sendProgressFill) {
              sendProgressFill.style.background = "var(--warning, #f59e0b)";
            }
            return;
          }

          if (parsed.command === "BACKPRESSURE_RESUME") {
            isBackpressurePaused = false;
            if (sendProgressFill) {
              sendProgressFill.style.background = ""; // Revert to primary
            }
            // Re-kick the sending loop if it was halted waiting for backpressure
            if (typeof window._resumeCheckPauseAndRead === "function") {
              const fn = window._resumeCheckPauseAndRead;
              window._resumeCheckPauseAndRead = null;
              fn();
            }
            return;
          }

          if (parsed.command === "TRANSFER_ERROR") {
            triggerFeedback("error");
            if (sendProgressFill)
              sendProgressFill.classList.remove("progress-pulse");
            if (receiveProgressFill)
              receiveProgressFill.classList.remove("progress-pulse");
            isTransferCancelled = true;
            if (sendProgressContainer)
              sendProgressContainer.classList.add("state-error");
            const sendStatus = document.getElementById("send-status");

            if (parsed.reason === "DISK_FULL") {
              if (sendStatus)
                sendStatus.innerText =
                  "Transfer Failed: Receiver's disk is full";
              if (typeof showGlobalAlert === "function") {
                showGlobalAlert(
                  "Transfer Failed",
                  "The receiver's device ran out of storage space or aborted the save."
                );
              }
            } else if (parsed.reason === "SIZE_LIMIT_EXCEEDED") {
              if (sendStatus)
                sendStatus.innerText = "Transfer Failed: File too large";
              if (typeof showGlobalAlert === "function") {
                showGlobalAlert(
                  "Transfer Failed",
                  "The receiver's device cannot handle files this large in their current browser mode (e.g., Incognito)."
                );
              }
            } else {
              if (sendStatus)
                sendStatus.innerText =
                  "Transfer Failed: " + (parsed.reason || "Unknown Error");
              showToast(
                "Transfer failed: " + (parsed.reason || "Unknown Error"),
                "error"
              );
            }

            // Task 3: Release WakeLock on error
            releaseWakeLock();

            setTimeout(() => {
              if (sendProgressContainer) {
                sendProgressContainer.classList.add("hidden");
                sendProgressContainer.classList.remove("state-error");
              }
              if (cancelTransferBtn) cancelTransferBtn.classList.add("hidden");
              if (pauseTransferBtn) pauseTransferBtn.classList.add("hidden");

              const form = document.getElementById("file-selection-form");
              if (form) form.reset();
              if (fileDetails) fileDetails.innerText = "";
              selectedFiles = [];
              window.isZippingFolder = false;
              window.folderTransferMeta = null;
              isTransferring = false;
              if (transferModeToggle) transferModeToggle.disabled = false;
            }, 5000);
            return;
          }

          if (parsed.command === "CANCEL_TRANSFER") {
            triggerFeedback("error");
            if (sendProgressFill)
              sendProgressFill.classList.remove("progress-pulse");
            if (receiveProgressFill)
              receiveProgressFill.classList.remove("progress-pulse");
            isTransferCancelled = true;
            if (sendProgressContainer)
              sendProgressContainer.classList.add("state-error");
            const sendStatus = document.getElementById("send-status");
            if (sendStatus) sendStatus.innerText = "Transfer Cancelled";
            showToast("Transfer cancelled by receiver.", "error");

            // Task 3: Release WakeLock on cancel
            releaseWakeLock();

            setTimeout(() => {
              if (sendProgressContainer) {
                sendProgressContainer.classList.add("hidden");
                sendProgressContainer.classList.remove("state-error");
              }
              if (cancelTransferBtn) cancelTransferBtn.classList.add("hidden");
              if (pauseTransferBtn) pauseTransferBtn.classList.add("hidden");

              const form = document.getElementById("file-selection-form");
              if (form) form.reset();
              if (fileDetails) fileDetails.innerText = "";
              selectedFiles = [];
              window.isZippingFolder = false;
              window.folderTransferMeta = null;
              isTransferring = false;
            }, 3000);

            return;
          }

          if (parsed.command === "ACCEPT_FILE") {
            if (parsed.supportsEncryption === false) {
              sharedCryptoKey = null; // Downgrade to plaintext if receiver is insecure
              console.warn(
                "Receiver lacks WebCrypto. Downgrading to plaintext transfer."
              );
            } else {
            }
            isWaitingForAccept = false;
            // Re-kick the sender loop that was waiting for accept signal
            if (typeof window._resumeCheckPauseAndRead === "function") {
              const fn = window._resumeCheckPauseAndRead;
              window._resumeCheckPauseAndRead = null;
              fn();
            }
            if (selectedFiles && selectedFiles.length > 0) {
              const currentFile = selectedFiles[currentFileIndex];
              if (currentFile) {
                sendStatus.innerText = `Sending: ${sanitizeHTML(
                  currentFile.name
                )} (${currentFileIndex + 1}/${selectedFiles.length})`;
              }
            }
            return;
          }

          if (parsed.command === "FILE_METADATA") {
            // Task 6: Filename XSS / Path Traversal Injection Fix
            parsed.name = parsed.name.replace(/[^a-zA-Z0-9.\-_ ]/g, "");
            if (!parsed.name || parsed.name.trim() === "")
              parsed.name = "unnamed_file";

            fileMeta = parsed;

            // Task 2: RAM Crash in Incognito Mode Fix
            const useStreamSaver =
              navigator.serviceWorker &&
              window.TransformStream &&
              window.WritableStream &&
              window.ReadableStream;
            if (!useStreamSaver && fileMeta.size > 1024 * 1024 * 1024) {
              // 1GB hard limit
              console.warn(
                "Transfer rejected: File too large for RAM-fallback mode."
              );
              dataConnection.send({
                command: "TRANSFER_ERROR",
                reason: "SIZE_LIMIT_EXCEEDED",
              });
              if (typeof showGlobalAlert === "function") {
                showGlobalAlert(
                  "Transfer Rejected",
                  "The sender tried to send a file larger than 1GB, which is not supported in Incognito mode due to RAM limits."
                );
              }
              return;
            }

            // Task 3: Sleep Mode Drop (Wakelock API)
            requestWakeLock();

            receiveBuffer = [];
            receivedSize = 0;
            isTransferCancelled = false;
            isReceiverPaused = false;
            pendingChunks = 0;
            streamRowAdded = false; // BUG FIX: reset per-file guard for duplicate row prevention

            // AIV Initialization
            window.receiverFastHashes = ["", "", ""];
            window.receiverSecureFailed = false;
            window.receiverLastZipChunkHash = null;

            if (receiverPauseBtn) {
              receiverPauseBtn.classList.remove("hidden");
              receiverPauseBtn.innerHTML =
                '<span class="material-symbols-rounded">pause</span> Pause';
            }
            if (receiverCancelBtn) receiverCancelBtn.classList.remove("hidden");
            if (receiverSkipBtn) receiverSkipBtn.classList.remove("hidden");

            receiveStartTime = 0;
            lastReceiveTime = 0;
            lastReceiveBytes = 0;
            if (receiveChart) {
              receiveChart.data.labels = ["0s"];
              receiveChart.data.datasets[0].data = [0];
              receiveChart.update("none");
            }

            receiveProgressContainer.classList.remove(
              "hidden",
              "state-error",
              "state-success"
            );
            receiveProgressFill.classList.add("progress-pulse");
            const safeShortName =
              fileMeta.name.length > 20
                ? sanitizeHTML(fileMeta.name.substring(0, 17)) + "..."
                : sanitizeHTML(fileMeta.name);
            if (
              fileMeta.isZipStream ||
              (fileMeta.type === "application/zip" &&
                fileMeta.name.endsWith(".zip"))
            ) {
              receiveStatus.innerText = `Receiving Folder Zip: ${safeShortName}`;
            } else {
              receiveStatus.innerText = `Receiving: ${safeShortName} (${
                fileMeta.fileIndex + 1
              }/${fileMeta.totalFiles})`;
            }

            receiveProgressFill.style.width = "0%";
            receiveProgressText.innerText = "0%";
            fileStream = null;

            // --- STREAM SAVER LOGIC ---
            // If SW is active and TransformStream is supported, use limitless streaming
            if (
              navigator.serviceWorker &&
              navigator.serviceWorker.controller &&
              window.TransformStream
            ) {
              try {
                const ts = new TransformStream();
                fileStream = ts.writable.getWriter();
                const uniqueId = Math.random().toString(36).substring(2);
                const downloadUrl = `./stream-download/${uniqueId}/${encodeURIComponent(
                  fileMeta.name
                )}`;

                // BUG FIX: Await SW READY inside the Promise chain so ACCEPT_FILE
                // is sent before we return. This prevents the next FILE_METADATA from
                // being processed before ACCEPT_FILE is sent (which caused small files
                // to be dropped because sender would move to next file too fast).
                // Wait for SW READY with a 3-second deadlock-prevention timeout
                await Promise.race([
                  new Promise((resolve) => {
                    const channel = new MessageChannel();
                    channel.port1.onmessage = (e) => {
                      if (e.data.status === "READY") {
                        const iframe = document.createElement("iframe");
                        iframe.hidden = true;
                        iframe.src = downloadUrl;
                        document.body.appendChild(iframe);
                        resolve();
                      }
                    };
                    navigator.serviceWorker.controller.postMessage(
                      {
                        type: "STREAM_DOWNLOAD",
                        id: uniqueId,
                        stream: ts.readable,
                      },
                      [ts.readable, channel.port2]
                    );
                  }),
                  new Promise((resolve) =>
                    setTimeout(() => {
                      console.warn(
                        "StreamSaver SW timeout, proceeding anyway..."
                      );
                      resolve();
                    }, 3000)
                  ),
                ]);

                // Now ACCEPT_FILE is sent synchronously inside the queue chain
                if (dataConnection && dataConnection.open) {
                  dataConnection.send({
                    command: "ACCEPT_FILE",
                    supportsEncryption: sharedCryptoKey !== null,
                  });
                }
                return;
              } catch (e) {
                console.warn(
                  "StreamSaver setup failed, falling back to RAM",
                  e
                );
                fileStream = null;
              }
            } else if (
              window.location.protocol !== "https:" &&
              window.location.hostname !== "localhost"
            ) {
              console.warn("No HTTPS detected. Falling back to RAM limit.");
            }

            // Automatically accept the file (RAM Fallback)
            if (dataConnection && dataConnection.open) {
              dataConnection.send({
                command: "ACCEPT_FILE",
                supportsEncryption: sharedCryptoKey !== null,
              });
            }
            return;
          }
        } else {
          // Must be a file chunk
          if (isTransferCancelled) {
            if (isFileChunk) pendingChunks--;
            return;
          }

          if (!fileMeta) {
            // Drop in-transit chunks for skipped files gracefully
            if (isFileChunk) pendingChunks--;
            return;
          }

          let bufferToDecrypt = data;
          if (data instanceof Blob) {
            bufferToDecrypt = await data.arrayBuffer();
          }

          let decryptedBuffer = bufferToDecrypt;
          if (!fileMeta.isFastMode) {
            try {
              // Try to decrypt. If AES-GCM fails, it will THROW an error.
              decryptedBuffer = await decryptChunk(bufferToDecrypt);
            } catch (err) {
              console.warn(
                "AES-GCM Auth Tag validation failed. File corrupted."
              );
              decryptedBuffer = null; // Force the fallback block to trigger
            }

            if (!decryptedBuffer) {
              window.receiverSecureFailed = true; // AIV: Mark secure mode as corrupted

              if (isFileChunk) {
                pendingChunks--;
                if (pendingChunks < 3 && isReceiverPaused) {
                  isReceiverPaused = false;
                  if (dataConnection && dataConnection.open)
                    dataConnection.send({ command: "BACKPRESSURE_RESUME" });
                }
              }
              // CRITICAL FIX: Do not return. Fallback to raw buffer to keep UI and StreamSaver progressing.
              decryptedBuffer = bufferToDecrypt;
            }
          }

          // AIV: Smart 3-Point Fast Hash & Tail-End ZIP Hash
          if (fileMeta.isFastMode && !fileMeta.isZipStream) {
            const chunkIndex = Math.floor(receivedSize / CHUNK_SIZE);
            const totalChunks = Math.ceil(fileMeta.size / CHUNK_SIZE);
            if (chunkIndex === 0)
              window.receiverFastHashes[0] = await getChunkHash(
                decryptedBuffer
              );
            else if (chunkIndex === Math.floor(totalChunks / 2))
              window.receiverFastHashes[1] = await getChunkHash(
                decryptedBuffer
              );
            else if (chunkIndex === totalChunks - 1)
              window.receiverFastHashes[2] = await getChunkHash(
                decryptedBuffer
              );
          } else if (fileMeta.isZipStream) {
            window.receiverLastZipChunkHash = await getChunkHash(
              decryptedBuffer
            );
          }

          if (fileStream) {
            try {
              await fileStream.write(new Uint8Array(decryptedBuffer));
              receivedSize += decryptedBuffer.byteLength;
              updateReceiveProgress(receivedSize, fileMeta.size);

              if (receivedSize >= fileMeta.size && !fileMeta.isZipStream) {
                // Snapshot meta NOW before any async work or next FILE_METADATA can overwrite it
                const completedMeta = {
                  name: fileMeta.name,
                  fileIndex: fileMeta.fileIndex,
                  totalFiles: fileMeta.totalFiles,
                };

                await fileStream.close();
                fileStream = null;

                if (!streamRowAdded) {
                  streamRowAdded = true;
                  receiveProgressContainer.classList.add("state-success");
                  receiveStatus.innerText = `Saved: ${sanitizeHTML(
                    completedMeta.name
                  )}`;
                  addReceivedFileRow(completedMeta.name, null, true);

                  if (
                    completedMeta.fileIndex + 1 ===
                    completedMeta.totalFiles
                  ) {
                    if (receiverPauseBtn)
                      receiverPauseBtn.classList.add("hidden");
                    if (receiverCancelBtn)
                      receiverCancelBtn.classList.add("hidden");
                    if (receiverSkipBtn)
                      receiverSkipBtn.classList.add("hidden");
                    releaseWakeLock();

                    // BUG 2 FIX: Stream saver mode me sabhi files receive hone par container hide karein
                    setTimeout(() => {
                      receiveProgressContainer.classList.add("hidden");
                      receiveProgressContainer.classList.remove(
                        "state-success"
                      );
                    }, 3000);
                  }
                }
              }
            } catch (e) {
              if (isTransferCancelled) {
                if (isFileChunk) pendingChunks--;
                return;
              }
              console.warn("Stream write rejected. Error:", e);

              try {
                fileStream.abort();
              } catch (err) {}
              fileStream = null;
              isTransferCancelled = true;
              receiveProgressContainer.classList.add("state-error");
              receiveStatus.innerText = "Transfer Failed / Cancelled";

              // Task 1: Check for Disk Full (QuotaExceededError)
              if (
                e &&
                (e.name === "QuotaExceededError" ||
                  (e.message && e.message.toLowerCase().includes("quota")))
              ) {
                if (dataConnection && dataConnection.open) {
                  dataConnection.send({
                    command: "TRANSFER_ERROR",
                    reason: "DISK_FULL",
                  });
                }
                if (typeof showGlobalAlert === "function") {
                  showGlobalAlert(
                    "Download Failed",
                    "Failed to save the file. Your disk might be full."
                  );
                }
              } else {
                if (dataConnection && dataConnection.open) {
                  dataConnection.send({ command: "CANCEL_TRANSFER" });
                }
              }

              // Task 3: Release WakeLock on error
              releaseWakeLock();

              setTimeout(() => {
                receiveProgressContainer.classList.add("hidden");
                receiveProgressContainer.classList.remove("state-error");
                isTransferring = false;
              }, 3000);

              if (isFileChunk) pendingChunks--;
              return;
            } finally {
              if (isFileChunk) pendingChunks--;
              if (pendingChunks < 3 && isReceiverPaused) {
                isReceiverPaused = false;
                if (dataConnection && dataConnection.open) {
                  dataConnection.send({ command: "BACKPRESSURE_RESUME" });
                }
              }
            }
          } else {
            receiveBuffer.push(decryptedBuffer);
            receivedSize += decryptedBuffer.byteLength;
            updateReceiveProgress(receivedSize, fileMeta.size);

            // Guard: only finalize once per file (prevents double-finalize from stale late chunks)
            if (
              receivedSize >= fileMeta.size &&
              !fileMeta.isZipStream &&
              !streamRowAdded
            ) {
              streamRowAdded = true; // Mark as finalized so no second call can slip through
              finalizeReceive();
            }

            if (isFileChunk) pendingChunks--;
            if (pendingChunks < 3 && isReceiverPaused) {
              isReceiverPaused = false;
              if (dataConnection && dataConnection.open) {
                dataConnection.send({ command: "BACKPRESSURE_RESUME" });
              }
            }
          }
        }
      })
      .catch((err) => console.error("Error processing data queue:", err));
  });

  dataConnection.on("close", () => {
    if (isExiting) return;
    isExiting = true;
    clearAllFiles();
    showAlert(
      "Peer Left",
      "The other peer has left the room. Exiting...",
      () => {
        if (dataConnection) dataConnection.close();
        // --- NEARBY DEVICES CLOSE BROADCAST ---
        if (
          typeof window.broadcastNearbyPresence === "function" &&
          window.currentRoomId
        ) {
          window.broadcastNearbyPresence(window.currentRoomId, false);
        }
        if (peer) peer.destroy();
        window.location.href = window.location.href.split("?")[0];
      }
    );
  });

  dataConnection.on("error", (err) => {
    clearAllFiles();
    console.error(err);
    showAlert("Connection Error", err.message, () => {
      if (
        typeof window.broadcastNearbyPresence === "function" &&
        window.currentRoomId
      ) {
        window.broadcastNearbyPresence(window.currentRoomId, false);
      }
      if (peer) peer.destroy();
      window.location.href = window.location.href.split("?")[0];
    });
  });

  // === HEARTBEAT SYSTEM ===
  // Both peers send PING every 3s and respond with PONG.
  // If no PING/PONG received for 8s → peer silently disconnected (tab close, reload, crash).
  window._hbLastPingTime = Date.now();
  window._hbLastPongTime = Date.now();
  let heartbeatMissed = false;

  const HEARTBEAT_INTERVAL = 3000;
  const HEARTBEAT_TIMEOUT = 9000; // 3 missed pings

  const heartbeatInterval = setInterval(() => {
    if (isExiting || !dataConnection || !dataConnection.open) {
      clearInterval(heartbeatInterval);
      return;
    }
    // Send PING
    try {
      dataConnection.send({ command: "PING", ts: Date.now() });
    } catch (e) {}

    // Watchdog: if we haven't heard from peer (PING or PONG) in TIMEOUT ms, peer is gone
    const now = Date.now();

    // Sleep-aware watchdog: prevent false disconnects when the browser throttles timers in background tabs
    if (document.visibilityState === "hidden") {
      window._hbLastPingTime = now;
      return;
    }

    const lastHeard = Math.max(window._hbLastPingTime, window._hbLastPongTime);
    if (now - lastHeard > HEARTBEAT_TIMEOUT && !heartbeatMissed && !isExiting) {
      heartbeatMissed = true;
      clearInterval(heartbeatInterval);
      clearAllFiles();
      showAlert(
        "Peer Disconnected",
        "The other device stopped responding. They may have closed the tab or lost connection.",
        () => {
          if (!isExiting) {
            isExiting = true;
            if (
              typeof window.broadcastNearbyPresence === "function" &&
              window.currentRoomId
            ) {
              window.broadcastNearbyPresence(window.currentRoomId, false);
            }
            if (peer) peer.destroy();
            window.location.href = window.location.href.split("?")[0];
          }
        }
      );
    }
  }, HEARTBEAT_INTERVAL);

  window._stopHeartbeat = () => {
    clearInterval(heartbeatInterval);
    heartbeatMissed = true;
  };
}
function finalizeReceive() {
  // Snapshot fileMeta immediately — next FILE_METADATA may arrive and overwrite it
  const meta = {
    name: fileMeta.name,
    type: fileMeta.type,
    fileIndex: fileMeta.fileIndex,
    totalFiles: fileMeta.totalFiles,
  };

  const blob = new Blob(receiveBuffer, { type: meta.type });
  const blobUrl = URL.createObjectURL(blob);

  // Trigger browser download (RAM mode)
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = meta.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  addReceivedFileRow(meta.name, blobUrl, false);

  if (meta.fileIndex + 1 === meta.totalFiles) {
    receiveStatus.innerText = "All Files Received!";
    receiveProgressContainer.classList.add("state-success");
    if (receiverPauseBtn) receiverPauseBtn.classList.add("hidden");
    if (receiverCancelBtn) receiverCancelBtn.classList.add("hidden");
    if (receiverSkipBtn) receiverSkipBtn.classList.add("hidden");
    triggerFeedback("success");
    receiveProgressFill.classList.remove("progress-pulse");
    releaseWakeLock();

    // BUG 2 FIX: RAM mode me sabhi files receive hone par container hide karein
    setTimeout(() => {
      receiveProgressContainer.classList.add("hidden");
      receiveProgressContainer.classList.remove("state-success");
    }, 3000);
  }
}

/**
 * Fills a received-file accordion row's details panel if it still shows the
 * "Waiting for verification…" placeholder. Safe to call multiple times.
 * Used for streamed files where FILE_HASH may not arrive (e.g. zip bundles,
 * or fast-mode files where FILE_DONE is the completion signal).
 */
function _fillAccordionIfEmpty(meta) {
  if (!meta) return;
  // BUG 1 FIX: isZipStream ko bhi capture karna
  const snapMeta = {
    name: meta.name,
    size: meta.size,
    isFastMode: meta.isFastMode,
    isZipStream: meta.isZipStream,
  };

  setTimeout(() => {
    const allRows = document.querySelectorAll(".download-file-row");
    let targetRow = null;
    for (let i = allRows.length - 1; i >= 0; i--) {
      if (allRows[i].dataset.fileName === snapMeta.name) {
        targetRow = allRows[i];
        break;
      }
    }
    if (!targetRow) return;
    const di = targetRow.querySelector(".download-file-row-details-inner");
    if (!di || !di.innerHTML.includes("Waiting for verification")) return;

    const totalTimeSec = Math.max((Date.now() - receiveStartTime) / 1000, 0.1);
    const avgSpeed = (snapMeta.size / (1024 * 1024) / totalTimeSec).toFixed(2);
    const timeStr =
      totalTimeSec < 60
        ? totalTimeSec.toFixed(1) + "s"
        : Math.floor(totalTimeSec / 60) +
          "m " +
          Math.floor(totalTimeSec % 60) +
          "s";
    const sizeStr =
      snapMeta.size >= 1024 * 1024 * 1024
        ? (snapMeta.size / (1024 * 1024 * 1024)).toFixed(2) + " GB"
        : (snapMeta.size / (1024 * 1024)).toFixed(2) + " MB";
    const ts = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    // BUG 1 FIX: Sahi mode detect karke display karna
    let modeDisplay = "Secure Mode (End-to-End Encrypted)";
    if (snapMeta.isZipStream) {
      modeDisplay = "Bundle (ZIP Stream)";
    } else if (snapMeta.isFastMode) {
      modeDisplay = "Fast Mode (DTLS-secured)";
    }

    di.innerHTML = `
      <div class="detail-row"><span class="detail-label">Mode</span><span class="detail-value">${modeDisplay}</span></div>
      <div class="detail-row">
        <span class="detail-label">File Size</span><span class="detail-value">${sizeStr}</span>
        <span class="detail-label" style="margin-left:12px;">Completed</span><span class="detail-value">${ts}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Avg Speed</span><span class="detail-value">${avgSpeed} MB/s</span>
        <span class="detail-label" style="margin-left:12px;">Duration</span><span class="detail-value">${timeStr}</span>
      </div>`;
  }, 150);
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

  downloadLinksContainer.innerHTML = "";
  sentFilesContainer.innerHTML = "";
  fileInput.value = "";
  selectedFiles = [];
  fileDetails.innerText = "";
  downloadListHeader.classList.add("hidden");
  sentFilesDropdown.classList.add("hidden");
  sendFileBtn.disabled = true;
  sendProgressContainer.classList.add("hidden");
  receiveProgressContainer.classList.add("hidden");
  receiveProgressContainer.classList.remove("state-success", "state-error");
}

// === FILE TRANSFER LOGIC ===
let isTransferring = false;
let isTransferCancelled = false;
let isCurrentFileSkipped = false;
let isPaused = false;
let isBackpressurePaused = false;
let isWaitingForAccept = false;
let fileStream = null;

pauseTransferBtn.addEventListener("click", () => {
  isPaused = !isPaused;
  if (isPaused) {
    pauseTransferBtn.innerHTML =
      '<span class="material-symbols-rounded">play_arrow</span> Resume';
    sendStatus.innerText = "Transfer Paused";
    sendProgressFill.classList.remove("progress-pulse");
    sendProgressContainer.classList.add("state-error");
    if (dataConnection && dataConnection.open) {
      dataConnection.send(JSON.stringify({ command: "PAUSE_TRANSFER" }));
    }
  } else {
    pauseTransferBtn.innerHTML =
      '<span class="material-symbols-rounded">pause</span> Pause';
    sendStatus.innerText = "Transfer Resumed...";
    sendProgressFill.classList.add("progress-pulse");
    sendProgressContainer.classList.remove("state-error");
    if (dataConnection && dataConnection.open) {
      dataConnection.send(JSON.stringify({ command: "RESUME_TRANSFER" }));
    }

    // BUG FIX 1: Restart the sending loop — it halted inside checkPauseAndRead on pause.
    if (typeof window._resumeCheckPauseAndRead === "function") {
      window._resumeCheckPauseAndRead();
    }

    // Revert status label after 2s
    setTimeout(() => {
      if (
        !isPaused &&
        !isTransferCancelled &&
        isTransferring &&
        selectedFiles &&
        selectedFiles.length > 0
      ) {
        const currentFile = selectedFiles[currentFileIndex];
        if (currentFile) {
          sendStatus.innerText = `Sending: ${sanitizeHTML(currentFile.name)} (${
            currentFileIndex + 1
          }/${selectedFiles.length})`;
        }
      }
    }, 2000);
  }
});

function showCancelWarningModal(onConfirm) {
  if (localStorage.getItem("hideCancelWarning") === "true") {
    onConfirm();
    return;
  }

  showGlobalModal({
    title: "Cancel Batch Transfer?",
    message:
      "This will cancel the ENTIRE batch transfer.<br><br>If you only want to cancel the current file, please use the <strong>Skip</strong> button.",
    checkbox: {
      id: "cancel-modal-dont-show",
      label: "Don't show this again",
      checked: false,
    },
    buttons: [
      {
        text: "Keep Transferring",
        role: "bold",
        onClick: () => {},
      },
      {
        text: "Cancel Batch",
        role: "danger",
        onClick: (result) => {
          if (result.checkboxChecked) {
            localStorage.setItem("hideCancelWarning", "true");
          }
          onConfirm();
        },
      },
    ],
  });
}

cancelTransferBtn.addEventListener("click", () => {
  const doCancel = () => {
    isTransferCancelled = true;
    isWaitingForAccept = false;
    isPaused = false;
    isTransferring = false; // Mark as not transferring immediately
    window._resumeCheckPauseAndRead = null; // Clear resume hook
    cancelTransferBtn.classList.add("hidden");
    pauseTransferBtn.classList.add("hidden");

    // BUG FIX 3: Re-enable toggle IMMEDIATELY when cancel happens (not after 3s)
    if (transferModeToggle) transferModeToggle.disabled = false;

    releaseWakeLock();

    if (dataConnection && dataConnection.open) {
      dataConnection.send(JSON.stringify({ command: "CANCEL_TRANSFER" }));
    }

    sendStatus.innerText = "Transfer Cancelled!";
    sendProgressContainer.classList.add("state-error");

    setTimeout(() => {
      sendProgressContainer.classList.add("hidden");
      sendProgressContainer.classList.remove("state-error");
      sendFileBtn.disabled = true;
      document.getElementById("file-selection-form").reset();
      fileDetails.innerText = "";
      selectedFiles = [];
      window.isZippingFolder = false;
      window.folderTransferMeta = null;
    }, 3000);
  };

  if (selectedFiles && selectedFiles.length > 1) {
    showCancelWarningModal(doCancel);
  } else {
    doCancel();
  }
});
if (receiverPauseBtn) {
  receiverPauseBtn.addEventListener("click", () => {
    isReceiverPaused = !isReceiverPaused;
    if (isReceiverPaused) {
      receiverPauseBtn.innerHTML =
        '<span class="material-symbols-rounded">play_arrow</span> Resume';
      receiveStatus.innerText = "Transfer Paused by You";
      receiveProgressFill.classList.remove("progress-pulse");
      receiveProgressContainer.classList.add("state-error");
      if (dataConnection && dataConnection.open) {
        dataConnection.send(JSON.stringify({ command: "RECEIVER_PAUSE" }));
      }
    } else {
      receiverPauseBtn.innerHTML =
        '<span class="material-symbols-rounded">pause</span> Pause';
      if (fileMeta) {
        receiveStatus.innerText = `Receiving: ${sanitizeHTML(fileMeta.name)} (${
          fileMeta.fileIndex + 1
        }/${fileMeta.totalFiles})`;
      } else {
        receiveStatus.innerText = "Transfer Resumed...";
        receiveProgressFill.classList.add("progress-pulse");
      }
      receiveProgressContainer.classList.remove("state-error");
      if (dataConnection && dataConnection.open) {
        dataConnection.send(JSON.stringify({ command: "RECEIVER_RESUME" }));
      }
    }
  });
}

if (receiverCancelBtn) {
  const doReceiverCancel = () => {
    isTransferCancelled = true;
    isWaitingForAccept = false;
    isReceiverPaused = false;
    receiverCancelBtn.classList.add("hidden");
    if (receiverPauseBtn) receiverPauseBtn.classList.add("hidden");
    if (receiverSkipBtn) receiverSkipBtn.classList.add("hidden");

    if (dataConnection && dataConnection.open) {
      dataConnection.send(JSON.stringify({ command: "CANCEL_TRANSFER" }));
    }

    receiveStatus.innerText = "Transfer Cancelled!";
    receiveProgressContainer.classList.add("state-error");
    receiveBuffer = [];
    if (fileStream) {
      try {
        fileStream.abort();
      } catch (e) {}
      fileStream = null;
    }

    setTimeout(() => {
      receiveProgressContainer.classList.add("hidden");
      receiveProgressContainer.classList.remove("state-error");
      isTransferring = false;
      // BUG 1 FIX: Re-enable toggle when receiver cancels
      if (transferModeToggle) transferModeToggle.disabled = false;
    }, 3000);
  };

  receiverCancelBtn.addEventListener("click", () => {
    // Let's assume if fileMeta has totalFiles > 1, it's a batch
    if (fileMeta && fileMeta.totalFiles > 1) {
      showCancelWarningModal(doReceiverCancel);
    } else {
      doReceiverCancel();
    }
  });
}

if (receiverSkipBtn) {
  receiverSkipBtn.addEventListener("click", () => {
    // If it's the last file in the queue, treat skip as cancel (bypass warning)
    if (fileMeta && fileMeta.fileIndex + 1 === fileMeta.totalFiles) {
      if (typeof doReceiverCancel !== "undefined") {
        // To avoid scope issues with doReceiverCancel, just click the cancel button
        // but wait, clicking cancel triggers the modal!
      }
      // Let's implement inline or use a custom event.
      // Better: just run the logic directly.
      isTransferCancelled = true;
      isWaitingForAccept = false;
      isReceiverPaused = false;
      receiverCancelBtn.classList.add("hidden");
      if (receiverPauseBtn) receiverPauseBtn.classList.add("hidden");
      receiverSkipBtn.classList.add("hidden");

      if (dataConnection && dataConnection.open) {
        dataConnection.send(JSON.stringify({ command: "CANCEL_TRANSFER" }));
      }

      receiveStatus.innerText = "Transfer Cancelled!";
      receiveProgressContainer.classList.add("state-error");
      receiveBuffer = [];
      if (fileStream) {
        try {
          fileStream.abort();
        } catch (e) {}
        fileStream = null;
      }

      setTimeout(() => {
        receiveProgressContainer.classList.add("hidden");
        receiveProgressContainer.classList.remove("state-error");
        isTransferring = false;
      }, 3000);
      return;
    }

    isCurrentFileSkipped = true;
    if (dataConnection && dataConnection.open) {
      dataConnection.send(JSON.stringify({ command: "SKIP_CURRENT_FILE" }));
    }
    receiveStatus.innerText = "Skipping file...";
    receiveProgressContainer.classList.add("state-error");
    receiveBuffer = [];
    if (fileStream) {
      try {
        fileStream.abort();
      } catch (e) {}
      fileStream = null;
    }
  });
}

function getFileIcon(type, name) {
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video_file";
  if (type.startsWith("audio/")) return "audio_file";
  if (name.endsWith(".pdf")) return "picture_as_pdf";
  if (name.endsWith(".zip") || name.endsWith(".rar")) return "folder_zip";
  if (name.endsWith(".apk")) return "apk_install";
  return "description";
}

window.removeSelectedFile = function (index) {
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
    if (window.isZippingFolder && window.folderTransferMeta) {
      window.folderTransferMeta.totalSize = selectedFiles.reduce(
        (acc, f) => acc + f.size,
        0
      );
    }
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
    const sizeStr = (f.size / 1024 / 1024).toFixed(2) + " MB";

    html += `
            <div class="ios-file-item">
                <div class="ios-file-icon"><span class="material-symbols-rounded">${icon}</span></div>
                <div class="ios-file-info">
                    <span class="ios-file-name" data-tooltip="${sanitizeHTML(
                      f.name
                    )}">${sanitizeHTML(f.name)}</span>
                    <span class="ios-file-meta">${sizeStr}</span>
                </div>
                <button class="ios-remove-btn" onclick="removeSelectedFile(${i})"><span class="material-symbols-rounded">close</span></button>
            </div>
        `;
  }

  if (selectedFiles.length > maxRender) {
    html += `
            <div class="ios-file-item" style="justify-content: center; background: rgba(10,132,255,0.05); color: var(--accent); cursor: default;">
                <span style="font-size: 0.9rem; font-weight: 500;">+ ${
                  selectedFiles.length - maxRender
                } more files...</span>
            </div>
        `;
  }

  html += "</div>";

  // If it's a folder transfer, show summary at top
  if (window.isZippingFolder) {
    const folderName = window.folderTransferMeta
      ? window.folderTransferMeta.name
      : "Folder";
    const totalSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);
    html =
      `<div style="margin-bottom: 12px; color: var(--text-secondary); font-size: 0.85rem;">
                    Packaging as <strong>${sanitizeHTML(
                      folderName
                    )}</strong> (${(totalSize / 1024 / 1024).toFixed(2)} MB)
                </div>` + html;
  } else {
    const totalSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);
    html =
      `<div style="margin-bottom: 12px; color: var(--text-secondary); font-size: 0.85rem;">
                    <strong>${
                      selectedFiles.length
                    } file(s) selected</strong> (${(
        totalSize /
        1024 /
        1024
      ).toFixed(2)} MB total)
                </div>` + html;
  }

  fileDetails.innerHTML = html;
  sendFileBtn.disabled = false;
}

function handleFolderSelection(filesArray) {
  if (isTransferring) {
    showToast(
      "Cannot select new files while a transfer is in progress.",
      "error"
    );
    console.warn("Cannot select new files while a transfer is in progress.");
    return;
  }
  if (filesArray.length > 0) {
    window.isZippingFolder = true;

    // Append new files instead of overwriting
    selectedFiles = [...selectedFiles, ...Array.from(filesArray)];

    // Preserve original folder name if one already exists, else create it
    if (!window.folderTransferMeta) {
      const firstFile = Array.from(filesArray)[0];
      const firstPath =
        firstFile.customPath || firstFile.webkitRelativePath || "";
      const folderName = firstPath.split("/")[0] || "Shared_Folder";
      window.folderTransferMeta = { name: `${folderName}.zip`, totalSize: 0 };
    }

    // Recalculate total size
    window.folderTransferMeta.totalSize = selectedFiles.reduce(
      (acc, f) => acc + f.size,
      0
    );

    renderFileDetailsUI();
  }
}

function handleFileSelection(filesArray) {
  if (isTransferring) {
    showToast(
      "Cannot select new files while a transfer is in progress.",
      "error"
    );
    console.warn("Cannot select new files while a transfer is in progress.");
    return;
  }
  if (filesArray.length > 0) {
    if (selectedFiles.length + filesArray.length > 5) {
      // Auto-Zip functionality for bulk loose files
      window.isZippingFolder = true;
      selectedFiles = [...selectedFiles, ...Array.from(filesArray)];

      const today = new Date();
      const dateStr =
        today.getFullYear() +
        String(today.getMonth() + 1).padStart(2, "0") +
        String(today.getDate()).padStart(2, "0");

      if (!window.folderTransferMeta) {
        window.folderTransferMeta = {
          name: `DroperX_Bundle_${dateStr}.zip`,
          totalSize: 0,
        };
      }
      window.folderTransferMeta.totalSize = selectedFiles.reduce(
        (acc, f) => acc + f.size,
        0
      );
      renderFileDetailsUI();
    } else {
      // Standard loose files mode
      selectedFiles = [...selectedFiles, ...Array.from(filesArray)];
      renderFileDetailsUI();
    }
  }
}

fileInput.addEventListener("change", (e) => {
  handleFileSelection(e.target.files);
});

function interceptFileSelection(e) {
  if (isTransferring) {
    e.preventDefault();
    showToast(
      "Cannot select new files while a transfer is in progress.",
      "error"
    );
    console.warn("Cannot select new files while a transfer is in progress.");
  }
}
fileInput.addEventListener("click", interceptFileSelection);
const fInput = document.getElementById("folder-input");
if (fInput) {
  fInput.addEventListener("click", interceptFileSelection);
}

// --- NEW Custom Drag and Drop Feature ---
const dropZone = document.getElementById("drop-zone");

if (dropZone) {
  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, preventDefaults, false);
    // Also prevent defaults on the document body to avoid accidental browser navigation if missed
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(
      eventName,
      () => {
        if (!isTransferring) {
          dropZone.classList.add("drag-active");
        }
      },
      false
    );
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(
      eventName,
      () => {
        dropZone.classList.remove("drag-active");
      },
      false
    );
  });

  dropZone.addEventListener(
    "drop",
    async (e) => {
      if (isTransferring) {
        showToast(
          "Cannot select new files while a transfer is in progress.",
          "error"
        );
        return;
      }

      const dt = e.dataTransfer;
      if (!dt.items) return;

      const items = Array.from(dt.items);
      let hasDirectory = false;
      let allFiles = [];

      // Helper to recursively read directory entries
      const readEntry = async (entry, path = "") => {
        return new Promise((resolve) => {
          if (entry.isFile) {
            entry.file((file) => {
              // Attach the custom path so the zipping logic knows where it belongs
              file.customPath = path + file.name;
              resolve([file]);
            });
          } else if (entry.isDirectory) {
            hasDirectory = true;
            const dirReader = entry.createReader();
            const newPath = path + entry.name + "/";

            // Directory reading needs to handle batches, but usually one readEntries is enough for simple folders
            // To be safe with large folders, we loop until no entries are returned
            let allEntries = [];
            const readEntries = () => {
              dirReader.readEntries(async (entries) => {
                if (entries.length === 0) {
                  let subFiles = [];
                  for (let subEntry of allEntries) {
                    const parsed = await readEntry(subEntry, newPath);
                    subFiles = subFiles.concat(parsed);
                  }
                  resolve(subFiles);
                } else {
                  allEntries = allEntries.concat(entries);
                  readEntries(); // read next batch
                }
              });
            };
            readEntries();
          } else {
            resolve([]); // Not a file or directory
          }
        });
      };

      // Extract all entries synchronously first to bypass browser DataTransfer security wipe
      let entries = [];
      for (let item of items) {
        if (item.kind === "file") {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            entries.push(entry);
          }
        }
      }

      // Process them asynchronously safely
      for (let entry of entries) {
        const parsedFiles = await readEntry(entry);
        allFiles = allFiles.concat(parsedFiles);
      }

      if (allFiles.length > 0) {
        if (hasDirectory) {
          // If at least one directory was dropped, we treat the entire batch as a Folder Transfer (Zip)
          handleFolderSelection(allFiles);
        } else {
          // Only plain files were dropped
          handleFileSelection(allFiles);
        }
      }
    },
    false
  );
}

// --- NEW Home Screen Drop to Create Room Feature ---
const homeDropZone = document.getElementById("flip-container");
const homeDropInstruction = document.getElementById("home-drop-instruction");

if (homeDropZone) {
  const preventDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    homeDropZone.addEventListener(eventName, preventDrag, false);
  });

  let homeDragCounter = 0;

  homeDropZone.addEventListener(
    "dragenter",
    (e) => {
      homeDragCounter++;
      homeDropZone.classList.add("drag-active");
      if (homeDropInstruction) {
        homeDropInstruction.innerText = "Drop files to instantly create room!";
        homeDropInstruction.style.color = "var(--accent)";
        homeDropInstruction.style.fontWeight = "bold";
      }
    },
    false
  );

  homeDropZone.addEventListener(
    "dragover",
    (e) => {
      homeDropZone.classList.add("drag-active");
    },
    false
  );

  homeDropZone.addEventListener(
    "dragleave",
    (e) => {
      homeDragCounter--;
      if (homeDragCounter <= 0) {
        homeDragCounter = 0;
        homeDropZone.classList.remove("drag-active");
        if (homeDropInstruction) {
          homeDropInstruction.innerText =
            "Or drag & drop files here to create a room";
          homeDropInstruction.style.color = "var(--text-secondary)";
          homeDropInstruction.style.fontWeight = "normal";
        }
      }
    },
    false
  );

  homeDropZone.addEventListener(
    "drop",
    (e) => {
      homeDragCounter = 0;
      homeDropZone.classList.remove("drag-active");
      if (homeDropInstruction) {
        homeDropInstruction.innerText =
          "Or drag & drop files here to create a room";
        homeDropInstruction.style.color = "var(--text-secondary)";
        homeDropInstruction.style.fontWeight = "normal";
      }
    },
    false
  );

  homeDropZone.addEventListener(
    "drop",
    async (e) => {
      if (isTransferring) {
        showToast(
          "Cannot select new files while a transfer is in progress.",
          "error"
        );
        return;
      }

      const dt = e.dataTransfer;
      if (!dt.items) return;

      const items = Array.from(dt.items);
      let hasDirectory = false;
      let allFiles = [];

      // Helper to recursively read directory entries
      const readEntry = async (entry, path = "") => {
        return new Promise((resolve) => {
          if (entry.isFile) {
            entry.file((file) => {
              file.customPath = path + file.name;
              resolve([file]);
            });
          } else if (entry.isDirectory) {
            hasDirectory = true;
            const dirReader = entry.createReader();
            const newPath = path + entry.name + "/";

            let allEntries = [];
            const readEntries = () => {
              dirReader.readEntries(async (entries) => {
                if (entries.length === 0) {
                  let subFiles = [];
                  for (let subEntry of allEntries) {
                    const parsed = await readEntry(subEntry, newPath);
                    subFiles = subFiles.concat(parsed);
                  }
                  resolve(subFiles);
                } else {
                  allEntries = allEntries.concat(entries);
                  readEntries(); // read next batch
                }
              });
            };
            readEntries();
          } else {
            resolve([]); // Not a file or directory
          }
        });
      };

      // Extract all entries synchronously first to bypass browser DataTransfer security wipe
      let entries = [];
      for (let item of items) {
        if (item.kind === "file") {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            entries.push(entry);
          }
        }
      }

      // Process them asynchronously safely
      for (let entry of entries) {
        const parsedFiles = await readEntry(entry);
        allFiles = allFiles.concat(parsedFiles);
      }

      if (allFiles.length > 0) {
        if (hasDirectory) {
          handleFolderSelection(allFiles);
        } else {
          handleFileSelection(allFiles);
        }

        // Auto-create room
        const createRoomBtn = document.getElementById("create-room-btn");
        if (createRoomBtn) {
          createRoomBtn.click();
          showToast("Files queued! Room created successfully.", "success");
        }
      }
    },
    false
  );
}

sendFileBtn.addEventListener("click", () => {
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
  sendStartTime = 0;
  lastSendTime = 0;
  lastSendBytes = 0;
  if (sendChart) {
    sendChart.data.labels = ["0s"];
    sendChart.data.datasets[0].data = [0];
    sendChart.update("none");
  }
  pauseTransferBtn.innerHTML =
    '<span class="material-symbols-rounded">pause</span> Pause';
  sendFileBtn.disabled = true;
  sendProgressContainer.classList.remove("hidden");
  cancelTransferBtn.classList.remove("hidden");
  pauseTransferBtn.classList.remove("hidden");
  currentFileIndex = 0;

  if (window.isZippingFolder) {
    sendFolderStream();
  } else {
    sendNextFile();
  }
});

function sendNextFile() {
  if (currentFileIndex >= selectedFiles.length) {
    cancelTransferBtn.classList.add("hidden");
    pauseTransferBtn.classList.add("hidden");
    sendStatus.innerText = "All Files Sent Successfully!";
    triggerFeedback("success");
    sendProgressFill.classList.remove("progress-pulse");
    releaseWakeLock();

    // BUG FIX 3: Re-enable toggle immediately when transfer is done
    if (transferModeToggle) transferModeToggle.disabled = false;
    isTransferring = false;

    sendProgressContainer.classList.add("state-success");
    sendProgressFill.style.width = "100%";
    sendProgressText.innerText = "100%";
    setTimeout(() => {
      sendProgressContainer.classList.add("hidden");
      sendProgressContainer.classList.remove("state-success");
      sendFileBtn.disabled = true;
      document.getElementById("file-selection-form").reset();
      fileDetails.innerText = "";
      selectedFiles = [];
      window.isZippingFolder = false;
      window.folderTransferMeta = null;
    }, 3000);
    return;
  }

  const currentFile = selectedFiles[currentFileIndex];
  sendProgressContainer.classList.remove("state-error", "state-success");
  sendProgressFill.classList.add("progress-pulse");
  sendStatus.innerText = `Sending: ${sanitizeHTML(currentFile.name)} (${
    currentFileIndex + 1
  }/${selectedFiles.length})`;

  // Task 3: Sleep Mode Drop (Sender Side Wakelock)
  requestWakeLock();

  // Read toggle state
  const isFastMode = transferModeToggle ? transferModeToggle.checked : true;
  if (transferModeToggle) transferModeToggle.disabled = true; // Lock toggle during transfer

  // Send metadata first
  const metadata = {
    command: "FILE_METADATA",
    name: currentFile.name,
    size: currentFile.size,
    type: currentFile.type,
    fileIndex: currentFileIndex,
    totalFiles: selectedFiles.length,
    isFastMode: isFastMode, // Tell receiver our mode
  };

  dataConnection.send(metadata); // Use native object serialization

  isWaitingForAccept = true;
  sendStatus.innerText = `Initializing transfer: ${sanitizeHTML(
    currentFile.name
  )}...`;

  // Send chunks
  let offset = 0;
  const fileReader = new FileReader();

  // AIV Initialization
  let fastHashes = ["", "", ""];
  const totalChunks = Math.ceil(currentFile.size / CHUNK_SIZE);

  // Guard: prevent concurrent FileReader calls (race condition fix)
  let isFileReading = false;

  fileReader.onload = async (e) => {
    isFileReading = false; // FileReader is free now
    if (!dataConnection || !dataConnection.open) return;
    if (isTransferCancelled) return;

    try {
      const rawBuffer = e.target.result;

      if (!rawBuffer || rawBuffer.byteLength === 0) {
        console.warn("Read 0 bytes. Ending chunk loop for this file.");
        offset = currentFile.size;
        checkPauseAndRead();
        return;
      }

      // AIV 3-Point Fast Hash Calculation
      const currentChunkIndex = Math.floor(offset / CHUNK_SIZE);
      if (isFastMode) {
        if (currentChunkIndex === 0)
          fastHashes[0] = await getChunkHash(rawBuffer);
        else if (currentChunkIndex === Math.floor(totalChunks / 2))
          fastHashes[1] = await getChunkHash(rawBuffer);
        else if (currentChunkIndex === totalChunks - 1)
          fastHashes[2] = await getChunkHash(rawBuffer);
      }

      if (isFastMode) {
        dataConnection.send(rawBuffer);
        offset += rawBuffer.byteLength;
        updateSendProgress(offset, currentFile.size);
        checkPauseAndRead();
      } else {
        // Secure Mode: Only encrypt, AES-GCM automatically adds tamper-proof tag!
        const bufferToSend = await encryptChunk(rawBuffer);
        if (!isTransferCancelled && dataConnection && dataConnection.open) {
          dataConnection.send(bufferToSend);
        }
        offset += rawBuffer.byteLength;
        updateSendProgress(offset, currentFile.size);
        checkPauseAndRead();
      }
    } catch (err) {
      console.error("Chunk processing error:", err);
    }
  };

  fileReader.onerror = () => {
    console.error("FileReader error:", fileReader.error);
    console.warn("Error reading file");
  };

  const readSlice = (o) => {
    if (isFileReading) return; // Guard: never call readAsArrayBuffer when already reading
    isFileReading = true;
    const slice = currentFile.slice(o, o + CHUNK_SIZE);
    fileReader.readAsArrayBuffer(slice);
  };

  const checkPauseAndRead = () => {
    if (isTransferCancelled) return;
    if (isCurrentFileSkipped) {
      isCurrentFileSkipped = false;
      currentFileIndex++;
      window._resumeCheckPauseAndRead = null;
      if (window._pausePollTimer) {
        clearTimeout(window._pausePollTimer);
        window._pausePollTimer = null;
      }
      setTimeout(sendNextFile, 100);
      return;
    }

    if (isPaused || isBackpressurePaused || isWaitingForAccept) {
      window._resumeCheckPauseAndRead = checkPauseAndRead;
      // Use a CANCELLABLE timer — must be cancelled when we resume so it cannot
      // fire after the file is already complete and re-run the done branch.
      if (window._pausePollTimer) clearTimeout(window._pausePollTimer);
      window._pausePollTimer = setTimeout(checkPauseAndRead, 200);
      return;
    }

    // ── Resumed / active ─────────────────────────────────────────────────────
    // Cancel the poll timer immediately — it must NEVER fire after this point
    // because the file might complete in <200ms and the poll would re-run the
    // done branch (double FILE_HASH, double addSentFileRow, wrong index advance).
    if (window._pausePollTimer) {
      clearTimeout(window._pausePollTimer);
      window._pausePollTimer = null;
    }
    window._resumeCheckPauseAndRead = null;

    // Back-pressure: don't over-fill the WebRTC send buffer
    if (dataConnection && dataConnection.dataChannel) {
      dataConnection.dataChannel.bufferedAmountLowThreshold = 1 * 1024 * 1024;
      if (dataConnection.dataChannel.bufferedAmount > 8 * 1024 * 1024) {
        dataConnection.dataChannel.onbufferedamountlow = () => {
          dataConnection.dataChannel.onbufferedamountlow = null;
          checkPauseAndRead();
        };
        return;
      }
    }

    if (offset < currentFile.size) {
      readSlice(offset);
    } else {
      // Guard: once we've entered the done branch, prevent any re-entry
      // (e.g. a stale bufferedamountlow callback firing late)
      if (fileDone) return;
      fileDone = true;

      // AIV: Send calculated hashes
      const finalHash = isFastMode ? fastHashes.join("_") : "SECURE_OK";
      dataConnection.send({ command: "FILE_HASH", hash: finalHash });
      addSentFileRow(currentFile.name);
      currentFileIndex++;
      setTimeout(sendNextFile, 100);
    }
  };

  let fileDone = false; // Per-file guard: done branch runs exactly once
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
  sendProgressFill.style.width = percent + "%";
  sendProgressText.innerText = percent + "%";

  const sendSizeProgress = document.getElementById("send-size-progress");
  if (sendSizeProgress) {
    sendSizeProgress.innerText = `${(current / 1048576).toFixed(2)} MB / ${(
      total / 1048576
    ).toFixed(2)} MB`;
  }

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
      const speedSpan = document.getElementById("send-speed");
      if (speedSpan) speedSpan.innerText = `${speedMBps} MB/s`;

      const remainingBytes = total - current;
      const etaSeconds =
        speedBps > 0 ? Math.ceil(remainingBytes / speedBps) : 0;
      const etaSpan = document.getElementById("send-eta");
      if (etaSpan) etaSpan.innerText = formatETA(etaSeconds);

      if (sendChart) {
        let timeElapsedStr = "";
        if (sendStartTime > 0) {
          const elapsedSecs = Math.floor((now - sendStartTime) / 1000);
          timeElapsedStr = elapsedSecs + "s";
        }
        sendChart.data.labels.push(timeElapsedStr);
        sendChart.data.datasets[0].data.push(speedMBps);
        if (sendChart.data.labels.length > 20) {
          sendChart.data.labels.shift();
          sendChart.data.datasets[0].data.shift();
        }
        sendChart.update("none");
      }
    }

    lastSendTime = now;
    lastSendBytes = current;
  }
}

function updateReceiveProgress(current, total) {
  const percent = Math.min(Math.round((current / total) * 100), 100);
  receiveProgressFill.style.width = percent + "%";
  receiveProgressText.innerText = percent + "%";

  // Data size progress logic add kiya gaya
  const receiveSizeProgress = document.getElementById("receive-size-progress");
  if (receiveSizeProgress) {
    receiveSizeProgress.innerText = `${(current / 1048576).toFixed(2)} MB / ${(
      total / 1048576
    ).toFixed(2)} MB`;
  }

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
      const rSpeedSpan = document.getElementById("receive-speed");
      if (rSpeedSpan) rSpeedSpan.innerText = `${speedMBps} MB/s`;

      const remainingBytes = total - current;
      const etaSeconds =
        speedBps > 0 ? Math.ceil(remainingBytes / speedBps) : 0;
      const rEtaSpan = document.getElementById("receive-eta");
      if (rEtaSpan) rEtaSpan.innerText = formatETA(etaSeconds);

      if (receiveChart) {
        let timeElapsedStr = "";
        if (receiveStartTime > 0) {
          const elapsedSecs = Math.floor((now - receiveStartTime) / 1000);
          timeElapsedStr = elapsedSecs + "s";
        }
        receiveChart.data.labels.push(timeElapsedStr);
        receiveChart.data.datasets[0].data.push(speedMBps);
        if (receiveChart.data.labels.length > 20) {
          receiveChart.data.labels.shift();
          receiveChart.data.datasets[0].data.shift();
        }
        receiveChart.update("none");
      }
    }

    lastReceiveTime = now;
    lastReceiveBytes = current;
  }
}

// Global UI Speed reset heartbeat
setInterval(() => {
  const now = Date.now();

  // Send-speed: only relevant when sender is active (isTransferring set by sender)
  if (typeof isTransferring !== "undefined" && isTransferring) {
    if (lastSendTime !== 0 && now - lastSendTime > 1500) {
      const sendSpeedSpan = document.getElementById("send-speed");
      if (sendSpeedSpan) sendSpeedSpan.innerText = "0.00 MB/s";
      const sendEtaSpan = document.getElementById("send-eta");
      if (sendEtaSpan) sendEtaSpan.innerText = "--:--";
    }
  }

  // Receive-speed: checked INDEPENDENTLY — receiver never sets isTransferring.
  // If lastReceiveTime is set (we have been receiving) and >1.5s has passed without
  // an update, it means transfer stopped → reset display to 0.
  if (lastReceiveTime !== 0 && now - lastReceiveTime > 1500) {
    const receiveSpeedSpan = document.getElementById("receive-speed");
    if (receiveSpeedSpan) receiveSpeedSpan.innerText = "0.00 MB/s";
    const receiveEtaSpan = document.getElementById("receive-eta");
    if (receiveEtaSpan) receiveEtaSpan.innerText = "--:--";
  }
}, 1000);

function addReceivedFileRow(fileName, fileUrl, isStreamed = false) {
  downloadListHeader.classList.remove("hidden");

  // Outer accordion wrapper
  const row = document.createElement("div");
  row.className = "download-file-row";
  row.dataset.fileName = fileName; // Used by FILE_HASH handler to find this row

  // ── Header (always visible) ──────────────────────────────────────────────
  const header = document.createElement("div");
  header.className = "download-file-row-header";

  const nameSpan = document.createElement("span");
  nameSpan.className = "file-name";
  nameSpan.innerText = fileName;
  nameSpan.dataset.tooltip = fileName;

  const actionsDiv = document.createElement("div");
  actionsDiv.className = "download-file-row-actions";

  if (isStreamed) {
    const streamedBadge = document.createElement("span");
    streamedBadge.className = "sent-file-chip";
    streamedBadge.innerHTML =
      '<span class="material-symbols-rounded">check_circle</span> Streamed';
    streamedBadge.style.background = "rgba(16, 185, 129, 0.1)";
    streamedBadge.style.color = "var(--success)";
    streamedBadge.style.border = "none";
    actionsDiv.appendChild(streamedBadge);
  } else {
    const downloadBtn = document.createElement("a");
    downloadBtn.className = "btn transparent icon-btn small";
    downloadBtn.href = fileUrl;
    downloadBtn.download = fileName;
    downloadBtn.innerHTML =
      '<span class="material-symbols-rounded">download</span>';
    // Stop click on download btn from toggling accordion
    downloadBtn.addEventListener("click", (e) => e.stopPropagation());
    actionsDiv.appendChild(downloadBtn);
  }

  // Chevron — rotates on expand
  const chevron = document.createElement("span");
  chevron.className = "material-symbols-rounded download-file-row-chevron";
  chevron.innerText = "expand_more";

  header.appendChild(nameSpan);
  header.appendChild(actionsDiv);
  header.appendChild(chevron);

  // ── Details panel (hidden until FILE_HASH arrives) ───────────────────────
  const detailsPanel = document.createElement("div");
  detailsPanel.className = "download-file-row-details";

  const detailsInner = document.createElement("div");
  detailsInner.className = "download-file-row-details-inner";
  detailsInner.innerHTML =
    '<span style="color:var(--text-muted); font-size:0.75rem;">Waiting for verification…</span>';

  detailsPanel.appendChild(detailsInner);

  // Toggle accordion on header click
  header.addEventListener("click", () => {
    row.classList.toggle("expanded");
  });

  row.appendChild(header);
  row.appendChild(detailsPanel);
  downloadLinksContainer.appendChild(row);

  return row; // Returned so caller can reference it if needed
}

function addSentFileRow(name) {
  const safeName = sanitizeHTML(name);
  const fileRow = document.createElement("div");
  fileRow.className = "sent-file-chip";

  const fileNameDisplay = document.createElement("span");
  fileNameDisplay.className = "file-name";
  fileNameDisplay.innerText = safeName;

  const iconSpan = document.createElement("span");
  iconSpan.className = "material-symbols-rounded";
  iconSpan.style.color = "var(--success)";
  iconSpan.innerText = "check_circle";

  fileRow.appendChild(iconSpan);
  fileRow.appendChild(fileNameDisplay);
  sentFilesContainer.appendChild(fileRow);
  sentFilesDropdown.classList.remove("hidden");

  fileRow.dataset.tooltip = safeName;
}

clearDownloadsBtn.addEventListener("click", () => {
  downloadLinksContainer.innerHTML = "";
  downloadListHeader.classList.add("hidden");
  receiveProgressContainer.classList.add("hidden");
  receiveProgressContainer.classList.remove("state-success", "state-error");
});

leaveRoomBtn.addEventListener("click", () => {
  isExiting = true;
  if (typeof window._stopHeartbeat === "function") window._stopHeartbeat();
  // Notify the other peer gracefully before disconnecting
  try {
    if (dataConnection && dataConnection.open) {
      dataConnection.send({ command: "PEER_LEAVING" });
    }
  } catch (e) {}
  clearAllFiles();
  setTimeout(() => {
    if (dataConnection) dataConnection.close();
    if (peer) peer.destroy();
    window.location.href = window.location.href.split("?")[0];
  }, 200); // Small delay so PEER_LEAVING can flush
});

function resetUI() {
  clearAllFiles();
}

async function sendFolderStream() {
  const isFastMode = transferModeToggle ? transferModeToggle.checked : true;
  if (transferModeToggle) transferModeToggle.disabled = true;

  const { name, totalSize } = window.folderTransferMeta;
  sendStatus.innerText = `Zipping & Transferring Folder: ${name}`;
  sendProgressContainer.classList.remove("state-error", "state-success");
  sendProgressFill.classList.add("progress-pulse");

  const metadata = {
    command: "FILE_METADATA",
    name: name,
    size: totalSize,
    type: "application/zip",
    fileIndex: 0,
    totalFiles: 1,
    isZipStream: true,
    isFastMode: isFastMode,
  };
  dataConnection.send(metadata);
  isWaitingForAccept = true;
  sendStatus.innerText = `Initializing transfer: ${name}...`;

  while (isWaitingForAccept && !isTransferCancelled) {
    await new Promise((r) => setTimeout(r, 100));
  }

  if (isTransferCancelled) return;

  let offset = 0;
  const chunkQueue = [];
  let isZippingDone = false;
  let lastZipChunk = null; // AIV Track

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
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      if (chunkQueue.length > 0) {
        const chunk = chunkQueue.shift();

        while (
          !isTransferCancelled &&
          dataConnection.dataChannel &&
          dataConnection.dataChannel.bufferedAmount > 1 * 1024 * 1024
        ) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        if (isTransferCancelled || isCurrentFileSkipped) break;

        offset += chunk.length;
        updateSendProgress(offset, totalSize);

        lastZipChunk = chunk; // AIV: Track the final piece of the stream

        if (isFastMode) {
          dataConnection.send(chunk);
        } else {
          const encrypted = await encryptChunk(chunk);
          dataConnection.send(encrypted);
        }
      } else if (isZippingDone) {
        if (!isTransferCancelled) {
          // AIV: Calculate Tail-End hash
          let finalZipHash = "SECURE_OK";
          if (isFastMode) {
            finalZipHash = lastZipChunk
              ? await getChunkHash(lastZipChunk)
              : "EMPTY_ZIP";
          }
          dataConnection.send({ command: "FILE_DONE", hash: finalZipHash });
          addSentFileRow(name);
          currentFileIndex = selectedFiles.length;
          sendNextFile();
        }
        break;
      } else {
        await new Promise((r) => setTimeout(r, 10));
      }
    }
  };

  // Start the sender loop
  sendLoop();

  for (let i = 0; i < selectedFiles.length; i++) {
    if (isTransferCancelled || isCurrentFileSkipped) break;
    const file = selectedFiles[i];
    const path = file.customPath || file.webkitRelativePath || file.name;

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
        await new Promise((r) => setTimeout(r, 50));
      }
      zipStream.push(value);
    }
  }
  if (!isTransferCancelled && !isCurrentFileSkipped) {
    zip.end();
  } else if (isCurrentFileSkipped) {
    isCurrentFileSkipped = false;
    setTimeout(() => {
      sendProgressContainer.classList.add("hidden");
      if (pauseTransferBtn) pauseTransferBtn.classList.add("hidden");
      if (cancelTransferBtn) cancelTransferBtn.classList.add("hidden");
      sendFileBtn.disabled = true;
      document.getElementById("file-selection-form").reset();
      if (fileDetails) fileDetails.innerText = "";
      selectedFiles = [];
      window.isZippingFolder = false;
      window.folderTransferMeta = null;
      isTransferring = false;
      if (transferModeToggle) transferModeToggle.disabled = false;
      releaseWakeLock();
    }, 3000);
  }
}

const folderInput = document.getElementById("folder-input");
if (folderInput) {
  folderInput.addEventListener("change", (e) => {
    handleFolderSelection(e.target.files);
  });
}

// CHART.JS INITIALIZATION
// ==========================================
let sendChart = null;
let receiveChart = null;

function initCharts() {
  if (typeof Chart === "undefined") {
    console.warn("Chart.js not loaded yet.");
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
        ticks: { color: "#888", maxTicksLimit: 5 },
      },
      y: {
        display: true,
        beginAtZero: true,
        grid: { color: "rgba(255, 255, 255, 0.05)" },
        ticks: {
          color: "#888",
          callback: function (value) {
            return value + " MB/s";
          },
          maxTicksLimit: 5,
        },
      },
    },
    elements: {
      point: { radius: 0 },
      line: { tension: 0.4, borderWidth: 2 },
    },
  };

  const sendCtx = document.getElementById("sendSpeedChart");
  if (sendCtx && !sendChart) {
    sendChart = new Chart(sendCtx, {
      type: "line",
      data: {
        labels: Array(20).fill(""),
        datasets: [
          {
            data: Array(20).fill(0),
            borderColor: "#4ade80",
            backgroundColor: "rgba(74, 222, 128, 0.1)",
            fill: true,
          },
        ],
      },
      options: chartOptions,
    });
  }

  const receiveCtx = document.getElementById("receiveSpeedChart");
  if (receiveCtx && !receiveChart) {
    receiveChart = new Chart(receiveCtx, {
      type: "line",
      data: {
        labels: Array(20).fill(""),
        datasets: [
          {
            data: Array(20).fill(0),
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59, 130, 246, 0.1)",
            fill: true,
          },
        ],
      },
      options: chartOptions,
    });
  }
}

// Initialize charts for normal use
setTimeout(initCharts, 500);

const clearTextBtn = document.getElementById("clear-text-btn");
if (clearTextBtn) {
  clearTextBtn.addEventListener("click", () => {
    const receivedTextContent = document.getElementById(
      "received-text-content"
    );
    const receivedTextContainer = document.getElementById(
      "received-text-container"
    );
    if (receivedTextContent) receivedTextContent.innerText = "";
    if (receivedTextContainer) receivedTextContainer.classList.add("hidden");
  });
}

// ==========================================
// UI/UX PREMIUM ENHANCEMENTS
// ==========================================

// 1. Haptic Feedback
window.triggerFeedback = function (type) {
  if (!navigator.vibrate) return;
  if (type === "success") {
    navigator.vibrate([200, 100, 200]);
  } else if (type === "error") {
    navigator.vibrate([300]);
  }
};

// 2. Visual Polish: CSS & Confetti
const premiumStyle = document.createElement("style");
premiumStyle.innerHTML = `
  @keyframes progress-pulse-anim {
    0% { opacity: 1; }
    50% { opacity: 0.6; }
    100% { opacity: 1; }
  }
  .progress-pulse {
    animation: progress-pulse-anim 1.5s infinite ease-in-out !important;
  }
  #pwa-container {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 1000;
    background-color: #007aff;
    border-radius: 30px;
    display: none;
    align-items: center;
    padding: 6px 6px 6px 20px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
    transition: transform 0.2s ease;
  }
  #pwa-container:hover {
    transform: scale(1.02);
  }
  #pwa-install-btn {
    background: transparent;
    color: white;
    border: none;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px 6px 0;
  }
  #pwa-dismiss-btn {
    background: rgba(255, 255, 255, 0.2);
    color: white;
    border: none;
    border-radius: 50%;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    margin-left: 8px;
    transition: background 0.2s;
  }
  #pwa-dismiss-btn:hover {
    background: rgba(255, 255, 255, 0.4);
  }
`;
document.head.appendChild(premiumStyle);

// 3. PWA Install Button with 7-Day Cooldown
const COOLDOWN_DAYS = 7;
const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
const dismissedTime = localStorage.getItem("droperx_pwa_dismissed");

if (!dismissedTime || Date.now() - parseInt(dismissedTime, 10) > COOLDOWN_MS) {
  let deferredPrompt;

  const container = document.createElement("div");
  container.id = "pwa-container";

  const installBtn = document.createElement("button");
  installBtn.id = "pwa-install-btn";
  installBtn.innerHTML =
    '<span class="material-symbols-rounded" style="font-size: 20px;">download</span> Install DroperX';

  const dismissBtn = document.createElement("button");
  dismissBtn.id = "pwa-dismiss-btn";
  dismissBtn.innerHTML =
    '<span class="material-symbols-rounded" style="font-size: 18px;">close</span>';

  container.appendChild(installBtn);
  container.appendChild(dismissBtn);
  document.body.appendChild(container);

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    container.style.display = "flex";
  });

  installBtn.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        container.style.display = "none";
      }
      deferredPrompt = null;
    }
  });

  dismissBtn.addEventListener("click", () => {
    localStorage.setItem("droperx_pwa_dismissed", Date.now());
    container.style.display = "none";
  });
}
