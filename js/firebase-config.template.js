// Firebase設定ファイルのテンプレート
// 使用方法:
// 1. このファイルを firebase-config.js にコピー
// 2. Firebaseコンソール（https://console.firebase.google.com/）でプロジェクトを作成
// 3. プロジェクト設定からFirebase SDKの設定をコピー
// 4. 下記のfirebaseConfigオブジェクトに貼り付け

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Firebaseアプリの初期化
firebase.initializeApp(firebaseConfig);

// Firestoreの参照を取得
const db = firebase.firestore();

console.log('Firebase初期化完了');
