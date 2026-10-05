/**
 * ==============================================================================
 * ESP32 HUB75 RGB LED MATRIX - GOLD RATE CLIENT FIRMWARE
 * ==============================================================================
 * Author: Antigravity IoT Architect
 * Compatibility: ESP32-WROOM-32 / ESP32-S3 / ESP32-D1 Mini
 * Library Requirements:
 *   1. ESP32-HUB75-MatrixPanel-I2S-DMA (by mrfaptastic)
 *   2. ArduinoJson (v6 or v7)
 *   3. Adafruit GFX Library
 * 
 * Hardware Wiring (Standard HUB75 16-pin connector to ESP32):
 *   R1 -> GPIO 25    G1 -> GPIO 26    B1 -> GPIO 27
 *   R2 -> GPIO 14    G2 -> GPIO 12    B2 -> GPIO 13
 *   A  -> GPIO 23    B  -> GPIO 19    C  -> GPIO 5     D -> GPIO 17    E -> GPIO 18 (if 64x64)
 *   CLK-> GPIO 16    LAT-> GPIO 4     OE -> GPIO 15    GND-> GND
 * ==============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>

// -----------------------------------------------------------------------------
// 1. CONFIGURATION: WIFI & RATE SERVER
// -----------------------------------------------------------------------------
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Replace with your deployed Server IP or Domain:
// Example: "http://192.168.1.100:3000/api/rates" or "https://your-domain.com/api/rates"
const char* RATE_SERVER_URL = "http://192.168.1.100:3000/api/rates";

// Polling interval in milliseconds (e.g. 60,000 ms = 1 minute)
const unsigned long POLL_INTERVAL_MS = 60000;

// LED Matrix dimensions
#define PANEL_RES_X 64   // Number of pixels wide of each INDIVIDUAL panel module.
#define PANEL_RES_Y 32   // Number of pixels tall of each INDIVIDUAL panel module.
#define PANEL_CHAIN 1    // Total number of panels chained together (1 for 64x32, 2 for 128x32)

// -----------------------------------------------------------------------------
// 2. HARDWARE MATRIX INSTANCE
// -----------------------------------------------------------------------------
MatrixPanel_I2S_DMA *dma_display = nullptr;

// Colors (565 16-bit format)
uint16_t COLOR_BLACK;
uint16_t COLOR_GOLD;
uint16_t COLOR_GREEN;
uint16_t COLOR_CYAN;
uint16_t COLOR_MAGENTA;
uint16_t COLOR_ORANGE;
uint16_t COLOR_WHITE;
uint16_t COLOR_RED;

// -----------------------------------------------------------------------------
// 3. DATA STRUCTURE FOR RECEIVED RATES
// -----------------------------------------------------------------------------
struct GoldRates {
  long gram_22k = 14500;
  long gram_21k = 13800;
  long gram_18k = 11800;
  long gram_trad = 9000;
  long gram_silver = 210;

  long bhori_22k = 169000;
  long bhori_21k = 161000;
  long bhori_18k = 137000;
  long bhori_trad = 105000;
  long bhori_silver = 2450;

  String source = "auto";
  String updated = "2026-10-05 14:30";
  bool isLoaded = false;
};

GoldRates currentRates;
unsigned long lastPollTime = 0;
int currentSlide = 0;
unsigned long lastSlideSwitch = 0;
const unsigned long SLIDE_DURATION_MS = 3500; // Switch karat display every 3.5s

// -----------------------------------------------------------------------------
// 4. FETCH & PARSE RATES FROM CENTRALIZED JSON API
// -----------------------------------------------------------------------------
void fetchGoldRates() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Not connected, skipping HTTP request.");
    return;
  }

  HTTPClient http;
  http.begin(RATE_SERVER_URL);
  http.setTimeout(5000);
  http.setUserAgent("ESP32-HUB75-Matrix/1.0");

  Serial.printf("[HTTP] GET %s\n", RATE_SERVER_URL);
  int httpCode = http.GET();

  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    Serial.println("[HTTP] Response received:");
    Serial.println(payload);

    // DynamicJsonDocument for ArduinoJson v6, JsonDocument for v7
    #if ARDUINOJSON_VERSION_MAJOR >= 7
      JsonDocument doc;
    #else
      DynamicJsonDocument doc(2048);
    #endif

    DeserializationError error = deserializeJson(doc, payload);
    if (!error) {
      currentRates.source = doc["source"].as<String>();
      currentRates.updated = doc["updated"].as<String>();

      // Gram Rates
      currentRates.gram_22k = doc["rates"]["gram"]["22k"] | currentRates.gram_22k;
      currentRates.gram_21k = doc["rates"]["gram"]["21k"] | currentRates.gram_21k;
      currentRates.gram_18k = doc["rates"]["gram"]["18k"] | currentRates.gram_18k;
      currentRates.gram_trad = doc["rates"]["gram"]["trad"] | currentRates.gram_trad;
      currentRates.gram_silver = doc["rates"]["gram"]["silver"] | currentRates.gram_silver;

      // Bhori Rates
      currentRates.bhori_22k = doc["rates"]["bhori"]["22k"] | currentRates.bhori_22k;
      currentRates.bhori_21k = doc["rates"]["bhori"]["21k"] | currentRates.bhori_21k;
      currentRates.bhori_18k = doc["rates"]["bhori"]["18k"] | currentRates.bhori_18k;
      currentRates.bhori_trad = doc["rates"]["bhori"]["trad"] | currentRates.bhori_trad;
      currentRates.bhori_silver = doc["rates"]["bhori"]["silver"] | currentRates.bhori_silver;

      currentRates.isLoaded = true;
      Serial.println("[JSON] Rates successfully parsed & cached!");
    } else {
      Serial.printf("[JSON] Deserialization failed: %s\n", error.c_str());
    }
  } else {
    Serial.printf("[HTTP] Request failed, error code: %d\n", httpCode);
  }

  http.end();
}

// -----------------------------------------------------------------------------
// 5. HELPER: FORMAT NUMBER WITH COMMAS (e.g. 169000 -> 169,000)
// -----------------------------------------------------------------------------
String formatNumberWithCommas(long value) {
  String numStr = String(value);
  int len = numStr.length();
  if (len <= 3) return numStr;

  String result = "";
  int count = 0;
  for (int i = len - 1; i >= 0; i--) {
    result = numStr.charAt(i) + result;
    count++;
    if (count % 3 == 0 && i > 0) {
      result = "," + result;
    }
  }
  return result;
}

// -----------------------------------------------------------------------------
// 6. DRAW SCREEN ON HUB75 MATRIX
// -----------------------------------------------------------------------------
void renderDisplay() {
  dma_display->fillScreen(COLOR_BLACK);

  // Top Title Bar (Yellow text)
  dma_display->setTextSize(1);
  dma_display->setTextColor(COLOR_GOLD);
  dma_display->setCursor(2, 1);
  dma_display->print("GOLD RATE BD");

  // Top Right WiFi indicator dot
  if (WiFi.status() == WL_CONNECTED) {
    dma_display->drawPixel(61, 2, COLOR_GREEN);
  } else {
    dma_display->drawPixel(61, 2, COLOR_RED);
  }

  // Divider Line
  dma_display->drawLine(0, 9, 63, 9, COLOR_WHITE);

  // Cycle Karats
  String karatName = "";
  long bhoriRate = 0;
  long gramRate = 0;
  uint16_t karatColor = COLOR_GOLD;

  switch (currentSlide) {
    case 0:
      karatName = "22K GOLD";
      bhoriRate = currentRates.bhori_22k;
      gramRate = currentRates.gram_22k;
      karatColor = COLOR_GOLD;
      break;
    case 1:
      karatName = "21K GOLD";
      bhoriRate = currentRates.bhori_21k;
      gramRate = currentRates.gram_21k;
      karatColor = COLOR_CYAN;
      break;
    case 2:
      karatName = "18K GOLD";
      bhoriRate = currentRates.bhori_18k;
      gramRate = currentRates.gram_18k;
      karatColor = COLOR_MAGENTA;
      break;
    case 3:
      karatName = "TRAD GOLD";
      bhoriRate = currentRates.bhori_trad;
      gramRate = currentRates.gram_trad;
      karatColor = COLOR_ORANGE;
      break;
    case 4:
      karatName = "SILVER 22K";
      bhoriRate = currentRates.bhori_silver;
      gramRate = currentRates.gram_silver;
      karatColor = COLOR_WHITE;
      break;
  }

  // Line 2: Karat Title (Middle)
  dma_display->setTextColor(karatColor);
  dma_display->setCursor(2, 12);
  dma_display->print(karatName);

  // Line 3: 1 Bhori Price (Large Green Text)
  dma_display->setTextColor(COLOR_GREEN);
  dma_display->setCursor(2, 22);
  dma_display->print("V:" + formatNumberWithCommas(bhoriRate));
}

// -----------------------------------------------------------------------------
// 7. SETUP FUNCTION
// -----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n--- Starting ESP32 HUB75 Gold Rate Matrix Board ---");

  // 1. Initialize HUB75 Panel Configuration
  HUB75_I2S_DMA_CONFIG mxconfig(
    PANEL_RES_X,
    PANEL_RES_Y,
    PANEL_CHAIN
  );

  // Pin Configuration (Override if using custom shield)
  // mxconfig.gpio.r1 = 25; mxconfig.gpio.g1 = 26; mxconfig.gpio.b1 = 27;
  // mxconfig.gpio.r2 = 14; mxconfig.gpio.g2 = 12; mxconfig.gpio.b2 = 13;
  // mxconfig.gpio.a = 23;  mxconfig.gpio.b = 19;  mxconfig.gpio.c = 5;  mxconfig.gpio.d = 17;
  // mxconfig.gpio.lat = 4; mxconfig.gpio.oe = 15; mxconfig.gpio.clk = 16;

  dma_display = new MatrixPanel_I2S_DMA(mxconfig);
  dma_display->begin();
  dma_display->setBrightness8(90); // 0-255 Brightness
  dma_display->clearScreen();

  // Create Colors
  COLOR_BLACK   = dma_display->color565(0, 0, 0);
  COLOR_GOLD    = dma_display->color565(255, 204, 0);
  COLOR_GREEN   = dma_display->color565(34, 197, 94);
  COLOR_CYAN    = dma_display->color565(56, 189, 248);
  COLOR_MAGENTA = dma_display->color565(244, 114, 182);
  COLOR_ORANGE  = dma_display->color565(251, 146, 60);
  COLOR_WHITE   = dma_display->color565(240, 240, 240);
  COLOR_RED     = dma_display->color565(239, 68, 68);

  // Splash Screen
  dma_display->fillScreen(COLOR_BLACK);
  dma_display->setTextColor(COLOR_GOLD);
  dma_display->setCursor(4, 8);
  dma_display->print("CONNECTING");
  dma_display->setTextColor(COLOR_CYAN);
  dma_display->setCursor(4, 18);
  dma_display->print("TO WIFI...");

  // 2. Connect to WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 25) {
    delay(400);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected! IP Address: " + WiFi.localIP().toString());
    dma_display->fillScreen(COLOR_BLACK);
    dma_display->setTextColor(COLOR_GREEN);
    dma_display->setCursor(4, 12);
    dma_display->print("WIFI OK!");
    delay(1000);

    // Initial Fetch
    fetchGoldRates();
  } else {
    Serial.println("\n[WiFi] Connection timed out, running with offline defaults.");
  }

  lastPollTime = millis();
  lastSlideSwitch = millis();
}

// -----------------------------------------------------------------------------
// 8. MAIN LOOP
// -----------------------------------------------------------------------------
void loop() {
  unsigned long now = millis();

  // 1. Periodic Rate Polling
  if (now - lastPollTime >= POLL_INTERVAL_MS) {
    lastPollTime = now;
    fetchGoldRates();
  }

  // 2. Slide Carousel Animation
  if (now - lastSlideSwitch >= SLIDE_DURATION_MS) {
    lastSlideSwitch = now;
    currentSlide = (currentSlide + 1) % 5; // 5 slides (22k, 21k, 18k, trad, silver)
    renderDisplay();
  }

  // Yield to background WiFi tasks
  delay(50);
}
