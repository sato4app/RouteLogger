'use strict';

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const JSZip = require('jszip');
const sharp = require('sharp');
const nodemailer = require('nodemailer');
const https = require('https');
const http = require('http');

admin.initializeApp();

// ─── ユーティリティ ───────────────────────────────────────────────────────────

/** URL から画像をバイナリで取得 */
function downloadBuffer(url) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        lib.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}: ${url}`));
                return;
            }
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

/** 画像を長辺 320px にリサイズして JPEG バッファを返す */
async function resizeTo320(buffer) {
    return sharp(buffer)
        .resize({ width: 320, height: 320, fit: 'inside' })
        .jpeg({ quality: 80 })
        .toBuffer();
}

/** XML 特殊文字をエスケープ */
function escapeXml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ─── KML 生成 ────────────────────────────────────────────────────────────────

function buildKml(projectName, trackData, photoFilenames) {
    const photos = trackData.photos || [];
    const tracks = trackData.tracks || [];

    // トラック Placemark
    let trackPlacemarks = '';
    tracks.forEach((track, ti) => {
        const points = (track.points || []).filter(p => p.lat && p.lng);
        if (points.length === 0) return;
        const coords = points.map(p => `${p.lng},${p.lat},${p.alt || 0}`).join('\n          ');
        trackPlacemarks += `
    <Placemark>
      <name>Track ${ti + 1}</name>
      <styleUrl>#trackStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
          ${coords}
        </coordinates>
      </LineString>
    </Placemark>`;
    });

    // 写真 Placemark
    let photoPlacemarks = '';
    photos.forEach((photo, i) => {
        if (!photo.location || photo.location.lat == null || photo.location.lng == null) return;
        const thumbFile = photoFilenames[i];
        const ts = photo.timestamp ? new Date(photo.timestamp).toLocaleString('ja-JP') : '';
        const compass = photo.compass || '';
        const facing = photo.facing ? `向き: ${photo.facing}` : '';

        let desc = '';
        if (thumbFile) {
            desc += `<img src="images/${thumbFile}" width="320"><br>`;
        }
        if (photo.url) {
            desc += `<a href="${escapeXml(photo.url)}">元の写真を表示</a><br>`;
        }
        if (ts)      desc += `撮影時刻: ${ts}<br>`;
        if (compass) desc += `方角: ${compass}<br>`;
        if (facing)  desc += `${facing}<br>`;
        if (photo.text) desc += `メモ: ${escapeXml(photo.text)}`;

        photoPlacemarks += `
    <Placemark>
      <name>Photo ${i + 1}</name>
      <description><![CDATA[${desc}]]></description>
      <Point>
        <coordinates>${photo.location.lng},${photo.location.lat},0</coordinates>
      </Point>
    </Placemark>`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${escapeXml(projectName)}</name>
  <Style id="trackStyle">
    <LineStyle>
      <color>ff0000ff</color>
      <width>3</width>
    </LineStyle>
  </Style>
  <Folder>
    <name>Track</name>
    ${trackPlacemarks}
  </Folder>
  <Folder>
    <name>Photos</name>
    ${photoPlacemarks}
  </Folder>
</Document>
</kml>`;
}

// ─── Cloud Function ───────────────────────────────────────────────────────────

/**
 * Firebase 保存完了後に呼び出す。
 * KMZ を生成してユーザーのメールアドレスに送信する。
 *
 * SMTP 設定は functions/.env に記載:
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=587
 *   SMTP_SECURE=false
 *   SMTP_USER=your@gmail.com
 *   SMTP_PASS=apppassword
 *   SMTP_FROM=RouteLogger <your@gmail.com>
 */
