// Firebase設定ファイル
// 使用方法:
// 1. Firebaseコンソール（https://console.firebase.google.com/）でプロジェクトを作成
// 2. プロジェクト設定からFirebase SDKの設定をコピー
// 3. 下記のfirebaseConfigオブジェクトに貼り付け

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC5amCLJY0IPT_wNr9RWM8kOjjh1QRJO7o",
  authDomain: "walklog-sato.firebaseapp.com",
  projectId: "walklog-sato",
  storageBucket: "walklog-sato.firebasestorage.app",
  messagingSenderId: "145596418326",
  appId: "1:145596418326:web:967a9df31c52949c7ca837"
};

// Firebaseアプリの初期化
firebase.initializeApp(firebaseConfig);

// Firestoreの参照を取得
const firestoreDb = firebase.firestore();

// Storageの参照を取得
const storage = firebase.storage();

console.log('Firebase初期化完了');
