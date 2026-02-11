import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {
  getFirestore,
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  collection,
  getDocs,
  getCountFromServer,
  query,
  orderBy,
  limit,
  where,
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCbRwJz6nyxIcSX9bJKuBLJFcZ_bd2H52k",
  authDomain: "maayping.firebaseapp.com",
  projectId: "maayping",
  storageBucket: "maayping.firebasestorage.app",
  messagingSenderId: "283306223970",
  appId: "1:283306223970:web:250434221fb8700e01e43b",
  measurementId: "G-PD37MM20DR",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

export {
  app,
  auth,
  provider,
  db,
  serverTimestamp,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  collection,
  getDocs,
  getCountFromServer,
  query,
  orderBy,
  limit,
  where,
};
