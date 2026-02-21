// RouteLogger - 地図関連

import { DEFAULT_POSITION, GSI_TILE_URL, GSI_ATTRIBUTION, MAP_MAX_ZOOM, MAP_MIN_ZOOM } from './config.js';
import * as state from './state.js';
import { getLastPosition, getAllPhotos, getExternalPhoto } from './db.js';

/**
 * 方向値を表示用文字列に変換
 * @param {number|string|null} direction
 * @returns {string}
 */
function formatDirection(direction) {
    if (typeof direction === 'number') {
        return direction > 0 ? `+${direction}°` : `${direction}°`;
    }
    if (direction === 'left') return '-60°';
    if (direction === 'right') return '+60°';
    if (direction === 'up') return '0°';
    return '';
}

/**
 * 矢印型マーカーアイコンを作成
 * @param {number} heading - 方角（度）
 * @returns {L.DivIcon}
 */
export function createArrowIcon(heading = 0) {
    return L.divIcon({
        className: 'arrow-marker',
        html: `<div class="arrow" style="transform: rotate(${heading}deg)">
                <svg width="30" height="30" viewBox="0 0 30 30">
                    <path d="M15 5 L25 25 L15 20 L5 25 Z" fill="#000080" stroke="#000050" stroke-width="2"/>
                </svg>
            </div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15] // Center of rotation
    });
}

/**
 * 開始地点用（四角）マーカーアイコンを作成
 * @returns {L.DivIcon}
 */
export function createSquareIcon() {
    return L.divIcon({
        className: 'square-marker',
        html: `<div style="width: 14px; height: 14px; background-color: #000080; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9] // Center
    });
}

/**
 * 写真マーカーアイコンを作成
 * @returns {L.DivIcon}
 */
