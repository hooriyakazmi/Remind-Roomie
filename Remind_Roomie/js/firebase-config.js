import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBQtHCzCdYqEWc16NgVLNv38vcjjUJ8d6c",
  authDomain: "remind-roomie.firebaseapp.com",
  projectId: "remind-roomie",
  storageBucket: "remind-roomie.firebasestorage.app",
  messagingSenderId: "322296665509",
  appId: "1:322296665509:web:2e7bbad190a7098484844c",
  measurementId: "G-KV1WEZD5KN"
};

// Keep one shared Firebase app, auth client, and Firestore connection for all modules.
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
