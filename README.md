<div align="center">
  <img src="assets/images/logo.png" alt="DroperX Logo" width="120" />
  <h1>DroperX</h1>
  <p><strong>Fast, Secure, and Limitless P2P File Sharing.</strong></p>

  <p>
    <a href="https://github.com/Rehankumar554/DroperX/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-GPLv3-blue.svg" alt="License: GPL v3"></a>
    <a href="https://github.com/Rehankumar554/DroperX/issues"><img src="https://img.shields.io/github/issues/Rehankumar554/DroperX" alt="Issues"></a>
    <a href="https://github.com/Rehankumar554/DroperX/pulls"><img src="https://img.shields.io/github/issues-pr/Rehankumar554/DroperX" alt="Pull Requests"></a>
  </p>
</div>

<hr/>

## 🚀 Overview

**DroperX** is a cutting-edge web application designed to break down the barriers of data transfer. Built with privacy and speed in mind, DroperX utilizes advanced **WebRTC technology** to establish a direct Peer-to-Peer (P2P) connection between devices.

Files are transferred directly between peers without ever touching a centralized cloud storage server, ensuring maximum security and zero data retention.

## ✨ Key Features

- **Peer-to-Peer Architecture:** No middlemen, no cloud limits, just pure unthrottled speed.
- **End-to-End Encrypted (E2EE):** All data channels are encrypted using DTLS and SRTP. Even we cannot see what you transfer.
- **Zero Data Retention:** Data flows directly between connected devices. Once the tab is closed, the session is permanently destroyed.
- **No File Size Limits:** Because files are never stored on a server, you can send files of any size—gigabytes or terabytes—without restrictions.
- **Cross-Platform:** Works seamlessly across Windows, macOS, Android, and iOS directly from the browser.

## 🛠️ Technology Stack

- **Frontend:** HTML5, CSS3 (Custom Design System), JavaScript (Vanilla)
- **Networking:** WebRTC, PeerJS
- **Analytics & Graphs:** Chart.js
- **Compression:** fflate (Zip Streaming)

## 🏁 Getting Started

### Prerequisites
You need a local server environment to run DroperX properly since it requires standard HTTP/S protocols to handle WebRTC connections.
- [XAMPP](https://www.apachefriends.org/index.html) / [WAMP](https://www.wampserver.com/en/) or any standard web server.

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Rehankumar554/DroperX.git
   ```

2. **Move to Server Directory**
   Move the cloned folder into your local web server's public directory (e.g., `htdocs` for XAMPP).

3. **Run the Application**
   Start your local server (Apache) and navigate to:
   ```text
   http://localhost/DroperX
   ```

## 🤝 Contributing

We welcome contributions to make DroperX even better! Please read our [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests to us.

## 🛡️ Security & Privacy

We take privacy extremely seriously. Please read our [SECURITY.md](SECURITY.md) to learn how to report vulnerabilities.

## 📝 License

This project is licensed under the **GNU General Public License v3.0**. See the [LICENSE](LICENSE) file for details. This ensures that any derived works or modifications must also be open-source under the exact same terms.

---
<div align="center">
  Built with ❤️ by <strong>Rehan Kumar</strong> & <strong>RKS Development Studio</strong>.
</div>
