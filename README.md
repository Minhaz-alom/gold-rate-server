# 🪙 Gold Rate Middleman Server & ESP32 HUB75 Matrix Controller

> **সেন্ট্রালাইজড গোল্ড রেট সার্ভার ও অ্যাডমিন প্যানেল (Bangladesh Gold Rate & IoT Display Gateway)**

A full-stack, production-ready Gold Rate Middleman Server built with **Node.js/Express**, featuring a **Luxury Bengali User Portal**, a **Secure Admin Panel with Manual Override Mode**, and a **High-Speed Centralized JSON API** engineered specifically for multiple **ESP32 HUB75 RGB LED Matrix Displays**.

---

## 🌟 Key Features

1. **🎨 Modern Bengali Frontend UI ("আজকের সোনার দাম বাংলাদেশ")**:
   - Luxury Dark/Gold & Onyx aesthetic with glassmorphism and glowing accents.
   - Built-in `<script async src="https://www.goldr.org/price.ultra.js"></script>` integration.
   - Exact highlighted metrics with `data` attributes:
     - **22K**: `50g` purchase price (`<i data="22k-50gram-dam"></i>`) and `1 bhori` sale (`<i data="22k-1bhori-dam"></i>`).
     - **21K**: `7 ana` purchase price (`<i data="21k-7ana-dam"></i>`) and `1 kg` sale (`<i data="21k-1kg-dam"></i>`).
   - Self-healing fallback engine: If the external script is blocked by adblockers, the page seamlessly populates data via `/api/rates`.
   - Interactive Gold & Jewelry Calculator (Bhori, Gram, Ana, Rati, Point with Making Charges & VAT).
   - Developer documentation link to `https://www.goldr.org/api-documentation/`.

2. **🔐 Secure Admin Panel (`/admin`)**:
   - Mode Switcher: **Auto Web Sync** ⚡ vs **Manual Override** ✍️.
   - Real-time custom rate override editor for 22K, 21K, 18K, Traditional Gold, and Silver.
   - Bidirectional Gram $\leftrightarrow$ Bhori auto-converter toggle ($1\text{ ভরি} = 11.664\text{ গ্রাম}$).
   - **Virtual 64x32 HUB75 LED Matrix Simulator**: Preview how the scrolling ticker looks on physical LED boards.
   - **Connected ESP32 Device Monitor**: Track all online matrix boards, IP addresses, ping counts, and timestamps.
   - Force Auto-Sync trigger and adjustable sync intervals.

3. **📡 Centralized JSON API Endpoint (`/api/rates`)**:
   - Returns the exact requested JSON payload for ESP32 and IoT consumers:
     ```json
     {
       "source": "auto",
       "updated": "2026-10-05 14:30",
       "rates": {
         "gram": { "22k": 14500, "21k": 13800, "18k": 11800, "silver": 210, "trad": 9000 },
         "bhori": { "22k": 169000, "21k": 161000, "18k": 137000, "silver": 2450, "trad": 105000 }
       }
     }
     ```
   - Zero external dependency failures: If upstream fails, gracefully serves cached/manual rates without 500 errors.

4. **📟 Ready-to-Flash ESP32 Firmware**:
   - Complete C++ Arduino sketch using `ESP32-HUB75-MatrixPanel-I2S-DMA` and `ArduinoJson`.

---

## 🚀 Quick Start (Local Setup)

### 1. Prerequisites
- **Node.js** v18 or higher installed on your machine.

### 2. Installation
Open PowerShell / Terminal in the project folder:
```bash
npm install
```

### 3. Running the Server
```bash
npm start
```
Or for auto-reload development:
```bash
npm run dev
```

