'use strict';

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const JSZip = require('jszip');
const sharp = require('sharp');
const nodemailer = require('nodemailer');
const https = require('https');
const http = require('http');
const { google } = require('googleapis');
const { Readable } = require('stream');

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

/** 画像を正方形にクロップしてリサイズして JPEG バッファを返す */
async function resizeToSquare(buffer, size = 320) {
    return sharp(buffer)
        .resize({ width: size, height: size, fit: 'cover' })
        .jpeg({ quality: 95 })
        .toBuffer();
}

/** direction値（数値または旧文字列）を度数に変換 */
function directionToDeg(direction) {
    if (typeof direction === 'number') return direction;
    if (direction === 'left') return -60;
    if (direction === 'right') return 60;
    return 0;
}

/** 正方形サムネールに方向バッジを合成して JPEG バッファを返す */
async function addBadgeToThumbnail(buffer, size, direction) {
    const arrowSize = size * 0.15;
    const r = arrowSize * 0.55;
    const cx = size / 2;
    const cy = size - arrowSize * 1.5;
    const arrowW = arrowSize * 0.5;
    const arrowH = arrowSize * 0.6;
    const lw = arrowSize * 0.12;
    const deg = directionToDeg(direction);

    const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="white" fill-opacity="0.9" stroke="black" stroke-opacity="0.3" stroke-width="${lw}"/>
  <g transform="translate(${cx},${cy}) rotate(${deg})">
    <line x1="0" y1="${arrowH / 2}" x2="0" y2="${-arrowH / 2}" stroke="#333333" stroke-width="${lw}" stroke-linecap="round"/>
    <polyline points="${-arrowW / 2},${-arrowH / 4} 0,${-arrowH / 2} ${arrowW / 2},${-arrowH / 4}" fill="none" stroke="#333333" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

    return sharp(buffer)
        .composite([{ input: Buffer.from(svg), blend: 'over' }])
        .jpeg({ quality: 95 })
        .toBuffer();
}

/** 写真URLから元のファイル名を抽出する（例: "1234567890.jpg"） */
function extractFilenameFromUrl(url) {
    try {
        const urlObj = new URL(url);
        // Firebase Storage URL: pathname が /v0/b/.../o/path%2Ffilename.jpg の形式
        const oMatch = urlObj.pathname.match(/\/o\/(.+)$/);
        if (oMatch) {
            const path = decodeURIComponent(oMatch[1]);
            return path.split('/').pop() || null;
        }
        // 汎用: パスの最後のセグメント
        const pathname = decodeURIComponent(urlObj.pathname);
        return pathname.split('/').pop() || null;
    } catch (e) {
        return null;
    }
}

/** XML 特殊文字をエスケープ */
function escapeXml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ─── Google Drive ユーティリティ ───────────────────────────────────────────────

/**
 * Google Drive クライアントを取得（OAuth2 ユーザー認証を使用）
 * functions/.env に GDRIVE_FOLDER_ID / GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET / GDRIVE_REFRESH_TOKEN を設定して有効化
 */
async function getDriveClient() {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GDRIVE_CLIENT_ID,
        process.env.GDRIVE_CLIENT_SECRET,
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GDRIVE_REFRESH_TOKEN });
    return google.drive({ version: 'v3', auth: oauth2Client });
}

/**
 * Drive に同名フォルダがあれば ID を返す、なければ作成して ID を返す
 * @param {object} drive
 * @param {string} parentId
 * @param {string} name
 * @returns {Promise<string>} フォルダID
 */
