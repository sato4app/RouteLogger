// RouteLogger - KMZ Handler

import { saveExternalData, saveExternalPhoto } from './db.js';

/**
 * TracksとPhotosからKMZファイルを生成してダウンロード
 * @param {Array} tracks - トラックデータの配列
 * @param {Array} photos - 写真データの配列
 */
export async function exportToKmz(tracks, photos) {
  if (!tracks || tracks.length === 0) {
    alert('エクスポートするトラックデータがありません。');
    return;
  }

  const zip = new JSZip();
  const kml = generateKml(tracks, photos);

  // KMLをzipに追加
  zip.file("doc.kml", kml);

  // 写真がある場合、画像フォルダを作成して追加
  if (photos && photos.length > 0) {
    const imagesFolder = zip.folder("images");

    for (const photo of photos) {
      if (photo.data) {
        // Base64からBlobに変換
        const blob = base64ToBlob(photo.data);
        // 画像ファイル名はIDを使用 (例: photo_123.jpg)
        const fileName = `photo_${photo.id}.jpg`;
        imagesFolder.file(fileName, blob);
      }
    }
  }

  // Zipを生成してダウンロード
  try {
    const content = await zip.generateAsync({ type: "blob" });
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const fileName = `RouteLog_${dateStr}.kmz`;
    saveAs(content, fileName);
  } catch (e) {
    console.error('KMZ生成エラー:', e);
    alert('KMZファイルの生成に失敗しました。');
  }
}

/**
 * KML文字列を生成
 */
function generateKml(tracks, photos) {
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:atom="http://www.w3.org/2005/Atom">
  <Document>
    <atom:author>
      <atom:name>RouteLogger</atom:name>
    </atom:author>
    <name>RouteLogger Data</name>
    <Style id="trackStyle">
      <LineStyle>
        <color>ff0000ff</color>
        <width>4</width>
      </LineStyle>
    </Style>
    <Style id="photoStyle">
      <IconStyle>
        <scale>1.0</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/shapes/camera.png</href>
        </Icon>
      </IconStyle>
    </Style>
`;

  // Tracks
  tracks.forEach(track => {
    if (!track.points || track.points.length === 0) return;

    const coordinates = track.points.map(p => `${p.lng},${p.lat},0`).join(' ');

    kml += `
    <Placemark>
      <name>Track ${new Date(track.timestamp).toLocaleString()}</name>
      <styleUrl>#trackStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
          ${coordinates}
        </coordinates>
      </LineString>
    </Placemark>`;
  });

  // Photos
  if (photos) {
    photos.forEach(photo => {
      const fileName = `images/photo_${photo.id}.jpg`;
      const description = photo.comment ? `<![CDATA[${photo.comment}<br/><img src="${fileName}" width="300" />]]>` : `<![CDATA[<img src="${fileName}" width="300" />]]>`;

      const lat = photo.location ? photo.location.lat : 0;
      const lng = photo.location ? photo.location.lng : 0;

      kml += `
    <Placemark>
      <name>Photo ${new Date(photo.timestamp).toLocaleString()}</name>
      <description>${description}</description>
      <styleUrl>#photoStyle</styleUrl>
      <Point>
        <coordinates>${lng},${lat},0</coordinates>
      </Point>
    </Placemark>`;
    });
  }

  kml += `
  </Document>
</kml>`;

  return kml;
}

/**
 * KMZファイルをインポート
 * @param {File} file - インポートするKMZファイル
 * @returns {Promise<void>}
 */
export async function importKmz(file) {
  try {
    const zip = await JSZip.loadAsync(file);

    // KMLファイルを探す
    const kmlFile = Object.values(zip.files).find(f => f.name.endsWith('.kml'));
    if (!kmlFile) {
      throw new Error('KMZファイル内にKMLが見つかりません。');
    }

    const kmlText = await kmlFile.async("string");

    // KMLをGeoJSONに変換
    const parser = new DOMParser();
    const kmlDom = parser.parseFromString(kmlText, "text/xml");

    // togeojsonライブラリを使用 (window.toGeoJSONとしてロードされている前提)
    if (!window.toGeoJSON || !window.toGeoJSON.kml) {
      throw new Error('KML変換ライブラリが読み込まれていません。');
    }

    const geojson = window.toGeoJSON.kml(kmlDom);

    // インポートID生成 (Unique ID)
    const importId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 画像ファイルを抽出して保存
    const imageFiles = Object.values(zip.files).filter(f => !f.dir && /\.(jpg|jpeg|png|gif)$/i.test(f.name));

    if (imageFiles.length > 0) {
      for (const imgFile of imageFiles) {
        const blob = await imgFile.async("blob");
        // パスを含んだファイル名 (例: images/photo_123.jpg)
        await saveExternalPhoto(importId, imgFile.name, blob);
      }
    }

    // GeoJSONを保存 (画像参照用にimportIdを含める)
    // GeoJSONのpropertiesにimportIdを追加して、後で画像と紐付けられるようにする
    geojson.features.forEach(feature => {
      feature.properties = feature.properties || {};
      feature.properties.importId = importId;
    });

    await saveExternalData('geojson', file.name, geojson);

    return geojson;

  } catch (error) {
    console.error('KMZインポートエラー:', error);
    throw error;
  }
}

/**
 * Base64文字列をBlobに変換
 */
function base64ToBlob(base64) {
  const parts = base64.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);

  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }

  return new Blob([uInt8Array], { type: contentType });
}

/**
 * ファイル保存用ヘルパー (Aタグ使用)
 */
function saveAs(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
