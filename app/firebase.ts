// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app"
import { getFirestore } from "firebase/firestore"

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyD9WbJ67hoqHik3qrvPBEddWRNafM5rDHY",
    authDomain: "frizerie-9249d.firebaseapp.com",
    projectId: "frizerie-9249d",
    storageBucket: "frizerie-9249d.firebasestorage.app",
    messagingSenderId: "155604046795",
    appId: "1:155604046795:web:9db2174eca88614e4c9c4e",
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)

// Initialize Firestore
export const db = getFirestore(app)

export default app