async function getOrCreateDriveFolder(drive, parentId, name) {
    const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const res = await drive.files.list({
        q: `name='${escaped}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
        fields: 'files(id)',
        spaces: 'drive',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
    });
    if (res.data.files.length > 0) return res.data.files[0].id;
    const folder = await drive.files.create({
        requestBody: {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId],
        },
        fields: 'id',
        supportsAllDrives: true,
    });
    return folder.data.id;
}

/**
 * Drive にファイルをアップロードして公開設定にする
 * @param {object} drive
 * @param {string} folderId
 * @param {string} filename
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @returns {Promise<{id:string, viewUrl:string}>}
 */
async function uploadFileToDrive(drive, folderId, filename, buffer, mimeType) {
    const res = await drive.files.create({
        requestBody: { name: filename, parents: [folderId] },
        media: { mimeType, body: Readable.from(buffer) },
        fields: 'id',
        supportsAllDrives: true,
    });
    const fileId = res.data.id;
    await drive.permissions.create({
        fileId,
        requestBody: { role: 'reader', type: 'anyone' },
        supportsAllDrives: true,
    });
    return {
        id: fileId,
        viewUrl: `https://drive.google.com/file/d/${fileId}/view`,
    };
}

/**
 * 1プロジェクト分の写真・サムネール・KMZ を Drive にアップロードする共通処理
 * generateKmzAndSendEmail と migrateRoutesToDrive で共用
 *
 * @param {object} drive - Drive クライアント
 * @param {string} rootFolderId - 共有フォルダ ID (GDRIVE_FOLDER_ID)
 * @param {string} projectName
 * @param {object} trackData
 * @param {number} thumbnailSize
 * @param {Array<Buffer|null>} photoBuffers - ダウンロード済み写真バッファ（nullなら再ダウンロード）
 * @param {Array<Buffer|null>} thumbnailBuffers - 生成済みサムネールバッファ（nullなら再生成）
 * @param {Array<string|null>} photoFilenames
 * @returns {Promise<{drivePhotoUrls: Array<string|null>, driveKmzBuffer: Buffer}>}
 */
async function uploadProjectToDrive(drive, rootFolderId, projectName, trackData, thumbnailSize, photoBuffers, thumbnailBuffers, photoFilenames) {
    const photos = trackData.photos || [];

    const projectFolderId = await getOrCreateDriveFolder(drive, rootFolderId, projectName);

    // 1. KMZ を先に生成・Drive に保存（写真URLは元のURLを使用）
    const driveZip = new JSZip();
    const driveImagesFolder = driveZip.folder('images');
    for (let i = 0; i < photos.length; i++) {
        if (thumbnailBuffers[i] && photoFilenames[i]) {
            driveImagesFolder.file(photoFilenames[i], thumbnailBuffers[i]);
        }
    }
    const driveKmlContent = buildKml(projectName, trackData, photoFilenames, thumbnailSize, null);
    driveZip.file('doc.kml', driveKmlContent);
    const driveKmzBuffer = await driveZip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
    });
    await uploadFileToDrive(drive, projectFolderId, `${projectName}.kmz`, driveKmzBuffer, 'application/vnd.google-earth.kmz');
    functions.logger.info(`${projectName} KMZ保存完了`);

    // 2. 写真・サムネールを Drive にアップロード
    const photosFolderId = await getOrCreateDriveFolder(drive, projectFolderId, 'photos');
    const imagesFolderId = await getOrCreateDriveFolder(drive, projectFolderId, 'images');

    const drivePhotoUrls = new Array(photos.length).fill(null);

    for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        if (!photo.url && !photoBuffers[i]) continue;

        try {
            // バッファが未取得なら再ダウンロード
            let buf = photoBuffers[i];
            if (!buf && photo.url) {
                buf = await downloadBuffer(photo.url);
            }
            if (!buf) continue;

            // 写真を Drive にアップロード
            const ts = new Date(photo.timestamp).getTime();
            const photoResult = await uploadFileToDrive(drive, photosFolderId, `${ts}.jpg`, buf, 'image/jpeg');
            drivePhotoUrls[i] = photoResult.viewUrl;

            // サムネールが未生成なら生成
            if (!thumbnailBuffers[i]) {
                const resized = await resizeToSquare(buf, thumbnailSize);
                thumbnailBuffers[i] = (photo.direction != null && photo.direction !== '')
                    ? await addBadgeToThumbnail(resized, thumbnailSize, photo.direction)
                    : resized;
            }

            // サムネールを Drive にアップロード
            if (photoFilenames[i] && thumbnailBuffers[i]) {
                await uploadFileToDrive(drive, imagesFolderId, photoFilenames[i], thumbnailBuffers[i], 'image/jpeg');
            }
        } catch (e) {
            functions.logger.warn(`${projectName} 写真 ${i + 1} Drive処理失敗: ${e.message}`);
        }
    }

    return { drivePhotoUrls, driveKmzBuffer };
}