### 4. Access URLs
- **Public Portal**: [http://localhost:3000/](http://localhost:3000/)
- **Admin Panel**: [http://localhost:3000/admin](http://localhost:3000/admin)
- **JSON API**: [http://localhost:3000/api/rates](http://localhost:3000/api/rates)

> **Default Admin Credentials**:
> - **Username**: `admin`
> - **Password**: `admin123` *(Can be changed in `.env` or from the Admin Panel Settings tab)*

---

## 🌐 Deployment & Hosting Guide

### Option A: Deploy on Render.com (Recommended Free / Cloud)

1. Create a free account on [Render.com](https://render.com/).
2. Push this repository to GitHub.
3. In Render dashboard, click **New +** $\rightarrow$ **Web Service**.
4. Connect your GitHub repository.
5. Set:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
6. Under **Environment Variables**, add:
   - `ADMIN_PASSWORD` = `YourSecurePassword2026`
   - `JWT_SECRET` = `YourSecretRandomString`
   - `NODE_ENV` = `production`
7. Click **Deploy Web Service**.
8. Render will generate a public HTTPS URL (e.g. `https://gold-rate-server.onrender.com`).
   Your ESP32 endpoint will be: `https://gold-rate-server.onrender.com/api/rates`.

---

### Option B: Deploy on a Linux VPS (Ubuntu/Debian with PM2 & Nginx)

1. **SSH into your VPS**:
   ```bash
   ssh root@your_vps_ip
   ```

2. **Install Node.js & PM2**:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs nginx git
   sudo npm install -g pm2
   ```

3. **Clone & Setup App**:
   ```bash
   cd /var/www
   git clone <YOUR_REPO_URL> gold-server
   cd gold-server
   npm install --production
   cp .env.example .env
   ```

4. **Start with PM2 Daemon**:
   ```bash
   pm2 start server.js --name "gold-server"
   pm2 save
   pm2 startup
   ```

5. **Configure Nginx Reverse Proxy** (`/etc/nginx/sites-available/gold-server`):
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
   Enable site & install Free SSL:
   ```bash
   sudo ln -s /etc/nginx/sites-available/gold-server /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo apt-get install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com
   ```

---

### Option C: Deploy on Railway / Fly.io

1. In Railway/Fly.io, select **Deploy from GitHub repo**.
2. Set Environment Variables: `ADMIN_PASSWORD` and `JWT_SECRET`.
3. It automatically detects `package.json` and runs `npm start`.

---

## 📟 ESP32 HUB75 Setup & `RATE_SERVER_URL`

1. Open [`firmware/ESP32_HUB75_GoldRate_Matrix.ino`](file:///c:/Users/MINHAZ/Desktop/ratewebsite/firmware/ESP32_HUB75_GoldRate_Matrix.ino) in Arduino IDE.
2. Enter your WiFi credentials:
   ```cpp
   const char* WIFI_SSID     = "MyJewelryShop_WiFi";
   const char* WIFI_PASSWORD = "WiFiPassword123";
   ```
3. Set your public or local server endpoint:
   ```cpp
   const char* RATE_SERVER_URL = "http://YOUR_SERVER_IP:3000/api/rates";
   // OR
   const char* RATE_SERVER_URL = "https://yourdomain.com/api/rates";
   ```
4. Flash to your ESP32 board.
5. The matrix board will immediately connect, fetch JSON rates, and start cycling 22K, 21K, 18K, Silver, and Traditional gold rates in rich RGB colors!

---

## 📂 Project Directory Structure

```
ratewebsite/
├── package.json               # Node.js dependencies and scripts
├── server.js                  # Main Express Server & rate sync engine
├── .env                       # Environment configuration
├── .env.example               # Example environment variables
├── data/
│   └── rates.json             # Persistent JSON state (rates, modes, settings, devices)
├── public/
│   ├── index.html             # Bengali Luxury Gold Rate Webpage
│   ├── admin.html             # Admin Dashboard UI
│   ├── login.html             # Admin Authentication page
│   ├── css/
│   │   ├── style.css          # Frontend luxury gold design
│   │   └── admin.css          # Admin panel styling & matrix simulator
│   └── js/
│       ├── app.js             # Frontend reactivity, calculator, fallback
│       └── admin.js           # Admin controller, mode toggler, device tracker
├── firmware/
│   ├── ESP32_HUB75_GoldRate_Matrix.ino   # Ready-to-flash Arduino C++ firmware
│   └── README.md              # HUB75 wiring and flashing instructions
└── README.md                  # Complete documentation
```

---

## 🛡️ License
MIT License. Built for Bangladesh Gold Jewelry Merchants & ESP32 Matrix IoT Developers.
