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
  apiKey: 'AIzaSyAnCauW-ye6Q0VmCRTP4ZSFGoRjBpMtI3I',
  authDomain: 'bloodfang-anime.firebaseapp.com',
  projectId: 'bloodfang-anime',
  storageBucket: 'bloodfang-anime.firebasestorage.app',
  messagingSenderId: '946900014396',
  appId: '1:946900014396:web:f82a9a09635d19834e3a39',
}

export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)