exports.generateKmzAndSendEmail = functions
    .region('asia-northeast1')
    .runWith({ timeoutSeconds: 300, memory: '512MB' })
    .https.onCall(async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', '認証が必要です');
        }

        const { projectName } = data;
        if (!projectName) {
            throw new functions.https.HttpsError('invalid-argument', 'projectName が必要です');
        }

        // 1. Firestore からトラックデータ取得
        const docSnap = await admin.firestore().collection('tracks').doc(projectName).get();
        if (!docSnap.exists) {
            throw new functions.https.HttpsError('not-found', `プロジェクト "${projectName}" が見つかりません`);
        }
        const trackData = docSnap.data();

        // 2. userAdmin からメールアドレス取得
        const username = trackData.username;
        let recipientEmail = null;
        if (username) {
            const userSnap = await admin.firestore().collection('userAdmin').doc(username).get();
            if (userSnap.exists) {
                recipientEmail = userSnap.data().email || null;
            }
        }
        if (!recipientEmail) {
            throw new functions.https.HttpsError(
                'not-found',
                'メールアドレスが登録されていません。Settingsでメールアドレスを登録してください。'
            );
        }

        // 3. KMZ 生成
        const photos = trackData.photos || [];
        const zip = new JSZip();
        const imagesFolder = zip.folder('images');
        const photoFilenames = new Array(photos.length).fill(null);

        for (let i = 0; i < photos.length; i++) {
            const photo = photos[i];
            if (!photo.url) continue;
            const filename = `thumb_${String(i + 1).padStart(3, '0')}.jpg`;
            try {
                const buffer = await downloadBuffer(photo.url);
                const thumbnail = await resizeTo320(buffer);
                imagesFolder.file(filename, thumbnail);
                photoFilenames[i] = filename;
            } catch (e) {
                functions.logger.warn(`写真 ${i + 1} のサムネール作成に失敗: ${e.message}`);
            }
        }

        const kmlContent = buildKml(projectName, trackData, photoFilenames);
        zip.file('doc.kml', kmlContent);

        const kmzBuffer = await zip.generateAsync({
            type: 'nodebuffer',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 },
        });

        // 4. メール送信
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;
        if (!smtpUser || !smtpPass) {
            throw new functions.https.HttpsError(
                'failed-precondition',
                'SMTP設定が未完了です。functions/.env を確認してください。'
            );
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: smtpUser,
                pass: smtpPass,
            },
        });

        const trackStats = trackData.tracksCount || 0;
        const photoCount = photos.length;
        const startTime = trackData.startTime
            ? new Date(trackData.startTime).toLocaleString('ja-JP')
            : '';

        try {
            await transporter.sendMail({
                from: process.env.SMTP_FROM || smtpUser,
                to: recipientEmail,
                subject: `RouteLogger: ${projectName}`,
                text: [
                    'RouteLogger からKMZファイルをお送りします。',
                    '',
                    `ルート名: ${projectName}`,
                    startTime ? `記録開始: ${startTime}` : '',
                    `記録点数: ${trackStats}件`,
                    `写真: ${photoCount}件`,
                    '',
                    '添付の .kmz ファイルは RouteLogger で読み込み可能です。',
                ].filter(Boolean).join('\n'),
                attachments: [
                    {
                        filename: `${projectName}.kmz`,
                        content: kmzBuffer,
                        contentType: 'application/vnd.google-earth.kmz',
                    },
                ],
            });
        } catch (mailError) {
            functions.logger.error(`メール送信エラー: ${mailError.message}`, { code: mailError.code, response: mailError.response });
            throw new functions.https.HttpsError(
                'internal',
                `メール送信に失敗しました: ${mailError.message}`
            );
        }

        functions.logger.info(`KMZ送信完了: ${projectName} → ${recipientEmail}`);
        return { success: true, sentTo: recipientEmail };
    });

// ─── KMZ を Storage に保存する関数 ────────────────────────────────────────────

/**
 * 指定したプロジェクト（または全プロジェクト）の KMZ を生成して Storage に保存する。
 * コンソールから呼び出す用途を想定。
 *
 * 単一: generateKmzToStorage({ projectName: 'xxx' })
 * 全件: generateKmzToStorage({ all: true })
 */
exports.generateKmzToStorage = functions
    .region('asia-northeast1')
    .runWith({ timeoutSeconds: 540, memory: '512MB' })
    .https.onCall(async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', '認証が必要です');
        }

        const bucket = admin.storage().bucket();

        async function processOne(projectName) {
            const docSnap = await admin.firestore().collection('tracks').doc(projectName).get();
            if (!docSnap.exists) {
                functions.logger.warn(`スキップ: "${projectName}" が見つかりません`);
                return null;
            }
            const trackData = docSnap.data();
            const photos = trackData.photos || [];

            const zip = new JSZip();
            const imagesFolder = zip.folder('images');
            const photoFilenames = new Array(photos.length).fill(null);

            for (let i = 0; i < photos.length; i++) {
                const photo = photos[i];
                if (!photo.url) continue;
                const filename = `thumb_${String(i + 1).padStart(3, '0')}.jpg`;
                try {
                    const buffer = await downloadBuffer(photo.url);
                    const thumbnail = await resizeTo320(buffer);
                    imagesFolder.file(filename, thumbnail);
                    photoFilenames[i] = filename;
                } catch (e) {
                    functions.logger.warn(`写真 ${i + 1} のサムネール作成に失敗: ${e.message}`);
                }
            }

            const kmlContent = buildKml(projectName, trackData, photoFilenames);
            zip.file('doc.kml', kmlContent);

            const kmzBuffer = await zip.generateAsync({
                type: 'nodebuffer',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 },
            });

            const storagePath = `kmz/${projectName}.kmz`;
            const file = bucket.file(storagePath);
            await file.save(kmzBuffer, {
                metadata: { contentType: 'application/vnd.google-earth.kmz' },
            });
            await file.makePublic();
            const url = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
            functions.logger.info(`KMZ保存完了: ${storagePath}`);
            return { projectName, url };
        }

        if (data.all) {
            const snapshot = await admin.firestore().collection('tracks').get();
            const results = [];
            for (const doc of snapshot.docs) {
                const result = await processOne(doc.id);
                if (result) results.push(result);
            }
            return { success: true, results };
        } else {
            if (!data.projectName) {
                throw new functions.https.HttpsError('invalid-argument', 'projectName または all:true が必要です');
            }
            const result = await processOne(data.projectName);
            if (!result) {
                throw new functions.https.HttpsError('not-found', `"${data.projectName}" が見つかりません`);
            }
            return { success: true, results: [result] };
        }
    });
