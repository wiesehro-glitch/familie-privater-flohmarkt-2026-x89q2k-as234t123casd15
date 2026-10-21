import admin from 'firebase-admin';
import fs from 'node:fs';
const stateFile = '.push-state.json';
const account = process.env.FIREBASE_SERVICE_ACCOUNT;
const apiKey = process.env.ONESIGNAL_API_KEY;
if (!account || !apiKey) throw new Error('GitHub Secrets FIREBASE_SERVICE_ACCOUNT und ONESIGNAL_API_KEY fehlen.');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(account)) });
const db = admin.firestore();
const snapshot = await db.collection('angebote').get();
const docs = snapshot.docs.filter(d => d.data().status !== 'archived');
const currentIds = new Set(snapshot.docs.map(d => d.id));
let state;
try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { state = null; }
// Initial run only sets a baseline; never send notifications for old articles.
if (!state || !Array.isArray(state.ids)) {
  fs.writeFileSync(stateFile, JSON.stringify({ ids: [...currentIds] }, null, 2) + '\n');
  console.log(`Erstlauf: ${currentIds.size} vorhandene Artikel als Basis gespeichert; kein Push.`);
  process.exit(0);
}
const processed = new Set(state.ids);
const fresh = docs.filter(d => !processed.has(d.id)).sort((a,b) => (a.data().timestamp||0)-(b.data().timestamp||0));
console.log(`${fresh.length} neue Artikel gefunden.`);
for (const doc of fresh) {
  const item = doc.data();
  const name = String(item.name || 'Artikel').slice(0, 100);
  const seller = String(item.sellerName || 'Jemand').slice(0, 70);
  const url = 'https://wiesehro-glitch.github.io/familie-privater-flohmarkt-2026-x89q2k-as234t123casd15/?item=' + encodeURIComponent(doc.id);
  const res = await fetch('https://api.onesignal.com/notifications?c=push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${apiKey}` },
    body: JSON.stringify({
      app_id: 'd995586b-0704-4b86-b60a-ccb14de93095',
      included_segments: ['Subscribed Users'],
      headings: { en: 'Neuer Floh-Artikel! 🎉' },
      contents: { en: `${seller} hat "${name}" eingestellt.` },
      url
    })
  });
  const result = await res.text();
  if (!res.ok) throw new Error(`OneSignal HTTP ${res.status}: ${result.slice(0, 1000)}`);
  let response; try { response = JSON.parse(result); } catch { throw new Error('OneSignal-Antwort ist kein JSON.'); }
  if (!response.id || response.errors) throw new Error(`OneSignal hat Nachricht nicht angenommen: ${result.slice(0,1000)}`);
  console.log(`Push gesendet für Artikel ${doc.id}, OneSignal-ID ${response.id}`);
  processed.add(doc.id);
  // Persist after each accepted message so a later failure does not resend successful items.
  fs.writeFileSync(stateFile, JSON.stringify({ ids: [...processed].filter(id => currentIds.has(id)) }, null, 2) + '\n');
}
// Remove deleted IDs, keep processed archived IDs until deletion.
fs.writeFileSync(stateFile, JSON.stringify({ ids: [...processed].filter(id => currentIds.has(id)) }, null, 2) + '\n');
