# Firebase設定手順

## 初回セットアップ

### 1. Firebaseプロジェクトの作成

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. 「プロジェクトを追加」をクリック
3. プロジェクト名を入力（例: routelog-sato）
4. Google アナリティクスの設定（任意）
5. プロジェクトを作成

### 2. Firestoreデータベースの有効化

1. 左側メニューから「ビルド」→「Firestore Database」をクリック
2. 「データベースの作成」をクリック
3. モードを選択:
   - **テストモード**: 開発用（30日間は誰でもアクセス可能）
   - **本番環境モード**: 本番用（認証が必要）
4. ロケーションを選択: `asia-northeast1`（東京）または `asia-northeast2`（大阪）
5. 「有効にする」をクリック

### 3. Firebase設定の取得

1. プロジェクトの設定（歯車アイコン）をクリック
2. 「マイアプリ」セクションで「ウェブアプリを追加」（`</>`アイコン）をクリック
3. アプリのニックネームを入力（例: RouteLogger）
4. 「Firebase SDK スニペット」から「構成」を選択
5. `firebaseConfig` オブジェクトをコピー

### 4. ローカル設定ファイルの作成

1. `firebase-config.template.js` を `firebase-config.js` にコピー:
   ```bash
   cp firebase-config.template.js firebase-config.js
   ```

2. `firebase-config.js` を開いて、コピーした設定を貼り付け:
   ```javascript
   const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project",
     storageBucket: "your-project.firebasestorage.app",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef"
   };
   ```

### 5. セキュリティルールの設定（重要）

1. Firestore Databaseページで「ルール」タブをクリック
2. 以下のルールを設定:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // projectsコレクションへのアクセス
    match /projects/{projectId} {
      // 誰でも読み取り可能
      allow read: if true;
      // 誰でも書き込み可能（必要に応じて認証を追加）
      allow write: if true;

      // サブコレクションも同様
      match /{document=**} {
        allow read, write: if true;
      }
    }
  }
}
```

3. 「公開」をクリック

## 重要な注意事項

⚠️ **firebase-config.js は .gitignore に追加されています**

- このファイルにはAPIキーが含まれるため、GitHubにコミットしないでください
- 各開発者は自分の環境で上記の手順に従って設定してください
- 本番環境では環境変数や安全なシークレット管理を使用することを推奨します

## データ構造

Firestoreに保存されるデータ構造:

```
projects/
  └─ {yyyy-MM-ddThh:mm}/
      ├─ startTime: "2025-12-14T15:30"
      ├─ createdAt: Timestamp
      ├─ lastPosition: {lat, lng, zoom, timestamp}
      ├─ tracksCount: 1
      ├─ photosCount: 3
      ├─ tracks/
      │   └─ {autoId}/
      │       ├─ timestamp: "2025-12-14T15:35:22.123Z"
      │       ├─ points: [{lat, lng, timestamp, accuracy}, ...]
      │       └─ totalPoints: 150
      └─ photos/
          └─ {autoId}/
              ├─ data: "data:image/jpeg;base64,..."
              ├─ timestamp: "2025-12-14T15:40:10.456Z"
              └─ location: {lat, lng}
```
