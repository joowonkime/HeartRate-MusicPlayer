// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional


const firebaseConfig = {
  apiKey: "AIzaSyDhiH8764lugxjYlaz5FLBTusB8Nj10XV8",
  authDomain: "heartrate-music-app.firebaseapp.com",
  databaseURL: "https://heartrate-music-app-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "heartrate-music-app",
  storageBucket: "heartrate-music-app.firebasestorage.app",
  messagingSenderId: "784275823178",
  appId: "1:784275823178:web:23747f2e7cedb6ea2424b3",
  measurementId: "G-CPNHWPNTN4"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const rtdb = getDatabase(app);