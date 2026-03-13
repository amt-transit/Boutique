// src/firebase.js
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, sendPasswordResetEmail, deleteUser
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, 
    onSnapshot, query, where, orderBy, limit, serverTimestamp, writeBatch, deleteDoc, 
    increment, setLogLevel, initializeFirestore, persistentLocalCache
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export const firebaseConfig = {
    apiKey: "AIzaSyCluRVv-olQsTuZZBPjjJns1jHq0vkhjSw",
    authDomain: "maboutique-7891.firebaseapp.com",
    projectId: "maboutique-7891",
    storageBucket: "maboutique-7891.firebasestorage.app",
    messagingSenderId: "402820959115",
    appId: "1:402820959115:web:6fb6b2c78fc9c5fe203d8e"
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {localCache: persistentLocalCache()});
console.log("Mode hors-ligne activé");

const auth = getAuth(app);
setLogLevel('error');

export { 
    db, 
    auth, 
    app,
    // Auth exports
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    signOut, 
    createUserWithEmailAndPassword, 
    sendPasswordResetEmail,
    deleteUser,
    deleteApp,
    getAuth,
    initializeApp,
    // Firestore exports
    getFirestore,
    collection, 
    doc, 
    getDoc, 
    getDocs, 
    setDoc, 
    addDoc, 
    updateDoc, 
    onSnapshot, 
    query, 
    where, 
    orderBy, 
    limit, 
    serverTimestamp, 
    writeBatch, 
    deleteDoc, 
    increment
};
