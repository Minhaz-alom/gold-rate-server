# ESP32 HUB75 LED Matrix Gold Rate Firmware

This folder contains the complete Arduino / C++ firmware to drive HUB75 RGB LED Matrix panels (64x32, 128x64, 64x64) using an ESP32 microcontroller, polling gold rates directly from our Middleman Server's `/api/rates` JSON endpoint.

---

## 1. Required Arduino Libraries

In Arduino IDE (Tools -> Manage Libraries...), install:
1. **`ESP32-HUB75-MatrixPanel-I2S-DMA`** by *mrfaptastic* (v3.0.0+)
2. **`ArduinoJson`** by *Benoit Blanchon* (v6.x or v7.x)
3. **`Adafruit GFX Library`** by *Adafruit*

---

## 2. Pin Mapping (ESP32 to HUB75 16-Pin IDC Connector)

| HUB75 Pin | ESP32 GPIO | Description |
|-----------|------------|-------------|
| **R1** | GPIO 25 | Upper Red Data |
| **G1** | GPIO 26 | Upper Green Data |
| **B1** | GPIO 27 | Upper Blue Data |
| **R2** | GPIO 14 | Lower Red Data |
| **G2** | GPIO 12 | Lower Green Data |
| **B2** | GPIO 13 | Lower Blue Data |
| **A**  | GPIO 23 | Row Select A |
| **B**  | GPIO 19 | Row Select B |
| **C**  | GPIO 5  | Row Select C |
| **D**  | GPIO 17 | Row Select D |
| **E**  | GPIO 18 | Row Select E (only for 64x64 panels) |
| **CLK**| GPIO 16 | Shift Clock |
| **LAT**| GPIO 4  | Latch |
| **OE** | GPIO 15 | Output Enable (Active Low) |
| **GND**| GND | Ground |

---

## 3. Configuration in `.ino` Code

Open `ESP32_HUB75_GoldRate_Matrix.ino` and update these lines:

```cpp
const char* WIFI_SSID     = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Use your VPS domain or local network IP:
const char* RATE_SERVER_URL = "http://192.168.1.100:3000/api/rates";
```

---

## 4. Expected JSON Response from Server

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

---

## 5. Board Features
- **Non-blocking DMA**: Free ESP32 CPU for networking while display updates smoothly at 100+ FPS without flicker.
- **Fail-Safe Cache**: If WiFi disconnects or the server is momentarily unreachable, it keeps displaying the last cached rates and shows a red WiFi dot.
- **Auto-Sync**: Pulls new rates automatically every 60 seconds.
