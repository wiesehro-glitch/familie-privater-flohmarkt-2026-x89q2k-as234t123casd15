import admin from 'firebase-admin';
import fs from 'node:fs';

const stateFile = '.push-state.json';
const account = process.env.FIREBASE_SERVICE_ACCOUNT;
const apiKey = process.env.ONESIGNAL_API_KEY;
const appId = 'd995586b-0704-4b86-b60a-ccb14de93095';

if (!account || !apiKey) {
  throw new Error('GitHub Secrets FIREBASE_SERVICE_ACCOUNT und ONESIGNAL_API_KEY fehlen.');
}

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(account)) });
const db = admin.firestore();
const snapshot = await db.collection('angebote').get();
const docs = snapshot.docs.filter(d => d.data().status !== 'archived');
const currentIds = new Set(snapshot.docs.map(d => d.id));

let state;
try {
  state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
} catch {
  state = null;
}

// First run creates the baseline without sending old articles.
if (!state || !Array.isArray(state.ids)) {
  fs.writeFileSync(stateFile, JSON.stringify({ ids: [...currentIds] }, null, 2) + '\n');
  console.log(`Erstlauf: ${currentIds.size} vorhandene Artikel als Basis gespeichert; kein Push.`);
  process.exit(0);
}

const processed = new Set(state.ids);
const fresh = docs
  .filter(d => !processed.has(d.id))
  .sort((a, b) => (a.data().timestamp || 0) - (b.data().timestamp || 0));

console.log(`${fresh.length} neue Artikel gefunden.`);

function saveState() {
  fs.writeFileSync(
    stateFile,
    JSON.stringify({ ids: [...processed].filter(id => currentIds.has(id)) }, null, 2) + '\n'
  );
}

for (const doc of fresh) {
  const item = doc.data();
  const name = String(item.name || 'Artikel').slice(0, 100);
  const seller = String(item.sellerName || 'Jemand').slice(0, 70);
  const url = 'https://wiesehro-glitch.github.io/familie-privater-flohmarkt-2026-x89q2k-as234t123casd15/?item=' + encodeURIComponent(doc.id);

  // OneSignal's built-in "All" segment targets subscribed push devices.
  // Unlike a fixed subscription ID, this also includes future family members.
  const res = await fetch('https://api.onesignal.com/notifications?c=push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Key ${apiKey}`
    },
    body: JSON.stringify({
      app_id: appId,
      target_channel: 'push',
      included_segments: ['All'],
      headings: { en: 'Neuer Floh-Artikel! 🎉' },
      contents: { en: `${seller} hat "${name}" eingestellt.` },
      url
    })
  });

  const result = await res.text();
  if (!res.ok) throw new Error(`OneSignal HTTP ${res.status}: ${result.slice(0, 1000)}`);

  let response;
  try {
    response = JSON.parse(result);
  } catch {
    throw new Error('OneSignal-Antwort ist kein JSON.');
  }
  if (!response.id || response.errors) {
    throw new Error(`OneSignal hat Nachricht nicht angenommen: ${result.slice(0, 1000)}`);
  }

  console.log(`Push angenommen für Artikel ${doc.id}, OneSignal-ID ${response.id}`);
  processed.add(doc.id);
  saveState();
}

saveState();
