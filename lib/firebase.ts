// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyD9WbJ67hoqHik3qrvPBEddWRNafM5rDHY",
    authDomain: "frizerie-9249d.firebaseapp.com",
    projectId: "frizerie-9249d",
    storageBucket: "frizerie-9249d.firebasestorage.app",
    messagingSenderId: "155604046795",
    appId: "1:155604046795:web:9db2174eca88614e4c9c4e",
    measurementId: "G-V9E9FKBPE7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);