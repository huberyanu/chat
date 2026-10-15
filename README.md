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

Die Freischaltung und der Name werden pro Browser gespeichert. Beim lokalen PowerShell-Server liegt der gemeinsame Verlauf mit Texten und Bildern in `chat-data.json`. Diese Datei wird nicht zu GitHub hochgeladen.

## Dauerhaft auf Cloudflare Workers veröffentlichen

Die Cloudflare-Worker-Version verwendet Workers Static Assets für die Oberfläche und eine D1-Datenbank für Nachrichten und Bilder. Für Bilder gilt dort ein Limit von 1 MB. Die vorhandenen Nachrichten in der lokalen `chat-data.json` werden nicht automatisch in die Cloud übertragen.

1. Installiere Node.js LTS und führe `npm install` aus.
2. Melde dich mit `npx wrangler login` bei Cloudflare an.
3. Registriere im Cloudflare-Dashboard einmalig eine freie `workers.dev`-Konto-Subdomain unter Workers & Pages. Ohne diese Konto-Einstellung wird der Worker-Link nicht aufgelöst. Danach die Datenbank mit `npx wrangler d1 create gruppenraum-chat` erstellen und die ausgegebene `database_id` in `wrangler.jsonc` übernehmen.
4. Wende das Schema mit `npx wrangler d1 migrations apply gruppenraum-chat --remote` an.
5. Lade die drei Gruppenpasswörter mit `npx wrangler secret put CHAT_GROUP_1_PASSWORD`, `CHAT_GROUP_2_PASSWORD` und `CHAT_GROUP_3_PASSWORD` hoch. Gib die Werte jeweils nur im lokalen Terminal ein.
6. Veröffentliche mit `npm run deploy`. Cloudflare gibt eine feste `workers.dev`-Adresse aus.

Workers und D1 haben kostenlose Nutzungsgrenzen; bei Überschreitung des Free-Tarifs schlagen weitere Vorgänge fehl, statt automatisch in einen bezahlten Tarif zu wechseln. Aktuelle Details: https://developers.cloudflare.com/workers/platform/pricing/ und https://developers.cloudflare.com/d1/platform/pricing/.

## Zugriff im Netzwerk

Für andere Geräte im selben Netzwerk kann der Server an alle Netzwerkschnittstellen gebunden werden:

```powershell
$env:CHAT_HOST = '+'
pwsh -ExecutionPolicy Bypass -File .\server.ps1
```

Öffne auf den anderen Geräten `http://<IP-des-Servers>:8080`. Windows-Firewall und HTTP-URL-Berechtigungen können den Zugriff blockieren. Für Zugriff über das Internet den Server auf einem erreichbaren Rechner betreiben und einen HTTPS-Reverse-Proxy davor schalten; den unverschlüsselten HTTP-Port nicht direkt öffentlich freigeben.