// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
// IMPORTANT: This is a public configuration and is safe to expose.
// Security is handled by Firestore Security Rules.
const firebaseConfig = {
  "projectId": "visucal",
  "appId": "1:186821710285:web:fe429b1466fa06a6d8f484",
  "storageBucket": "visucal.firebasestorage.app",
  "apiKey": "AIzaSyDm9L5jWkUjd1ibtUrxnp_sNcAEKr88aqEU",
  "authDomain": "visucal.firebaseapp.com",
  "measurementId": "",
  "messagingSenderId": "186821710285"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
const db = getFirestore(app);

export { app, db };