export function createPhotoIcon() {
    return L.divIcon({
        className: 'photo-marker',
        html: `<div class="photo-marker-circle"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6]
    });
}

/**
 * 地図を初期化
 */
export async function initMap() {
    let initialPosition = DEFAULT_POSITION;

    // 現在位置を取得して初期化
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;

                const map = state.map;
                if (map) {
                    map.setView([lat, lng], 16);
                }
            },
            (error) => {
                console.warn('現在位置の取得に失敗しました。デフォルト位置を使用します:', error);
                const map = state.map;
                if (map) {
                    map.setView([DEFAULT_POSITION.lat, DEFAULT_POSITION.lng], DEFAULT_POSITION.zoom);
                }
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    } else {
        console.warn('Geolocation APIがサポートされていません。デフォルト位置を使用します。');
    }

    const mapInstance = L.map('map', {
        zoomControl: false // Disable default zoom control
    }).setView([initialPosition.lat, initialPosition.lng], initialPosition.zoom);
    state.setMap(mapInstance);

    // 1. Scale Control (Top Left)
    L.control.scale({
        position: 'topleft',
        metric: true,
        imperial: false
    }).addTo(mapInstance);



    // 3. Zoom Control (Top Left, below Compass)
    L.control.zoom({
        position: 'topleft'
    }).addTo(mapInstance);

    L.tileLayer(GSI_TILE_URL, {
        attribution: GSI_ATTRIBUTION,
        maxZoom: MAP_MAX_ZOOM,
        minZoom: MAP_MIN_ZOOM
    }).addTo(mapInstance);

    const trackingPathInstance = L.polyline([], {
        color: '#000080',
        weight: 4,
        opacity: 0.7
    }).addTo(mapInstance);
    state.setTrackingPath(trackingPathInstance);


}

/**
 * 写真マーカーを地図上に表示
 * @param {Function} onMarkerClick - マーカークリック時のコールバック
 */
export async function displayPhotoMarkers(onMarkerClick) {
    try {
        // 既存のマーカーをクリア
        state.photoMarkers.forEach(marker => state.map.removeLayer(marker));
        state.clearPhotoMarkers();

        const allPhotos = await getAllPhotos();


        let markerCount = 0;
        allPhotos.forEach((photo, index) => {
            if (photo.location && photo.location.lat && photo.location.lng) {
                const photoIcon = createPhotoIcon();
                const dirFmt = formatDirection(photo.direction);
                const directionText = dirFmt ? ` - ${dirFmt}` : '';
                const marker = L.marker([photo.location.lat, photo.location.lng], {
                    icon: photoIcon,
                    title: `${new Date(photo.timestamp).toLocaleString('ja-JP')}${directionText}`
                }).addTo(state.map);

                marker.photoId = photo.id;

                if (onMarkerClick) {
                    marker.on('click', () => onMarkerClick(photo));
                }

                state.addPhotoMarker(marker);
                markerCount++;
            } else {
                console.warn(`写真 ${index + 1}: 位置情報なし`);
            }
        });


    } catch (error) {
        console.error('写真マーカー表示エラー:', error);
    }
}

/**
 * 地図上のマーカーと軌跡をクリア
 * @param {Object} options - オプション
 * @param {boolean} options.keepExternal - 外部データを保持するかどうか (default: false)
 */
export function clearMapData(options = { keepExternal: false }) {
    if (state.trackingPath) {
        state.trackingPath.setLatLngs([]);

    }

    state.photoMarkers.forEach(marker => state.map.removeLayer(marker));
    state.clearPhotoMarkers();

    state.routeMarkers.forEach(marker => state.map.removeLayer(marker));
    state.clearRouteMarkers();

    if (!options.keepExternal) {
        state.externalLayers.forEach(layer => state.map.removeLayer(layer));
        state.clearExternalLayers();
    }
}

/**
 * 軌跡を更新
 * @param {Array} points - 位置データ配列
 */
export function updateTrackingPath(points) {
    if (state.trackingPath) {
        const latlngs = points.map(point => [point.lat, point.lng]);
        state.trackingPath.setLatLngs(latlngs);
    }
}

/**
 * 現在位置マーカーを更新
 * @param {number} lat - 緯度
 * @param {number} lng - 経度
 * @param {number} heading - 方角
 */
export function updateCurrentMarker(lat, lng, heading) {
    const arrowIcon = createArrowIcon(heading);
    if (state.currentMarker) {
        state.currentMarker.setLatLng([lat, lng]);
        state.currentMarker.setIcon(arrowIcon);
    } else {
        const marker = L.marker([lat, lng], { icon: arrowIcon }).addTo(state.map);
        state.setCurrentMarker(marker);
        state.map.setView([lat, lng], 15);
    }
}

/**
 * 写真マーカーを追加
 * @param {Object} photo - 写真データ
 * @param {Function} onMarkerClick - クリック時のコールバック
 */
export function addPhotoMarkerToMap(photo, onMarkerClick) {
    if (!photo.location) return;

    const photoIcon = createPhotoIcon();
    const marker = L.marker([photo.location.lat, photo.location.lng], {
        icon: photoIcon,
        title: `${new Date(photo.timestamp).toLocaleString('ja-JP')}${formatDirection(photo.direction) ? ' - ' + formatDirection(photo.direction) : ''}`
    }).addTo(state.map);

    // IDを保持
    marker.photoId = photo.id;

    if (onMarkerClick) {
        marker.on('click', () => onMarkerClick(photo));
    }

    state.addPhotoMarker(marker);
}

/**
 * 写真マーカーを削除 (ID指定)
 * @param {number} photoId
 */
export function removePhotoMarker(photoId) {
    const index = state.photoMarkers.findIndex(m => m.photoId === photoId);
    if (index !== -1) {
        const marker = state.photoMarkers[index];
        state.map.removeLayer(marker);
        state.photoMarkers.splice(index, 1);

    }
}

/**
 * 開始マーカーを表示
 * @param {number} lat - 緯度
 * @param {number} lng - 経度
 */
export function addStartMarker(lat, lng) {
    const icon = createSquareIcon();
    const marker = L.marker([lat, lng], { icon: icon, title: 'Start Point', zIndexOffset: 1000 }).addTo(state.map);
    state.addRouteMarker(marker);
}

/**
 * 終了マーカーを表示（矢印）
 * @param {number} lat - 緯度
 * @param {number} lng - 経度
 * @param {number} heading - 方角
 */
export function addEndMarker(lat, lng, heading) {
    const arrowIcon = createArrowIcon(heading);
    const marker = L.marker([lat, lng], { icon: arrowIcon, title: 'End Point', zIndexOffset: 1000 }).addTo(state.map);
    state.addRouteMarker(marker);
}

/**
 * 現在位置マーカーを削除
 */
export function removeCurrentMarker() {
    if (state.currentMarker) {
        state.map.removeLayer(state.currentMarker);
        state.setCurrentMarker(null);
    }
}

/**
 * 外部GeoJSONデータを表示
 * @param {Object} geoJson - GeoJSONデータ
 */
export function displayExternalGeoJSON(geoJson) {
    if (!state.map) return;

    try {
        const layer = L.geoJSON(geoJson, {
            // ポイントデータの表示スタイル設定
            pointToLayer: function (feature, latlng) {
                // 濃い緑の円形マーカー
                return L.circleMarker(latlng, {
                    radius: 8,
                    fillColor: "#006400", // 濃い緑
                    color: "#006400",     // 枠も濃い緑
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                });
            },
            style: function (feature) {
                // デフォルトスタイル: オレンジ色で少し太め (LineStringやPolygon用)
                return {
                    color: '#FF6D00',
                    weight: 4,
                    opacity: 0.7,
                    fillOpacity: 0.2
                };
            },
            onEachFeature: function (feature, layer) {
                if (feature.properties) {
                    let popupContent = '';

                    // IDとNameの表示 (ポイントデータの場合を重視)
                    // ユーザー要望: pointIdとnameを表示
                    const pointId = feature.properties.pointId || feature.id || feature.properties.id || feature.properties.importId || 'No ID';
                    const name = feature.properties.name || 'No Name';

                    // GeoJSONのPointの場合、pointIdとNameを明示的に表示
                    if (feature.geometry && feature.geometry.type === 'Point') {
                        popupContent += `<b>pointId:</b> ${pointId}<br>`;
                        popupContent += `<b>Name:</b> ${name}<br>`;
                    } else {
                        // ラインなどの場合は従来通りNameがあれば表示
                        if (feature.properties.name) {
                            popupContent += `<b>${feature.properties.name}</b><br>`;
                        }
                    }

                    if (feature.properties.description) {
                        popupContent += `<div>${feature.properties.description}</div>`;
                    }

                    if (popupContent) {
                        layer.bindPopup(popupContent);

                        // ポップアップが開いたときに画像をロードする
                        layer.on('popupopen', async () => {
                            const popup = layer.getPopup();
                            const content = popup.getContent(); // String or HTMLElement
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(content, 'text/html');
                            const imgs = doc.querySelectorAll('img');

                            let updated = false;
                            const importId = feature.properties.importId;

                            if (importId && imgs.length > 0) {
                                for (const img of imgs) {
                                    const src = img.getAttribute('src');
                                    // "images/photo_..." のようなパスをチェック
                                    // 実際のファイル名は "images/" を含むかどうか保存時によるが、
                                    // kmz-handler.jsでは "images/photo_..." としてHTMLに埋め込んでいる。
                                    // 一方、保存時は `saveExternalPhoto(importId, imgFile.name, blob)`
                                    // zip内のファイル名は "images/photo_X.jpg" なので、imgFile.nameも "images/photo_X.jpg" になるはず。

                                    if (src && !src.startsWith('blob:') && !src.startsWith('http')) {
                                        // 外部写真ストアからBlobを取得
                                        try {
                                            // srcが "images/photo_123.jpg" の場合、そのままキーとして使う
                                            const blob = await getExternalPhoto(importId, src);
                                            if (blob) {
                                                const url = URL.createObjectURL(blob);
                                                img.src = url;
                                                // メモリリーク防止のため、ポップアップが閉じるときにrevokeしたほうがいいが、
                                                // 複雑になるので今回は省略するか、別途管理が必要。
                                                // シンプルに: URLをセット
                                                updated = true;
                                            }
                                        } catch (e) {
                                            console.warn('外部画像読み込み失敗:', src, e);
                                        }
                                    }
                                }
                            }

                            if (updated) {
                                popup.setContent(doc.body.innerHTML);
                            }
                        });
                    }
                }
            }
        }).addTo(state.map);

        state.addExternalLayer(layer);

        // データの範囲に合わせてズーム
        const bounds = layer.getBounds();
        if (bounds.isValid()) {
            state.map.fitBounds(bounds, { padding: [50, 50] });
        }
    } catch (error) {
        console.error('GeoJSON表示エラー:', error);
        alert('GeoJSONデータの表示に失敗しました');
    }
}

/**
 * 全てのトラックデータを表示
 * @param {Array} tracks - トラックデータの配列
 */
export function displayAllTracks(tracks) {
    if (!state.map || !tracks) return;

    tracks.forEach(track => {
        if (track.points && track.points.length > 0) {
            const latlngs = track.points.map(p => [p.lat, p.lng]);
            const polyline = L.polyline(latlngs, {
                color: '#000080',
                weight: 5,
                opacity: 1.0 // 写真マーカーと同程度の濃さにする
            }).addTo(state.map);

            state.addExternalLayer(polyline);
        }
    });
}
