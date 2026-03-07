# RouteLogger 機能仕様書

**バージョン:** 202603
**最終更新日:** 2026年3月7日

---

## 1. 概要

### 1.1 アプリケーション名
RouteLogger - GPS位置記録

### 1.2 目的
地理院地図上に現在地を表示し、GPS位置と写真を記録するPWA（Progressive Web App）。ウォーキングやハイキングなどのアウトドア活動で位置情報と写真を同時に記録・管理できる。

### 1.3 動作環境
- **プラットフォーム:** Webブラウザ（PWA対応）
- **対応ブラウザ:** Chrome、Safari、Firefox（Geolocation API、Camera API対応ブラウザ）
- **必須環境:** HTTPS環境またはlocalhost（Geolocation API、Camera APIの要件）

### 1.4 技術スタック
| 項目 | 技術 |
|------|------|
| 地図 | Leaflet.js 1.9.4 + 国土地理院タイル |
| フロントエンド | Vanilla JavaScript (ES6モジュール) |
| スタイル | カスタムCSS（レスポンシブ対応） |
| ローカルストレージ | IndexedDB (v4) |
| クラウドストレージ | Firebase (Firestore + Storage) |
| 認証 | Firebase Anonymous Authentication |
| PWA | Service Worker + Web App Manifest |

---

## 2. 画面構成

### 2.1 メイン画面
- **時計表示:** 地図上部に現在時刻（HH:mm）を表示（設定でON/OFF可能）
- **地図表示領域:** 国土地理院地図を全画面表示
- **ステータス表示:** 画面上部に現在のステータスと座標情報を表示
- **コントロールパネル:** 画面下部にStart/Stop/Photo/Data/Settingsボタンを配置
- **データ管理パネル:** Dataボタンで表示切り替え（List/Size/Save/Reload/Clearボタン）

### 2.2 ダイアログ
| ダイアログ名 | 用途 |
|-------------|------|
| 写真一覧ダイアログ | 保存済み写真のグリッド表示 |
| 写真拡大ダイアログ | 選択写真の拡大表示と詳細情報・ナビゲーション |
| カメラダイアログ | 写真撮影UI（方向ダイアル・facing選択） |
| 記録統計ダイアログ | データサイズ・記録統計の表示 |
| ドキュメント選択ダイアログ | Firebase保存データの読み込み選択 |
| ドキュメント名入力ダイアログ | 保存時のファイル/ドキュメント名入力（タイトルが保存先に応じて変わる） |
| データ初期化確認ダイアログ | Start時の既存データ確認 |
| 設定ダイアログ | アプリ設定（時計・Firebase・方向ボタン） |

---

## 3. 機能詳細

### 3.1 GPS追跡機能

#### 3.1.1 GPS追跡開始（Startボタン）
- **状態:** 初期状態で有効、追跡中は無効
- **動作:**
  1. 既存データの確認ダイアログを表示
     - データがある場合: 「データ初期化」または「データ追記」を選択
     - データがない場合: 「新規記録を開始」または「キャンセル」を選択
  2. Wake Lock APIで画面スリープを防止
  3. iOS 13以降の場合、DeviceOrientation許可を要求
  4. Geolocation API（watchPosition）でGPS追跡を開始
  5. GPS位置を以下の条件で記録:
     - 初回は必ず記録
     - 60秒以上経過、または20m以上移動した場合に記録（GPSの精度を超えて移動した場合のみ）
- **GPS位置オプション:**
  - `enableHighAccuracy: true`
  - `timeout: 10000ms`
  - `maximumAge: 0`

#### 3.1.2 GPS追跡停止（Stopボタン）
- **状態:** 追跡開始後に有効
- **動作:**
  1. GPS監視（watchPosition）を停止
  2. Wake Lockを解放
  3. トラッキングデータをIndexedDBに最終保存
  4. 最後の記録地点を保存

#### 3.1.3 記録点数の表示
- 追跡中のステータス表示には、現在のセッションの記録点数だけでなく、既存トラックの点数も含めた**合計記録点数**を表示

#### 3.1.4 位置データ形式
```javascript
{
    lat: number,      // 緯度（小数点以下5桁）
    lng: number,      // 経度（小数点以下5桁）
    timestamp: string, // ISO 8601形式
    accuracy: number,  // 精度（小数点以下1桁、メートル）
    altitude: number | null, // 高度（利用可能な場合）
    heading: number,   // 進行方向
    speed: number      // 速度
}
```

