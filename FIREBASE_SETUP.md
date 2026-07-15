# BloodFang — Google Sign-in & Cloud Sync setup

This makes **"Sign in with Google"** work so your data (My List, Continue
Watching, watched episodes, settings) syncs across every device that runs the
app. It uses **Firebase** (Google's own service) — free tier is far more than
enough. No changes to the anime backend; sign-in is all client-side.

Until you finish these steps, the app runs exactly as before (local-only) and
the **Sign in** button stays hidden.

---

## What you'll do (≈5 minutes)

### 1. Create a Firebase project
1. Go to <https://console.firebase.google.com> and sign in with your Gmail.
2. **Add project** → give it a name (e.g. `bloodfang`) → you can disable
   Google Analytics → **Create project**.

### 2. Register a Web app & copy the config
1. On the project overview, click the **Web** icon `</>`.
2. Give it a nickname (e.g. `bloodfang-web`), **don't** check Firebase Hosting →
   **Register app**.
3. You'll see a `firebaseConfig = { ... }` block. Copy those values into
   **`src/firebase-config.js`** (apiKey, authDomain, projectId, storageBucket,
   messagingSenderId, appId). These are public client keys — safe to keep in the
   repo.

### 3. Turn on Google sign-in
1. Left menu → **Build → Authentication → Get started**.
2. **Sign-in method** tab → **Google** → toggle **Enable** → pick a support
   email → **Save**.

### 4. Create the database
1. Left menu → **Build → Firestore Database → Create database**.
2. Choose **Production mode** → pick a location near you → **Enable**.

### 5. Lock the database to each user (security rules)
In Firestore → **Rules** tab, replace everything with this and **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

This means: a signed-in user can read/write **only their own** data. Nobody
else can touch it.

### 6. Run it
```
npm run prod        →  http://localhost:3001
```
Click **Sign in** (top-right) → the Google popup → done. Your data now syncs.

---

## Using it on another device

Run the app on the other device (clone the repo + `npm run prod`) with the
**same `src/firebase-config.js`**, then **Sign in with the same Google account**.
Your list/history/progress merge in automatically — the sync is a **union**, so
nothing already saved on either device is lost.

- `localhost` is authorized by Firebase out of the box. If you open the app via
  a LAN IP (e.g. `http://192.168.x.x:3001`) instead of localhost, add that host
  under **Authentication → Settings → Authorized domains**.
- 📱 Phones: your *data* will sync, but *playback* won't work on a phone — the
  free video embeds need a local Node backend + localhost. Treat a phone as
  "view/manage my list" only.

---

## Notes
- Turning this off again: blank out `apiKey`/`projectId` in
  `src/firebase-config.js` → sign-in disappears, app returns to local-only.
- Your data doc lives at Firestore path `users/{your-uid}` as one small JSON
  blob (`history`, `favorites`, `watched`, `settings`).
- Firebase loads as a lazy chunk — it's only downloaded the moment you click
  Sign in, so it doesn't slow down normal browsing.
