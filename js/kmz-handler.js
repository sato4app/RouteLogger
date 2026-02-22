// RouteLogger - KMZ Handler

import { saveExternalData, saveExternalPhoto } from './db.js';

/**
 * TracksとPhotosからKMZファイルを生成してダウンロード
 * @param {Array} tracks - トラックデータの配列
 * @param {Array} photos - 写真データの配列
 * @param {string} [filename] - ファイル名 (拡張子なし)
 */
export async function exportToKmz(tracks, photos, filename) {
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
    const content = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.google-earth.kmz" });

    let downloadName;
    if (filename) {
      // 拡張子がなければ付ける
      downloadName = filename.endsWith('.kmz') ? filename : `${filename}.kmz`;
    } else {
      const dateStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
      downloadName = `RLog-${dateStr}.kmz`;
    }

    saveAs(content, downloadName);
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
 * creatorがRouteLoggerなら {type:'RouteLogger', tracks, photos}
 * それ以外なら {type:'other', geojson} を返す
 * @param {File} file - インポートするKMZファイル
 * @returns {Promise<Object>}
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

    // RouteLogger製かどうかをcreator文字列で判定
    const isRouteLogger = kmlText.includes('<atom:name>RouteLogger</atom:name>');

    const parser = new DOMParser();
    const kmlDom = parser.parseFromString(kmlText, "text/xml");

    if (isRouteLogger) {
      // --- RouteLoggerデータとしてtracks/photosを解析して返す ---
      const tracks = [];
      const photos = [];
      const placemarks = kmlDom.querySelectorAll('Placemark');

      for (const placemark of placemarks) {
        const lineString = placemark.querySelector('LineString');
        const point = placemark.querySelector('Point');

        if (lineString) {
          // トラック
          const coordsText = lineString.querySelector('coordinates')?.textContent.trim() || '';
          const points = coordsText.split(/\s+/).filter(s => s.trim()).map(coord => {
            const parts = coord.split(',');
            return { lat: parseFloat(parts[1]), lng: parseFloat(parts[0]) };
          }).filter(p => !isNaN(p.lat) && !isNaN(p.lng));

          if (points.length > 0) {
            tracks.push({ timestamp: new Date().toISOString(), points, totalPoints: points.length });
          }
        } else if (point) {
          // 写真
          const coordsText = point.querySelector('coordinates')?.textContent.trim() || '';
          const parts = coordsText.split(',');
          const lat = parseFloat(parts[1]);
          const lng = parseFloat(parts[0]);

          if (isNaN(lat) || isNaN(lng)) continue;

          // 説明文から画像パスを取得
          const description = placemark.querySelector('description')?.textContent || '';
          const imgMatch = description.match(/src="([^"]+\.(?:jpg|jpeg|png|gif))"/i);
          const imgPath = imgMatch ? imgMatch[1] : null;

          let photoBase64 = null;
          if (imgPath && zip.files[imgPath]) {
            const blob = await zip.files[imgPath].async('blob');
            photoBase64 = await blobToBase64(blob);
          }

          if (photoBase64) {
            photos.push({
              data: photoBase64,
              timestamp: new Date().toISOString(),
              location: { lat, lng },
              direction: null,
              text: null
            });
          }
        }
      }

      return { type: 'RouteLogger', tracks, photos };
    } else {
      // --- 外部データとしてexternals/external_photosに保存 ---
      if (!window.toGeoJSON || !window.toGeoJSON.kml) {
        throw new Error('KML変換ライブラリが読み込まれていません。');
      }

      const geojson = window.toGeoJSON.kml(kmlDom);
      const importId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const imageFiles = Object.values(zip.files).filter(f => !f.dir && /\.(jpg|jpeg|png|gif)$/i.test(f.name));
      for (const imgFile of imageFiles) {
        const blob = await imgFile.async("blob");
        await saveExternalPhoto(importId, imgFile.name, blob);
      }

      geojson.features.forEach(feature => {
        feature.properties = feature.properties || {};
        feature.properties.importId = importId;
      });

      await saveExternalData('geojson', file.name, geojson);
      return { type: 'other', geojson };
    }

  } catch (error) {
    console.error('KMZインポートエラー:', error);
    throw error;
  }
}

/**
 * BlobをBase64文字列に変換
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Blob to Base64変換エラー'));
    reader.readAsDataURL(blob);
  });
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

/**
 * GeoJSONファイルをインポート
 * creatorがRouteLoggerなら {type:'RouteLogger', tracks, photos}
 * それ以外なら {type:'other', geojson} を返す
 * @param {File} file - インポートするGeoJSONファイル
 * @returns {Promise<Object>}
 */
export async function importGeoJson(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const geojson = JSON.parse(e.target.result);

        // creatorがRouteLoggerか確認
        if (geojson.creator === 'RouteLogger') {
          const tracks = [];
          const photos = [];

          if (geojson.features) {
            for (const feature of geojson.features) {
              const props = feature.properties || {};
              const geomType = feature.geometry?.type;

              if (geomType === 'LineString') {
                const points = (feature.geometry.coordinates || []).map(([lng, lat]) => ({ lat, lng }));
                if (points.length > 0) {
                  tracks.push({
                    timestamp: props.timestamp || new Date().toISOString(),
                    points,
                    totalPoints: points.length
                  });
                }
              } else if (geomType === 'Point') {
                const [lng, lat] = feature.geometry.coordinates;
                photos.push({
                  data: props.photoData || null,
                  timestamp: props.timestamp || new Date().toISOString(),
                  location: { lat, lng },
                  direction: props.direction || null,
                  text: props.text || null
                });
              }
            }
          }

          resolve({ type: 'RouteLogger', tracks, photos });
        } else {
          // 外部データとしてexternalsに保存
          const importId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          if (geojson.features) {
            geojson.features.forEach(feature => {
              feature.properties = feature.properties || {};
              feature.properties.importId = importId;
            });
          } else if (geojson.type === 'Feature') {
            geojson.properties = geojson.properties || {};
            geojson.properties.importId = importId;
          }

          await saveExternalData('geojson', file.name, geojson);
          resolve({ type: 'other', geojson });
        }

      } catch (error) {
        console.error('GeoJSONインポートエラー:', error);
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error('ファイルの読み込みエラーが発生しました'));
    };

    reader.readAsText(file);
  });
}