### 3.2 写真撮影機能

#### 3.2.1 撮影フロー（Photoボタン）
- **状態:** GPS追跡中のみ有効
- **動作:**
  1. カメラダイアログを表示
  2. 背面カメラでプレビュー表示（width:ideal 1920, height:ideal 1080）
  3. シャッターボタンで撮影（PHOTO_WIDTH×PHOTO_HEIGHTにクロップ・リサイズして保存）
  4. プレビュー確認画面を表示
      - **Retake**ボタン: 再撮影（カメラ画面に戻る、現在の編集状態をリセット）
      - **Text**ボタン: テキストメモを入力（**テキストが入力済みの場合はボタンが青色に変わる**）（保存済み写真の場合は即座に更新）
      - **方向ダイアル**: ドラッグまたは±ボタンで撮影角度を10°単位で設定（-180°〜+180°）
      - **Forward/Backward**: 進行方向前方向 / 後方向を選択（設定でボタン非表示可能）
      - 閉じるボタン: カメラモードを終了
  5. Forward/Backwardボタンをタップすると:
     - 現在の角度・facing設定で保存（または更新）
     - 矢印スタンプを画像下部に描画（角度に応じて回転）
     - 現在のGPS位置情報を紐付け
     - **上書き保存:** 同セッション内で既に保存済みの写真を方向変更した場合は既存データを更新
     - IndexedDBに保存/更新
     - 地図上に写真マーカー（オレンジ色の丸）を追加/更新
     - 保存後もプレビュー画面を維持し、方向の変更やテキストの修正が可能

#### 3.2.2 方向ダイアル仕様
- **角度範囲:** -180°〜+180°（10°単位スナップ）
- **操作方法:**
  - ドラッグ（タッチ/マウス）: ダイアル中心を基準に指の角度を検出
  - ±ボタン: 10°単位で増減
- **facing設定:** Forward（前向き）/ Backward（後ろ向き）をトグルで選択（排他的）
  - 設定「Show Facing Buttons」がOFFの場合はForward/Backwardボタンを非表示

#### 3.2.3 写真データ形式
```javascript
{
    data: string,          // Base64形式の画像データ（JPEG、品質0.6、矢印スタンプ済み）
    timestamp: string,     // ISO 8601形式
    direction: number,     // 角度（度数、-180〜+180、0=正面、正=右、負=左）
    facing: string | null, // "forward" | "backward" | null
    location: {
        lat: number,       // 緯度（小数点以下5桁）
        lng: number,       // 経度（小数点以下5桁）
        accuracy: number   // 精度
    },
    text: string | null    // 写真へのメモテキスト
}
```

> **後方互換:** 旧バージョンで保存した `direction: "left" | "up" | "right"` 形式も読み込み可能（表示時に変換）

#### 3.2.4 写真マーカータップ時の表示
- 地図上の写真マーカーをタップすると写真拡大ビューアが開く
- **必ずIndexedDBから最新データを取得して表示する**（マーカー作成時のphotoオブジェクトは古い可能性があるため）
- これにより、マーカー作成後に方向（facing）を変更した場合も最新の状態が反映される

### 3.3 データ管理機能

#### 3.3.1 写真一覧（Listボタン）
- 保存済み写真をグリッド表示
- サムネイルクリックで拡大表示
- 拡大表示時に撮影日時、位置情報、方向角度、facing、テキストメモを表示
- 前後ナビゲーションボタンで写真切り替え

#### 3.3.2 データサイズ表示（Sizeボタン）
- 表示項目:
  - トラック件数と位置記録点数
  - GPSデータサイズ（KB/MB）
  - 写真枚数
  - 写真データサイズ（KB/MB）
  - 写真解像度

#### 3.3.3 データ保存（Saveボタン）

**Firebase ONの場合（クラウド保存）:**
- **前提条件:** GPS追跡を開始した後のみ有効
- **動作:**
  1. ドキュメント名入力ダイアログを表示（タイトル: **"Save to cloud as..."**）
     - デフォルト名: `RLog-YYYYMMDD` JST日付
  2. 同名ドキュメントが存在する場合は自動で連番付与（例: `name_2`）
  3. 保存開始前にステータスに `Save to cloud as "{name}"...` を表示
  4. 写真をFirebase Storageにアップロード
  5. プロジェクトデータをFirestoreに保存
  6. Save/Load中はWake Lockを取得（画面スリープを防止）

