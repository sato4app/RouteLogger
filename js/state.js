// RouteLogger - グローバル状態管理

// 地図関連
export let map = null;
export let currentMarker = null;
export let trackingPath = null;
export let photoMarkers = [];
export let externalLayers = [];

// GPS追跡関連
export let watchId = null;
export let isTracking = false;
export let trackingData = [];
export let trackingStartTime = null;
export let trackingStartDate = null;
export let trackingStopDate = null;
export let lastRecordedPoint = null;
export let currentHeading = 0;
export let previousTotalPoints = 0;
export let currentTrackId = null;

// Wake Lock
export let wakeLock = null;

// カメラ関連
export let cameraStream = null;
export let capturedPhotoData = null;
export let capturedPhotoLocation = null;
export let photosInSession = 0;
export let currentPhotoId = null;

// IndexedDB
export let db = null;

// Firebase
export let firebaseAuthReady = false;

// 状態更新関数
export function setMap(value) { map = value; }
export function setCurrentMarker(value) { currentMarker = value; }
export function setTrackingPath(value) { trackingPath = value; }
export function setPhotoMarkers(value) { photoMarkers = value; }
export function setWatchId(value) { watchId = value; }
export function setIsTracking(value) { isTracking = value; }
export function setTrackingData(value) { trackingData = value; }
export function setTrackingStartTime(value) { trackingStartTime = value; }
export function setTrackingStartDate(value) { trackingStartDate = value; }
export function setTrackingStopDate(value) { trackingStopDate = value; }
export function setLastRecordedPoint(value) { lastRecordedPoint = value; }
export function setCurrentHeading(value) { currentHeading = value; }
export function setPreviousTotalPoints(value) { previousTotalPoints = value; }
export function setCurrentTrackId(value) { currentTrackId = value; }
export function setWakeLock(value) { wakeLock = value; }
export function setCameraStream(value) { cameraStream = value; }

export function setCapturedPhotoData(value) { capturedPhotoData = value; }
export function setCapturedPhotoLocation(value) { capturedPhotoLocation = value; }
export function setPhotosInSession(value) { photosInSession = value; }
export function setCurrentPhotoId(value) { currentPhotoId = value; }
export function setDb(value) { db = value; }

export function setFirebaseAuthReady(value) { firebaseAuthReady = value; }

// Settings State
export let isClockVisible = true;
export function setIsClockVisible(value) { isClockVisible = value; }

export let isFirebaseEnabled = false;
export function setIsFirebaseEnabled(value) { isFirebaseEnabled = value; }

// 配列操作
export function addPhotoMarker(marker) { photoMarkers.push(marker); }
export function clearPhotoMarkers() { photoMarkers = []; }

// Route/System Markers (Start, End, etc.)
export let routeMarkers = [];
export function addRouteMarker(marker) { routeMarkers.push(marker); }
export function clearRouteMarkers() { routeMarkers = []; }

export function addTrackingPoint(point) { trackingData.push(point); }
export function resetTrackingData() { trackingData = []; }

// Official Points Markers
export let officialMarkers = [];
export function setOfficialMarkers(value) { officialMarkers = value; }
export function addOfficialMarker(marker) { officialMarkers.push(marker); }
export function clearOfficialMarkers() { officialMarkers = []; }

// External Layers
export function addExternalLayer(layer) { externalLayers.push(layer); }
export function clearExternalLayers() { externalLayers = []; }
