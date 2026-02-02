// RouteLogger - ユーティリティ関数

/**
 * データ精度を調整する
 * @param {Object} data - 位置データ
 * @returns {Object|null} フォーマット済みデータ
 */
export function formatPositionData(data) {
    if (!data) return null;

    const formatted = { ...data };

    // 緯度・経度を小数点以下5位に
    if (formatted.lat !== undefined) {
        formatted.lat = parseFloat(formatted.lat.toFixed(5));
    }
    if (formatted.lng !== undefined) {
        formatted.lng = parseFloat(formatted.lng.toFixed(5));
    }

    // 精度を小数点以下1位に
    if (formatted.accuracy !== undefined) {
        formatted.accuracy = parseFloat(formatted.accuracy.toFixed(1));
    }

    // 標高
    if (formatted.altitude !== undefined && formatted.altitude !== null) {
        formatted.altitude = parseFloat(formatted.altitude.toFixed(1));
    }

    return formatted;
}

/**
 * Base64をBlobに変換
 * @param {string} base64 - Base64文字列
 * @param {string} contentType - MIMEタイプ
 * @returns {Blob}
 */
export function base64ToBlob(base64, contentType = 'image/jpeg') {
    const byteCharacters = atob(base64.split(',')[1]);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: contentType });
}

/**
 * トラック統計を計算
 * @param {Array} tracks - トラック配列
 * @returns {Object} 統計情報
 */
export function calculateTrackStats(tracks) {
    if (!tracks || !Array.isArray(tracks)) {
        console.warn('calculateTrackStats: tracks が配列ではありません', tracks);
        return { trackCount: 0, totalPoints: 0 };
    }

    const trackCount = tracks.length;
    const totalPoints = tracks.reduce((sum, track) => {
        if (!track) {
            console.warn('calculateTrackStats: track が null/undefined です');
            return sum;
        }
        return sum + (track.points ? track.points.length : 0);
    }, 0);
    return { trackCount, totalPoints };
}

/**
 * 2地点間の距離を計算（メートル）- Haversine公式
 * @param {number} lat1 - 地点1の緯度
 * @param {number} lng1 - 地点1の経度
 * @param {number} lat2 - 地点2の緯度
 * @param {number} lng2 - 地点2の経度
 * @returns {number} 距離（メートル）
 */
export function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // 地球の半径（メートル）
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/**
 * 日時をフォーマット
 * @param {Date} date - Dateオブジェクト
 * @returns {string} yyyy-MM-ddThh:mm形式
 */
export function formatDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * データサイズを適切な単位で表示（4桁精度）
 * @param {number} bytes - バイト数
 * @returns {string} フォーマット済みサイズ
 */
export function formatDataSize(bytes) {
    const sizeMB = bytes / (1024 * 1024);
    if (sizeMB > 10) {
        return sizeMB.toPrecision(4) + ' MB';
    } else {
        const sizeKB = bytes / 1024;
        return sizeKB.toPrecision(4) + ' KB';
    }
}
/**
 * 直近のポイントから進行方向を計算
 * @param {Object} currentPoint - 現在地 {lat, lng}
 * @param {Array} historyPoints - 過去のポイント配列（新しい順または古い順）
 * @returns {number} Heading (0-360)
 */
export function calculateHeading(currentPoint, historyPoints) {
    if (!historyPoints || historyPoints.length === 0) return 0;

    // 直近3点を取得 (historyPointsが時系列順(古い->新しい)と仮定)
    const recentPoints = historyPoints.slice(-3);
    if (recentPoints.length === 0) return 0;

    // 直近3点の重心（平均）を計算
    let sumLat = 0;
    let sumLng = 0;
    recentPoints.forEach(p => {
        sumLat += p.lat;
        sumLng += p.lng;
    });
    const avgLat = sumLat / recentPoints.length;
    const avgLng = sumLng / recentPoints.length;

    // 重心から現在地への方位を計算
    const lat1 = avgLat * Math.PI / 180;
    const lat2 = currentPoint.lat * Math.PI / 180;
    const diffLng = (currentPoint.lng - avgLng) * Math.PI / 180;

    const y = Math.sin(diffLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) * Math.cos(lat2) * Math.cos(diffLng);

    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
}
