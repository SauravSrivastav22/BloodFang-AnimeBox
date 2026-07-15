// Firebase project config.
//
// These values are PUBLIC client keys — safe to commit (they identify your
// project, they don't grant access; Firestore security rules do that).
//
// Fill them in from the Firebase console:
//   Project settings → General → "Your apps" → Web app → SDK setup & config.
// See FIREBASE_SETUP.md for the full step-by-step.
//
// Until apiKey + projectId are set, sign-in stays disabled and BloodFang runs
// fully local (localStorage only) exactly as before.
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
}

export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)