**Firebase OFFの場合（KMZファイル保存）:**
- **前提条件:** なし（GPS追跡なしでも保存可能）
- **動作:**
  1. ファイル名入力ダイアログを表示（タイトル: **"Save to file as..."**）
     - デフォルト名: `RLog-YYYYMMDD` JST日付
  2. 保存開始前にステータスに `Save to file as "{name}.kmz"...` を表示
  3. KMZファイルを生成してダウンロード
     - `doc.kml`: GPSトラック（LineString）と写真位置（Point）のKML
     - `images/photo_{id}.jpg`: 写真ファイル（Base64→Binary変換）
     - MIMEタイプ: `application/vnd.google-earth.kmz`

#### 3.3.4 データ読み込み（Reloadボタン）

**Firebase ONの場合（クラウドから読み込み）:**
- Firestoreからプロジェクト一覧を取得（作成日時の降順）
- ドキュメント選択ダイアログを表示
- 選択したドキュメントのデータをIndexedDBに復元
- 地図上にトラックと写真マーカーを表示

**Firebase OFFの場合（ファイルから読み込み）:**
- ファイル選択ダイアログを表示（対応形式: `.kmz`, `.kml`, `.geojson`, `.json`, `.zip`）
- RouteLogger製KMZの場合: 現在データをクリアしてトラック・写真を復元
- 外部KMZ/GeoJSONの場合: 外部レイヤーとして地図上に表示（IndexedDBに保存）
- Save/Load中はWake Lockを取得（画面スリープを防止）

#### 3.3.5 データクリア（Clearボタン）
- 確認ダイアログを表示
- 「OK」の場合: 地図上のルート・マーカーを消去し、IndexedDBを初期化

### 3.4 外部データ表示機能

#### 3.4.1 外部KMZ/GeoJSONインポート
- RouteLogger製以外のKMZ/KML/GeoJSONファイルを外部レイヤーとして表示
- Firestoreの `externals` コレクション（IndexedDB）に保存
- 画像ファイルは `external_photos` ストアに保存
- アプリ起動時に自動復元

#### 3.4.2 KMZインポート判定
- KML内に `<atom:name>RouteLogger</atom:name>` タグがある場合: RouteLogger製として処理
- それ以外: 外部データとして処理（`toGeoJSON`ライブラリで変換）

### 3.5 設定機能

#### 3.5.1 設定項目
| 設定名 | デフォルト | 内容 |
|--------|----------|------|
| Show Clock | ON | 地図上に現在時刻を表示 |
| Use Firebase | OFF | Save/LoadをFirebase経由にする |
| Show Facing Buttons | ON | 写真撮影時のForward/Backwardボタンを表示 |

#### 3.5.2 設定の永続化
- `localStorage` に保存
  - `routeLogger_showClock`
  - `routeLogger_useFirebase`
  - `routeLogger_showFacingButtons`

### 3.6 時計表示機能
- 地図上に現在時刻を表示（HH:mm形式）
- 1秒ごとに更新
- 設定「Show Clock」でON/OFF切り替え可能
- ClearボタンのY軸上方に配置（safe-area対応）

### 3.7 地図表示機能

#### 3.7.1 地図設定
| 項目 | 値 |
|------|-----|
| タイルソース | 国土地理院標準地図 |
| 最小ズーム | 5 |
| 最大ズーム | 18 |
| 初期位置 | 最後の記録位置 or デフォルト（箕面大滝: 34.853667, 135.472041） |
| 初期ズーム | 13（デフォルト）/ 15（位置取得時） |

#### 3.7.2 マーカー表示
| マーカー種別 | 外観 | 用途 |
|-------------|------|------|
| 現在位置マーカー | 緑の三角形（矢印型） | 現在地と進行方向を表示 |
| 写真マーカー | オレンジ色の丸（12px） | 写真撮影位置を表示 |

#### 3.7.3 軌跡表示
- **色:** #4CAF50（緑）
- **線幅:** 4px
- **透明度:** 0.7

### 3.8 デバイス方向取得機能

#### 3.8.1 DeviceOrientation API
- iOS Safari: `webkitCompassHeading`を使用
- Android Chrome等: `alpha`値から方角を計算（`360 - alpha`）
- 現在位置マーカーの向きをリアルタイム更新

#### 3.8.2 GPSヘディング
- `position.coords.heading`が利用可能な場合はそちらを優先

### 3.9 画面スリープ防止機能（Wake Lock）

