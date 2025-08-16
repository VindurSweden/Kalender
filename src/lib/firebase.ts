// Import the functions you need from the SDKs you need
import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
// IMPORTANT: This is a public configuration and is safe to expose.
// Security is handled by Firestore Security Rules.
const firebaseConfig = {
  "projectId": "visucal",
  "appId": "1:186821710285:web:fe429b1466fa06a6d8f484",
  "storageBucket": "visucal.appspot.com", // Correct storage bucket
  "apiKey": "AIzaSyDm9L5jWkUjd1ibtUrxnp_sNcAEKr8aqEU",
  "authDomain": "visucal.firebaseapp.com",
  "measurementId": "",
  "messagingSenderId": "186821710285"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Cloud Firestore and get a reference to the service
const db = getFirestore(app);
const storage = getStorage(app);

export { app, db, storage };
