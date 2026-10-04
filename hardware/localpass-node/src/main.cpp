#include <Arduino.h>
#include <DNSServer.h>
#include <ESP8266WebServer.h>
#include <ESP8266WiFi.h>
#include <LittleFS.h>

namespace {
constexpr char kSsid[] = "LocalPass-Guatape";
constexpr byte kDnsPort = 53;

DNSServer dnsServer;
ESP8266WebServer server(80);

void sendFile(const char* path, const char* contentType, bool attachment = false) {
  if (!LittleFS.exists(path)) {
    server.send(404, "text/plain", "Not found");
    return;
  }

  File file = LittleFS.open(path, "r");
  if (attachment) {
    server.sendHeader("Content-Disposition", "attachment; filename=\"localpass-guatape-pack.json\"");
  }
  server.streamFile(file, contentType);
  file.close();
}

void redirectToPortal() {
  server.sendHeader("Location", String("http://") + WiFi.softAPIP().toString(), true);
  server.send(302, "text/plain", "");
}
}  // namespace

void setup() {
  Serial.begin(115200);
  delay(100);

  if (!LittleFS.begin()) {
    Serial.println("[LocalPass Node] LittleFS mount failed");
  }

  WiFi.mode(WIFI_AP);
  WiFi.softAP(kSsid);

  const IPAddress ip = WiFi.softAPIP();
  dnsServer.start(kDnsPort, "*", ip);

  server.on("/", HTTP_GET, []() { sendFile("/index.html", "text/html"); });
  server.on("/pack.json", HTTP_GET, []() {
    server.sendHeader("Cache-Control", "no-store");
    sendFile("/pack.json", "application/json", true);
  });
  server.on("/health", HTTP_GET, []() {
    String body = "{\"status\":\"ready\",\"ssid\":\"";
    body += kSsid;
    body += "\",\"ip\":\"";
    body += WiFi.softAPIP().toString();
    body += "\",\"clients\":";
    body += WiFi.softAPgetStationNum();
    body += "}";
    server.send(200, "application/json", body);
  });

  // Common captive-portal probes.
  server.on("/generate_204", HTTP_ANY, redirectToPortal);
  server.on("/hotspot-detect.html", HTTP_ANY, redirectToPortal);
  server.on("/ncsi.txt", HTTP_ANY, redirectToPortal);
  server.onNotFound(redirectToPortal);

  server.begin();

  Serial.println();
  Serial.println("[LocalPass Node] ready");
  Serial.print("[LocalPass Node] SSID: ");
  Serial.println(kSsid);
  Serial.print("[LocalPass Node] portal: http://");
  Serial.println(ip);
}

void loop() {
  dnsServer.processNextRequest();
  server.handleClient();
}