// ─── KML 生成 ────────────────────────────────────────────────────────────────

/**
 * KML を生成する
 * @param {string} projectName
 * @param {object} trackData
 * @param {Array<string|null>} photoFilenames - KMZ 内のサムネールファイル名
 * @param {number} thumbnailSize
 * @param {Array<string|null>|null} photoUrls - 写真URLの上書き（Drive版KML用）。null の場合は trackData 内の URL を使用
 */
function buildKml(projectName, trackData, photoFilenames, thumbnailSize = 160, photoUrls = null) {
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

        // Timestamp: yyyy/MM/dd HH:mm (JST)
        let tsText = 'null';
        if (photo.timestamp != null) {
            const jst = new Date(new Date(photo.timestamp).getTime() + 9 * 60 * 60 * 1000);
            const yyyy = jst.getUTCFullYear();
            const MM = String(jst.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(jst.getUTCDate()).padStart(2, '0');
            const HH = String(jst.getUTCHours()).padStart(2, '0');
            const mm = String(jst.getUTCMinutes()).padStart(2, '0');
            tsText = `${yyyy}/${MM}/${dd} ${HH}:${mm}`;
        }

        // 写真URLの決定（photoUrls 指定があれば優先、なければ trackData 内の URL を使用）
        const photoUrl = (photoUrls && photoUrls[i]) ? photoUrls[i] : photo.url;

        let desc = '';
        if (thumbFile) {
            desc += `<img src="images/${thumbFile}" width="320"><br>`;
        }
        if (photoUrl) {
            desc += `<a href="${escapeXml(photoUrl)}">元の写真を表示</a><br>`;
        }
        desc += `${tsText}<br>`;
        // Facing/Direction 統合表示（例: "130° (Backward)"）
        const dirDeg = photo.direction != null ? `${photo.direction}°` : null;
        const facingLabel = photo.facing
            ? photo.facing.split('/').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('/')
            : null;
        if (dirDeg || facingLabel) {
            desc += `${[dirDeg, facingLabel ? `(${facingLabel})` : null].filter(Boolean).join(' ')}<br>`;
        }
        if (photo.text) {
            desc += `${escapeXml(photo.text)}<br>`;
        }

        photoPlacemarks += `
    <Placemark>
      <name></name>
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
 * Google Drive に写真・サムネール・KMZ をアップロードし、KMZ をメール送信する。
 *
 * SMTP 設定は functions/.env に記載:
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=587
 *   SMTP_SECURE=false
 *   SMTP_USER=your@gmail.com
 *   SMTP_PASS=apppassword
 *   SMTP_FROM=RouteLogger <your@gmail.com>
 *
 * Google Drive 連携: functions/.env に以下を設定:
 *   GDRIVE_FOLDER_ID=<フォルダID>
 *   GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET / GDRIVE_REFRESH_TOKEN
 */
exports.generateKmzAndSendEmail = functions
    .region('asia-northeast1')
    .runWith({ timeoutSeconds: 300, memory: '512MB' })
    .https.onCall(async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', '認証が必要です');
        }

        const { projectName, thumbnailSize = 160 } = data;
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

        // 3. サムネール生成（Drive アップロードで再利用するためバッファをキャッシュ）
        const photos = trackData.photos || [];
        const photoFilenames = new Array(photos.length).fill(null);
        const photoBuffers = new Array(photos.length).fill(null);
        const thumbnailBuffers = new Array(photos.length).fill(null);

        for (let i = 0; i < photos.length; i++) {
            const photo = photos[i];
            if (!photo.url) continue;
            try {
                const buffer = await downloadBuffer(photo.url);
                photoBuffers[i] = buffer;
                const resized = await resizeToSquare(buffer, thumbnailSize);
                thumbnailBuffers[i] = (photo.direction != null && photo.direction !== '')
                    ? await addBadgeToThumbnail(resized, thumbnailSize, photo.direction)
                    : resized;
                const origName = extractFilenameFromUrl(photo.url);
                photoFilenames[i] = origName ? `thumb_${origName}` : `thumb_${String(i + 1).padStart(3, '0')}.jpg`;
            } catch (e) {
                functions.logger.warn(`写真 ${i + 1} のサムネール作成に失敗: ${e.message}`);
            }
        }

        // 4. Google Drive アップロード
        const gDriveFolderId = process.env.GDRIVE_FOLDER_ID;
        if (!gDriveFolderId) {
            throw new functions.https.HttpsError(
                'failed-precondition',
                'GDRIVE_FOLDER_ID が未設定です。functions/.env を確認してください。'
            );
        }
        const drive = await getDriveClient();
        const { driveKmzBuffer } = await uploadProjectToDrive(
            drive, gDriveFolderId, projectName, trackData,
            thumbnailSize, photoBuffers, thumbnailBuffers, photoFilenames
        );

        // 5. メール送信
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
            auth: { user: smtpUser, pass: smtpPass },
        });

        const trackStats = (trackData.tracks || []).reduce((sum, t) => sum + (t.points?.length || 0), 0);
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
                        content: driveKmzBuffer,
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

// ─── 既存データの Google Drive 移行バッチ ────────────────────────────────────

/**
 * 既存 Firestore データの写真・サムネール・KMZ を Google Drive に移行する
 * Firebase Console から onCall で呼び出す
 *
 * 単一:     migrateRoutesToDrive({ projectName: 'xxx' })
 * 前方一致: migrateRoutesToDrive({ prefix: 'xxx' })
 * 全件:     migrateRoutesToDrive({ all: true })
 * オプション: thumbnailSize（省略時 160）
 */
exports.migrateRoutesToDrive = functions
    .region('asia-northeast1')
    .runWith({ timeoutSeconds: 540, memory: '1GB' })
    .https.onCall(async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', '認証が必要です');
        }

        const gDriveFolderId = process.env.GDRIVE_FOLDER_ID;
        if (!gDriveFolderId) {
            throw new functions.https.HttpsError(
                'failed-precondition',
                'GDRIVE_FOLDER_ID が未設定です。functions/.env を確認してください。'
            );
        }

        const { projectName, prefix, all, thumbnailSize = 160 } = data;

        // 対象ドキュメントを取得してフィルタリング
        const snapshot = await admin.firestore().collection('tracks').get();
        let docs = snapshot.docs;

        if (projectName) {
            docs = docs.filter(d => d.id === projectName);
        } else if (prefix) {
            docs = docs.filter(d => d.id.startsWith(prefix));
        } else if (!all) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'projectName, prefix, または all:true が必要です'
            );
        }

        if (docs.length === 0) {
            return { success: true, results: [], message: '対象ドキュメントが見つかりません' };
        }

        const drive = await getDriveClient();
        const results = [];

        for (const doc of docs) {
            const trackData = doc.data();
            const photos = trackData.photos || [];
            const photoBuffers = new Array(photos.length).fill(null);
            const thumbnailBuffers = new Array(photos.length).fill(null);
            const photoFilenames = new Array(photos.length).fill(null);

            // サムネール生成（Drive アップロード前に一括処理）
            for (let i = 0; i < photos.length; i++) {
                const photo = photos[i];
                if (!photo.url) continue;
                try {
                    const buffer = await downloadBuffer(photo.url);
                    photoBuffers[i] = buffer;
                    const origName = extractFilenameFromUrl(photo.url);
                    photoFilenames[i] = origName ? `thumb_${origName}` : `thumb_${String(i + 1).padStart(3, '0')}.jpg`;
                    const resized = await resizeToSquare(buffer, thumbnailSize);
                    thumbnailBuffers[i] = (photo.direction != null && photo.direction !== '')
                        ? await addBadgeToThumbnail(resized, thumbnailSize, photo.direction)
                        : resized;
                } catch (e) {
                    functions.logger.warn(`${doc.id} 写真 ${i + 1} サムネール生成失敗: ${e.message}`);
                }
            }

            try {
                await uploadProjectToDrive(
                    drive, gDriveFolderId, doc.id, trackData,
                    thumbnailSize, photoBuffers, thumbnailBuffers, photoFilenames
                );
                functions.logger.info(`${doc.id} Drive移行完了`);
                results.push({ projectName: doc.id, success: true });
            } catch (e) {
                functions.logger.error(`${doc.id} Drive移行失敗: ${e.message}`);
                results.push({ projectName: doc.id, success: false, error: e.message });
            }
        }

        return { success: true, results };
    });
