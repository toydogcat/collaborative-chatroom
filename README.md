# 聯手聊天室 (Collaborative Chatroom)

100% 無後端（Serverless）WebRTC P2P 多人連線聊天室。

## 🚀 特色

- **零伺服器**：部屬為 100% 靜態網頁（GitHub Pages）。
- **MQTT 信令**：使用 EMQX 公共 MQTT Broker 進行連線握手。
- **WebRTC P2P**：連線建立後，訊息直接透過 WebRTC DataChannel 傳輸，低延遲且隱私。
- **QR Code 掃描**：一鍵掃碼加入房間。
- **語音輸入**：整合 Web Speech API。
- **備份還原**：支援將聊天紀錄打包成 ZIP 下載，隨時還原。

## 🛠️ 技術棧

- **Frontend**: React 19, TypeScript, Vite, TailwindCSS
- **Communication**: MQTT (mqtt.js), WebRTC (native browser API)
- **UI Icons**: Lucide React
- **QR**: qrcode, html5-qrcode
- **Analytics**: Vercount.one

## 📦 開發與部屬

### 本地開發
```bash
npm install
npm run dev
```

### 部屬至 GitHub Pages
本專案已配置 GitHub Actions。只需推送到 `main` 分支即可自動部屬。

## 📡 連線架構

1. **信令期**：房主與訪客透過 MQTT 訂閱專屬主題，交換 WebRTC SDP 與 ICE Candidate。
2. **連線期**：WebRTC DataChannel 建立成功。
3. **離線期**：MQTT 連線於 WebRTC 建立 10 秒後自動斷開，後續 100% 走 P2P。

---
Made with ❤️ for Luna AI Hub.