#### 3.9.1 Wake Lock APIの使用場面
| 場面 | Wake Lock | 解放タイミング |
|------|----------|-------------|
| GPS追跡中 | `state.wakeLock` | Stop時・ページ非表示時 |
| Save/Load中 | `_busyWakeLock`（ui-common内） | 操作完了時 |

- ページが再表示された時に追跡中のWake Lockを自動再取得
- 非対応ブラウザでは警告をコンソール出力

### 3.10 iOS Shake to Undo防止

iOS端末では、テキスト入力にフォーカスがある状態でデバイスを振ると「元に戻す」ダイアログが表示される場合がある。これを防ぐため以下の対策を実施：

- **ページ非表示時（`visibilitychange` → `hidden`）:** `document.activeElement.blur()` を呼び出し、フォーカスを強制解除する
- **ドキュメント名入力ダイアログ閉鎖時:** `cleanup()` 内で `input.blur()` を呼び出し、ダイアログ閉鎖後もフォーカスが残らないようにする

---

## 4. データ永続化

### 4.1 IndexedDB構成

#### 4.1.1 データベース情報
| 項目 | 値 |
|------|-----|
| データベース名 | RouteLoggerDB |
| バージョン | 4 |

#### 4.1.2 オブジェクトストア
| ストア名 | キー | インデックス | 用途 |
|----------|------|-------------|------|
| tracks | id (autoIncrement) | timestamp | トラッキングデータ |
| photos | id (autoIncrement) | timestamp | 写真データ |
| settings | key | - | 設定（最終位置など） |
| externals | id (autoIncrement) | - | 外部GeoJSONデータ |
| external_photos | id (autoIncrement) | - | 外部インポート写真 |

#### 4.1.3 tracksデータ構造
```javascript
{
    id: number,         // 自動採番
    timestamp: string,  // セッション開始時刻（ISO 8601）
    points: [{          // 位置データ配列
        lat: number,
        lng: number,
        timestamp: string,
        accuracy: number,
        altitude: number | null,
        heading: number,
        speed: number
    }],
    totalPoints: number // 記録点数
}
```

#### 4.1.4 photosデータ構造
```javascript
{
    id: number,            // 自動採番
    data: string,          // Base64画像データ（矢印スタンプ済み）
    timestamp: string,     // 撮影日時（ISO 8601）
    direction: number,     // 角度（度数、-180〜+180）
    facing: string | null, // "forward" | "backward" | null
    location: {
        lat: number,
        lng: number,
        accuracy: number
    },
    text: string | null    // 写真へのメモテキスト
}
```

### 4.2 Firebase構成

#### 4.2.1 Firestore構造
```
tracks/
  └── {docName}/            // ドキュメント名（RLog-YYYYMMDD等）
        ├── userId: string   // Firebase匿名認証UID
        ├── startTime: string
        ├── createdAt: timestamp
        ├── tracks: []       // トラック配列
        ├── photos: []       // 写真メタデータ配列（URLのみ、バイナリなし）
        ├── tracksCount: number
        └── photosCount: number
```

#### 4.2.2 Firebase Storage構造
```
tracks/
  └── {docName}/
        └── photos/
              └── {timestamp}.jpg   // 写真ファイル
```

#### 4.2.3 写真メタデータ（Firestore内）
```javascript
{
    url: string,           // Firebase Storage ダウンロードURL
    storagePath: string,   // Storageパス（tracks/{name}/photos/{ts}.jpg）
    timestamp: string,
    direction: number,     // 角度（度数）
    facing: string | null,
    location: { lat, lng, accuracy },
    text: string | null
}
```

---

## 5. PWA機能

### 5.1 Service Worker

#### 5.1.1 キャッシュ対象
- `./index.html`
- `./styles.css`
- `./manifest.json`
- `./js/firebase-config.js`
- `./js/app-main.js`（およびESモジュール群）
- Leaflet CSS/JS（CDN）

#### 5.1.2 キャッシュ戦略
| リソース種別 | 戦略 |
|-------------|------|
| 国土地理院タイル | ネットワーク優先（オフライン時は空レスポンス） |
| その他リソース | キャッシュ優先（キャッシュミス時はネットワーク取得後キャッシュ） |

#### 5.1.3 キャッシュバージョン
- 現在: `routelogger-v1`
- アップデート時は古いキャッシュを自動削除

