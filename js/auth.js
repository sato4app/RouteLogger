// RouteLogger - Firebase認証・ユーザー管理

const COLLECTION = 'userAdmin';

/**
 * 匿名認証でサインイン（未サインインの場合のみ実行）
 */
export async function signInAnonymously() {
    const current = firebase.auth().currentUser;
    if (current) return current;
    const result = await firebase.auth().signInAnonymously();
    return result.user;
}

/**
 * ユーザー名（doc ID）でユーザー情報を取得
 * @param {string} username
 * @returns {Promise<{username:string, email:string, displayName:string, status:string}|null>}
 */
export async function getUserByUsername(username) {
    const db = firebase.firestore();
    const doc = await db.collection(COLLECTION).doc(username).get();
    if (!doc.exists) return null;
    return { username: doc.id, ...doc.data() };
}

/**
 * 新規ユーザーをuserAdminコレクションに登録
 * ユーザー名がdoc IDとなり変更不可、承認プロセスなし（status=active）
 * @param {string} username 英数字のみ
 * @param {string} email メールアドレス
 * @param {string} displayName 氏名
 * @returns {Promise<{username:string, email:string, displayName:string, status:string}>}
 */
export async function registerUser(username, email, displayName) {
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) throw new Error('認証されていません');
    if (!username || !/^[a-zA-Z0-9]+$/.test(username)) throw new Error('ユーザー名は英数字のみ使用できます');
    if (!email) throw new Error('メールアドレスを入力してください');
    if (!displayName) throw new Error('氏名を入力してください');

    const db = firebase.firestore();
    const existing = await db.collection(COLLECTION).doc(username).get();
    if (existing.exists) throw new Error('このユーザー名はすでに使用されています');

    await db.collection(COLLECTION).doc(username).set({
        email,
        displayName,
        uid: currentUser.uid,
        status: 'active',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    return { username, email, displayName, status: 'active' };
}

/**
 * lastLoginAtを更新
 * @param {string} username
 */
export async function updateLastLogin(username) {
    const db = firebase.firestore();
    await db.collection(COLLECTION).doc(username).update({
        lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
}
