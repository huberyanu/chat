# Gruppenraum

Ein kleiner Gruppenchat mit drei getrennten, passwortgeschützten Räumen. Beim ersten Besuch wird ein Name abgefragt, der im Browser gespeichert und über den Nachrichten angezeigt wird. Nachrichten und Bilder werden gemeinsam auf dem Server gespeichert; offene Chats aktualisieren sich automatisch.

## Lokal starten

PowerShell 7 ist bereits ausreichend, weitere Pakete werden nicht benötigt:

```powershell
pwsh -ExecutionPolicy Bypass -File .\server.ps1
```

Danach im Browser http://localhost:8080 öffnen. Mit `Strg+C` wird der Server beendet.

## Zugangsdaten und Verlauf

Die Gruppenpasswörter werden über `CHAT_GROUP_1_PASSWORD`, `CHAT_GROUP_2_PASSWORD` und `CHAT_GROUP_3_PASSWORD` konfiguriert. Lokal lädt der Server dafür `local-secrets.ps1`, das absichtlich in `.gitignore` steht und nicht hochgeladen werden darf. Auf dem Hosting-Anbieter werden die Werte als Umgebungsvariablen hinterlegt.

Die Freischaltung und der Name werden pro Browser gespeichert. Der gemeinsame Verlauf mit Texten und Bildern liegt standardmäßig in `chat-data.json` und bleibt bei einem Serverneustart erhalten. Diese Datei wird nicht zu GitHub hochgeladen. Für Hosting mit flüchtigem Dateisystem muss `CHAT_DATA_PATH` auf ein dauerhaftes Speichervolume zeigen.

## Zugriff im Netzwerk

Für andere Geräte im selben Netzwerk kann der Server an alle Netzwerkschnittstellen gebunden werden:

```powershell
$env:CHAT_HOST = '+'
pwsh -ExecutionPolicy Bypass -File .\server.ps1
```

Öffne auf den anderen Geräten `http://<IP-des-Servers>:8080`. Windows-Firewall und HTTP-URL-Berechtigungen können den Zugriff blockieren. Für Zugriff über das Internet den Server auf einem erreichbaren Rechner betreiben und einen HTTPS-Reverse-Proxy davor schalten; den unverschlüsselten HTTP-Port nicht direkt öffentlich freigeben.