### 5.2 Web App Manifest
| 項目 | 値 |
|------|-----|
| name | RouteLogger - GPS位置記録 |
| short_name | RouteLogger |
| display | standalone |
| orientation | portrait-primary |
| theme_color | #4CAF50 |
| background_color | #ffffff |
| lang | ja |

### 5.3 アイコン
| サイズ | ファイル |
|--------|----------|
| 180x180 | icons/icon-180.png |
| 192x192 | icons/icon-192.png |
| 512x512 | icons/icon-512.png |

---

## 6. UIコンポーネント

### 6.1 メインコントロールパネル
| ボタン | 色 | 機能 |
|--------|-----|------|
| Start | 緑 (#4CAF50) | GPS追跡開始 |
| Stop | 赤 (#f44336) | GPS追跡停止 |
| Photo | 青 (#2196F3) | 写真撮影 |
| Data | 紫 (#9C27B0) | データ管理パネル表示 |
| Settings | グレー (#607D8B) | 設定ダイアログ表示 |

### 6.2 データ管理パネル
| ボタン | 色 | 機能 |
|--------|-----|------|
| List | オレンジ (#FF9800) | 写真一覧表示 |
| Size | シアン (#00BCD4) | データサイズ表示 |
| Save | 緑 (#4CAF50) | Firebase保存 or KMZエクスポート |
| Reload | インディゴ (#3F51B5) | Firebase読み込み or ファイルインポート |
| Clear | グレー | データ初期化 |

### 6.3 設定ダイアログ
| 設定項目 | 種別 | デフォルト |
|---------|------|---------|
| Show Clock | トグルスイッチ | ON |
| Use Firebase | トグルスイッチ | OFF |
| Show Facing Buttons | トグルスイッチ | ON |

### 6.4 カメラUI
| 状態 | 表示要素 |
|------|----------|
| 撮影前 | カメラプレビュー、シャッターボタン（白丸）、閉じるボタン |
| 撮影後 | 撮影画像、方向ダイアル（SVG）、±ボタン、角度表示、Forward/Backwardボタン（設定次第）、Textボタン（テキスト入力済みの場合は青色）、Retakeボタン、閉じるボタン |

### 6.5 ドキュメント名入力ダイアログ
| 保存先 | ダイアログタイトル |
|--------|----------------|
| Firebase（クラウド） | Save to cloud as... |
| KMZファイル | Save to file as... |

---

## 7. エラーハンドリング

### 7.1 GPS関連エラー
| エラーコード | メッセージ |
|-------------|-----------|
| PERMISSION_DENIED | 位置情報の使用が許可されていません |
| POSITION_UNAVAILABLE | 位置情報が利用できません |
| TIMEOUT | 位置情報の取得がタイムアウトしました |

### 7.2 カメラ関連エラー
| エラー名 | メッセージ |
|---------|-----------|
| NotAllowedError | カメラの使用が許可されていません |
| NotFoundError | カメラが見つかりません |

### 7.3 Firebase関連エラー
- 認証エラー時は詳細なコンソールログを出力
- 写真アップロード失敗時は個別にスキップして続行
- 認証なしでもGPS記録は継続可能

### 7.4 IndexedDB関連エラー
- 初期化失敗時はアラートを表示してページ再読み込みを促す

---

## 8. 座標系・単位

### 8.1 座標系
- **測地系:** WGS84（世界測地系）
- **形式:** 10進数度（Decimal Degrees）
- **精度:** 緯度・経度ともに小数点以下5桁

### 8.2 データサイズ表示
- 10MB以下: KB単位
- 10MB超: MB単位

### 8.3 距離計算
- Haversine公式を使用
- 地球半径: 6,371,000m

---

## 9. 制限事項

### 9.1 ブラウザ制限
- Geolocation API: HTTPS必須（localhost除く）
- Camera API: HTTPS必須
- Wake Lock API: 一部ブラウザ非対応
- DeviceOrientation API: iOS 13以降は許可要求必須

### 9.2 Firebase制限
- 写真アップロード: Firebase認証必須
- プロジェクト名連番: 最大100まで

### 9.3 記録条件
- GPS位置は60秒以上経過または20m以上移動で記録
- 写真撮影はGPS追跡中のみ可能
- Firebaseを使用しない場合、Saveボタンに前提条件なし（GPS追跡なしでも保存可能）

---

## 10. ファイル構成

```
RouteLogger/
├── index.html              # メインHTML
├── styles.css              # スタイルシート
├── manifest.json           # PWAマニフェスト
├── service-worker.js       # Service Worker
├── js/                     # JavaScriptモジュール（ES6）
│   ├── app-main.js         # メイン初期化・イベント設定
│   ├── config.js           # 定数・設定値
│   ├── state.js            # グローバル状態管理
│   ├── utils.js            # ユーティリティ関数
│   ├── db.js               # IndexedDB操作
│   ├── map.js              # 地図表示・マーカー管理
│   ├── tracking.js         # GPS追跡・位置更新
│   ├── camera.js           # カメラ・写真撮影
│   ├── firebase-ops.js     # Firebase操作
│   ├── kmz-handler.js      # KMZ/GeoJSONエクスポート・インポート
│   ├── ui.js               # UIモジュール統合 (re-export)
│   ├── ui-common.js        # 共通UI関数・Wake Lock管理
│   ├── ui-photo.js         # 写真関連UI
│   ├── ui-dialog.js        # ダイアログ関連UI
│   ├── ui-settings.js      # 設定・時計UI
│   ├── firebase-config.js  # Firebase設定
│   └── firebase-config.template.js  # Firebase設定テンプレート
├── icons/
│   ├── icon-180.png
│   ├── icon-192.png
│   └── icon-512.png
└── docs/
    ├── funcspec-202603.md    # 機能仕様書（本書）
    ├── UsersGuide-202603.md  # 利用者の手引
    └── FIREBASE_SETUP.md     # Firebase設定ガイド
```

### 10.1 モジュール構成

| モジュール | 役割 | 主要エクスポート |
|-----------|------|----------------|
| config.js | 定数・設定 | DB_NAME, GPS_RECORD_*, PHOTO_* |
| state.js | 状態管理 | map, isTracking, trackingData, isFirebaseEnabled 等 |
| utils.js | 汎用関数 | formatDateTime, calculateDistance 等 |
| db.js | DB操作 | initIndexedDB, saveTrack, getAllPhotos 等 |
| map.js | 地図機能 | initMap, updateCurrentMarker, displayExternalGeoJSON 等 |
| tracking.js | GPS追跡 | startTracking, stopTracking, handleVisibilityChange 等 |
| camera.js | カメラ | takePhoto, capturePhoto, drawArrowStamp, updateTextBtnState 等 |
| firebase-ops.js | Firebase | saveToFirebase, reloadFromFirebase 等 |
| kmz-handler.js | KMZ/GeoJSON | exportToKmz, importKmz, importGeoJson 等 |
| ui.js | UI統合 | (各UIモジュールのre-export) |
| ui-common.js | 共通UI | updateStatus, setUiBusy, toggleVisibility 等 |
| ui-photo.js | 写真UI | showPhotoList, showPhotoViewer, showPhotoFromMarker 等 |
| ui-dialog.js | ダイアログ | showDocNameDialog(defaultName, title), showDataSize 等 |
| ui-settings.js | 設定・時計 | initClock, initSettings, showSettingsDialog 等 |
| app-main.js | 初期化 | initApp, setupEventListeners 等 |

---

## 11. 変更履歴

| 日付 | バージョン | 内容 |
|------|-----------|------|
| 2026-01-22 | 202601 | 初版作成 |
| 2026-01-24 | 202601 | GPS記録条件・写真解像度・ES6モジュール構成更新 |
| 2026-01-29 | 202601 | テキストメモ機能追加 |
| 2026-02-01 | 202601 | 写真撮影フロー改善（上書き保存・保存後画面維持） |
| 2026-02-02 | 202602 | アプリ名をRouteLoggerに変更、IndexedDB名更新 |
| 2026-02-28 | 202602 | 写真方向をダイアル式に変更（角度数値+facing）、KMZ export/import機能追加、外部レイヤー表示機能追加、設定パネル追加（Firebase切替・時計・facingボタン）、Clearボタン追加、Wake Lock対象をSave/Loadにも拡張、IndexedDB v4（externals/external_photosストア追加）、FirestoreパスをtracksコレクションへIに変更 |
| 2026-03-07 | 202603 | Saveダイアログタイトルを保存先別に変更（"Save to cloud as..." / "Save to file as..."）、保存開始前ステータスメッセージ追加、写真マーカータップ時にIndexedDB最新データを使用（facing不一致修正）、iOS Shake to Undo防止（visibilitychange時blur・ダイアログcleanup時blur）、Textボタンの入力済み状態を青色で視覚的に表示 |
