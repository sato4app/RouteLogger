// RouteLogger - 設定・定数

// IndexedDB設定
export const DB_NAME = 'RouteLoggerDB';
export const DB_VERSION = 4;
export const STORE_TRACKS = 'tracks';
export const STORE_PHOTOS = 'photos';
export const STORE_SETTINGS = 'settings';
export const STORE_EXTERNALS = 'externals';
export const STORE_EXTERNAL_PHOTOS = 'external_photos';

// デフォルト位置（箕面大滝）
export const DEFAULT_POSITION = {
    lat: 34.853667,
    lng: 135.472041,
    zoom: 15
};

// GPS記録条件
export const GPS_RECORD_INTERVAL_SEC = 60;  // 記録間隔（秒）
export const GPS_RECORD_DISTANCE_M = 20;    // 記録距離（メートル）

// 写真解像度
export const PHOTO_WIDTH = 360;
export const PHOTO_HEIGHT = 640;
export const PHOTO_QUALITY = 0.7;

// 画像設定の規定値
export const DEFAULT_PHOTO_RESOLUTION_LEVEL = 1; // 360×640px（中）
export const DEFAULT_PHOTO_QUALITY = 70;          // 70%
export const DEFAULT_THUMBNAIL_SIZE = 160;        // 160px

// 地図タイル設定
export const GSI_TILE_URL = 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png';
export const GSI_ATTRIBUTION = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">国土地理院</a>';
export const MAP_MAX_NATIVE_ZOOM = 18;
export const MAP_MAX_ZOOM = 20;
export const MAP_MIN_ZOOM = 5;
