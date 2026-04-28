const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcrypt');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const axios = require('axios');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server);
require('dotenv').config();

const LOCATIONS = ["Warrior Zone","P6060","Pacific Victors Chapel","Pedestrian Gate","Main PX","Provider DFAC","Maude Hall","Turner Gym","Talon DFAC","Spartan DFAC","8th Army","USFK Parking Lot","CFC(Wa Mart)","KTA","Balboni Field","Pyeongtaek Stn","Pyeongtaek-Jije Stn"];

const mailer = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
});

const NEARBY_MAP = {
    "P6060":["Spartan DFAC","Pacific Victors Chapel","KTA"],
    "Pacific Victors Chapel":["P6060","KTA","Spartan DFAC"],
    "KTA":["P6060","Pacific Victors Chapel","Spartan DFAC"],
    "Spartan DFAC":["P6060","Pacific Victors Chapel","KTA"],
    "Pedestrian Gate":["Provider DFAC"],
    "Provider DFAC":["Pedestrian Gate"],
    "Main PX":["Maude Hall"],
    "Maude Hall":["Main PX"],
    "Turner Gym":["Talon DFAC"],
    "Talon DFAC":["Turner Gym"],
    "8th Army":["USFK Parking Lot","CFC(Wa Mart)"],
    "USFK Parking Lot":["8th Army","CFC(Wa Mart)"],
    "CFC(Wa Mart)":["8th Army","USFK Parking Lot"],
    "Balboni Field":["Warrior Zone"],
    "Warrior Zone":["Balboni Field"],
    "Pyeongtaek Stn":["Pyeongtaek-Jije Stn"],
    "Pyeongtaek-Jije Stn":["Pyeongtaek Stn"],
};

const SPECIFIC_SPOTS = {
    "Pyeongtaek Stn":["1번 출구(동부) 편의점 앞","2번 출구(서부) 택시승강장"],
    "Pyeongtaek-Jije Stn":["1번 출구 에스컬레이터 앞","SRT 매표소 앞","2번 출구 주차장"],
    "Warrior Zone":["입구 흡연장 옆","주차장 입구","내부 소파 구역"],
    "P6060":["주차장 입구","건물 정문 앞"],
    "Pacific Victors Chapel":["교회 정문 계단","주차장 끝부분"],
    "Pedestrian Gate":["게이트 안쪽 벤치","CPX 쪽 보도"],
    "Main PX":["푸드코트 입구","택시 승강장","커미서리 쪽 주차장"],
    "Provider DFAC":["식당 정문 앞","주차장 입구"],
    "Maude Hall":["건물 메인 로비 앞","주차장 깃대 아래"],
    "Turner Gym":["체육관 입구","수영장 쪽 주차장"],
    "Talon DFAC":["식당 입구 벤치","주차장"],
    "Spartan DFAC":["식당 정문","옆쪽 주차구역"],
    "8th Army":["버스 정류장","주차장"],
    "USFK Parking Lot":["바이크 랙","스모킹 스테이션"],
    "CFC(Wa Mart)":["와마트 입구","주차장 끝"],
    "KTA":["터프 앞","황무지"],
    "Balboni Field":["관중석 입구","트랙 시작점"]
};

const ADJECTIVES = ["말년의","짬찬","노련한","능글맞은","뺀질대는","빠릿한","기합든","각잡힌","껄렁한","든든한","서글서글한","시니컬한","무덤덤한","고참급","실세인","운좋은","꼬인","풀린","피곤한","졸린","배고픈","출출한","가식없는","털털한","호탕한","화끈한","뒤끝없는","야무진","어리바리한","멍때리는","눈치빠른","영악한","발칙한","대담한","배짱좋은","헐렁한","느긋한","여유로운","무심한","까칠한","꼬질꼬질한","뽀송한","각잡은","광낸","칼같은","가벼운","묵직한","듬직한","우직한","엉뚱한","골때리는","비범한","평범한","화려한","반짝이는","깔끔한","반듯한","삐딱한","날카로운","둥글둥글한","깐깐한","넉살좋은","짠한","치밀한","단단한","독한","순박한"];
const ANIMALS = ["이등병","일병","상병","병장","하사","중사","상사","소위","중위","대위","행보관","중대장","대대장","당직사관","당직병","취사병","의무병","통신병","운전병","행정병","작전병","피엑스병","말년병장","관심병사","깍두기","일수","실세","에이스","고문관"];

let db;

(async () => {
    db = await open({ filename: './carpool.db', driver: sqlite3.Database });
    await db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;`);
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            userId TEXT PRIMARY KEY, password TEXT, email TEXT UNIQUE,
            kakaoId TEXT UNIQUE, authProvider TEXT DEFAULT 'local',
            name TEXT, nickname TEXT, phone TEXT, birthdate TEXT, gender TEXT,
            isOnboarded INTEGER DEFAULT 0, region TEXT DEFAULT 'HUMPHREYS',
            score INTEGER DEFAULT 100, driveCount INTEGER DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS password_resets (
            token TEXT PRIMARY KEY, userId TEXT NOT NULL,
            expiresAt INTEGER NOT NULL, used INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS rooms (
            id INTEGER PRIMARY KEY AUTOINCREMENT, creatorId TEXT, roomName TEXT,
            date TEXT, origin TEXT, dest TEXT, time TEXT, specificLocation TEXT,
            maxPax INTEGER DEFAULT 4, payAmount INTEGER DEFAULT 0,
            payBank TEXT, payAccount TEXT, payerId TEXT
        );
        CREATE TABLE IF NOT EXISTS participants (
            roomId INTEGER, userId TEXT,
            PRIMARY KEY (roomId, userId),
            FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT, userId TEXT,
            origin TEXT, dest TEXT, date TEXT, time TEXT,
            totalAmount INTEGER, splitAmount INTEGER, pax INTEGER,
            isPayer BOOLEAN, completedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    // 마이그레이션
    const cols = (await db.all(`PRAGMA table_info(users)`)).map(c => c.name);
    const add = async (col, def) => { if (!cols.includes(col)) await db.exec(`ALTER TABLE users ADD COLUMN ${col} ${def}`); };
    await add('email','TEXT'); await add('kakaoId','TEXT');
    await add('authProvider',"TEXT DEFAULT 'local'"); await add('name','TEXT');
    await add('phone','TEXT'); await add('birthdate','TEXT');
    await add('isOnboarded','INTEGER DEFAULT 0');
    console.log("DB Ready!");
})();

// ── 유틸 ──
function normalizePhone(raw = '') {
    return raw.replace(/\D/g, '').replace(/^82/, '0');
}

async function broadcastRooms() {
    const kst   = new Date(Date.now() + 9 * 3600000);
    const limit = new Date(kst.getTime() - 3 * 3600000);
    const ld    = limit.toISOString().split('T')[0];
    const lt    = limit.toISOString().split('T')[1].substring(0, 5);
    const rooms = await db.all(`
        SELECT r.*,
        (SELECT COUNT(*) FROM participants WHERE roomId=r.id) as currentPax,
        (SELECT GROUP_CONCAT(userId) FROM participants WHERE roomId=r.id) as participantList
        FROM rooms r WHERE (date>?) OR (date=? AND time>=?)
        ORDER BY date ASC, time ASC`, [ld, ld, lt]);
    io.emit('update_rooms', { rooms: rooms || [], searchCriteria: { origin:'', dest:'' } });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── 공개 API ──
app.get('/api/locations',      (_, res) => res.json(LOCATIONS));
app.get('/api/specific-spots', (_, res) => res.json(SPECIFIC_SPOTS));

// 아이디 중복 확인
app.get('/api/check-id', async (req, res) => {
    const { userId } = req.query;
    if (!userId || userId.length < 2)
        return res.json({ available: false, reason: '2자 이상 입력하세요.' });
    if (!/^[a-zA-Z0-9가-힣_-]{2,20}$/.test(userId))
        return res.json({ available: false, reason: '영문·숫자·한글·_- 만 사용 가능 (2~20자)' });
    const exists = await db.get('SELECT userId FROM users WHERE userId=?', [userId]);
    res.json(exists ? { available: false, reason: '이미 사용 중인 아이디입니다.' } : { available: true });
});

// 일반 회원가입
app.post('/api/register', async (req, res) => {
    const { userId, password, name, phone, birthdate, email } = req.body;
    if (!userId || !password || !name || !phone)
        return res.status(400).json({ error: '필수 항목을 모두 입력하세요.' });
    if (password.length < 4)
        return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });
    if (!/^[a-zA-Z0-9가-힣_-]{2,20}$/.test(userId))
        return res.status(400).json({ error: '아이디 형식이 올바르지 않습니다.' });
    const np = normalizePhone(phone);
    if (np.length < 10 || np.length > 11)
        return res.status(400).json({ error: '올바른 휴대폰 번호를 입력하세요.' });
    try {
        if (await db.get('SELECT 1 FROM users WHERE userId=?', [userId]))
            return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' });
        if (email && await db.get('SELECT 1 FROM users WHERE email=?', [email]))
            return res.status(409).json({ error: '이미 사용 중인 이메일입니다.' });
        const hash = await bcrypt.hash(password, 10);
        await db.run(
            `INSERT INTO users (userId,password,email,name,phone,birthdate,authProvider,isOnboarded)
             VALUES (?,?,?,?,?,?,'local',1)`,
            [userId, hash, email||null, name.trim(), np, birthdate||null]
        );
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 카카오 회원가입 완료 (추가정보 저장)
app.post('/api/kakao-register', async (req, res) => {
    const { tempToken, userId, name, phone, birthdate, email } = req.body;
    if (!tempToken || !userId || !name || !phone)
        return res.status(400).json({ error: '필수 항목을 모두 입력하세요.' });

    // 토큰 검증 (used=0 이어야 함 — 소켓 인증 전)
    const row = await db.get(
        `SELECT * FROM password_resets WHERE token=? AND used=0 AND expiresAt>?`,
        [tempToken, Date.now()]
    );
    if (!row || row.userId !== userId)
        return res.status(400).json({ error: '세션이 만료되었습니다. 카카오 로그인을 다시 시도해주세요.' });

    const np = normalizePhone(phone);
    if (np.length < 10 || np.length > 11)
        return res.status(400).json({ error: '올바른 휴대폰 번호를 입력하세요.' });

    try {
        if (email) {
            const dup = await db.get('SELECT 1 FROM users WHERE email=? AND userId!=?', [email, userId]);
            if (dup) return res.status(409).json({ error: '이미 사용 중인 이메일입니다.' });
            await db.run(`UPDATE users SET email=? WHERE userId=?`, [email, userId]);
        }
        await db.run(
            `UPDATE users SET name=?, phone=?, birthdate=?, isOnboarded=1 WHERE userId=?`,
            [name.trim(), np, birthdate||null, userId]
        );
        // 토큰은 소켓 kakao_verify 에서 소진하므로 여기서 used 변경 안 함
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// ── 카카오 OAuth ──
app.get('/auth/kakao', (_, res) => {
    res.redirect(
        `https://kauth.kakao.com/oauth/authorize?response_type=code` +
        `&client_id=${process.env.KAKAO_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(process.env.KAKAO_REDIRECT_URI)}`
    );
});

app.get('/auth/kakao/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect('/?kakao_error=no_code');
    try {
        // 1. 액세스 토큰
        const { data: tokenData } = await axios.post(
            'https://kauth.kakao.com/oauth/token',
            new URLSearchParams({ grant_type:'authorization_code', client_id:process.env.KAKAO_CLIENT_ID, redirect_uri:process.env.KAKAO_REDIRECT_URI, code }),
            { headers: { 'Content-Type':'application/x-www-form-urlencoded' } }
        );
        // 2. 유저 정보
        //    카카오 디벨로퍼 > 동의항목에서 활성화 필요:
        //    nickname(필수), email(선택동의), name(선택동의), phone_number(선택동의),
        //    birthyear(선택동의), birthday(선택동의)
        const { data: ku } = await axios.get('https://kapi.kakao.com/v2/user/me', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        const kakaoId    = String(ku.id);
        const acct       = ku.kakao_account || {};
        const kakaoNick  = acct.profile?.nickname || `카투사${kakaoId.slice(-4)}`;
        const kakaoEmail = acct.email       || null;
        const kakaoName  = acct.name        || null;   // 실명 동의항목
        const kakaoPhone = acct.phone_number|| null;   // +82 10-xxxx-xxxx 형태
        const kakaoBirth = (acct.birthyear && acct.birthday)
            ? `${acct.birthyear}-${acct.birthday.slice(0,2)}-${acct.birthday.slice(2,4)}` : null;

        // 3. DB 처리
        let user = await db.get(`SELECT * FROM users WHERE kakaoId=?`, [kakaoId]);
        if (!user) {
            // 이메일로 기존 로컬 계정 연동
            if (kakaoEmail) {
                const byEmail = await db.get(`SELECT * FROM users WHERE email=?`, [kakaoEmail]);
                if (byEmail) {
                    await db.run(`UPDATE users SET kakaoId=?, authProvider='both' WHERE userId=?`, [kakaoId, byEmail.userId]);
                    user = await db.get(`SELECT * FROM users WHERE userId=?`, [byEmail.userId]);
                }
            }
            // 완전 신규
            if (!user) {
                let uid = kakaoNick.replace(/[^a-zA-Z0-9가-힣_-]/g,'_').substring(0,16) || `user${kakaoId.slice(-4)}`;
                if (await db.get(`SELECT 1 FROM users WHERE userId=?`, [uid])) uid = `${uid}_${kakaoId.slice(-4)}`;
                await db.run(
                    `INSERT INTO users (userId,email,kakaoId,authProvider,name,phone,birthdate,isOnboarded)
                     VALUES (?,?,?,'kakao',?,?,?,0)`,
                    [uid, kakaoEmail, kakaoId,
                     kakaoName || null,
                     kakaoPhone ? normalizePhone(kakaoPhone) : null,
                     kakaoBirth || null]
                );
                user = await db.get(`SELECT * FROM users WHERE userId=?`, [uid]);
            }
        } else {
            // 기존 유저: 카카오에서 새로 동의한 정보가 있으면 업데이트
            const upd = []; const prm = [];
            if (kakaoName  && !user.name)     { upd.push('name=?');      prm.push(kakaoName); }
            if (kakaoPhone && !user.phone)    { upd.push('phone=?');     prm.push(normalizePhone(kakaoPhone)); }
            if (kakaoBirth && !user.birthdate){ upd.push('birthdate=?'); prm.push(kakaoBirth); }
            if (upd.length) {
                prm.push(user.userId);
                await db.run(`UPDATE users SET ${upd.join(',')} WHERE userId=?`, prm);
                user = await db.get(`SELECT * FROM users WHERE userId=?`, [user.userId]);
            }
        }

        // 4. 임시토큰 발급
        const tempToken = crypto.randomBytes(16).toString('hex');
        await db.run(
            `INSERT OR REPLACE INTO password_resets (token,userId,expiresAt,used) VALUES (?,?,?,0)`,
            [tempToken, user.userId, Date.now() + 10 * 60 * 1000]  // 10분
        );

        if (user.isOnboarded) {
            // 기존 유저 → 바로 로그인
            res.redirect(`/?kakao_token=${tempToken}`);
        } else {
            // 신규 유저 → 추가정보 입력 화면
            const qs = new URLSearchParams({
                kakao_register: '1',
                tempToken,
                userId:  user.userId,
                name:    kakaoName  || '',
                phone:   kakaoPhone ? normalizePhone(kakaoPhone) : '',
                birth:   kakaoBirth || '',
                email:   kakaoEmail || '',
            });
            res.redirect(`/?${qs.toString()}`);
        }
    } catch (e) {
        console.error('[카카오 에러]', e.response?.data || e.message);
        res.redirect('/?kakao_error=server_error');
    }
});

// ── 비밀번호 재설정 ──
app.post('/api/request-reset', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: '이메일을 입력하세요.' });
    const user = await db.get(`SELECT * FROM users WHERE email=?`, [email]);
    if (!user || user.authProvider === 'kakao') return res.json({ ok: true });
    const token = crypto.randomBytes(32).toString('hex');
    await db.run(`INSERT OR REPLACE INTO password_resets (token,userId,expiresAt,used) VALUES (?,?,?,0)`,
        [token, user.userId, Date.now() + 30 * 60 * 1000]);
    const url = `${process.env.APP_URL || 'http://localhost:' + PORT}/reset-password?token=${token}`;
    await mailer.sendMail({
        from: `"KATCHI-TAPSIDA" <${process.env.MAIL_USER}>`, to: email,
        subject: '[KATCHI-TAPSIDA] 비밀번호 재설정 안내',
        html: `<h2>비밀번호 재설정</h2><p>아래 링크를 클릭해 30분 이내에 비밀번호를 변경하세요.</p>
               <a href="${url}" style="background:#4a7fcb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">비밀번호 재설정</a>
               <p style="color:#999;font-size:12px;margin-top:20px;">요청하지 않았다면 무시하세요.</p>`
    });
    res.json({ ok: true });
});

app.get('/reset-password', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.post('/api/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: '잘못된 요청입니다.' });
    if (newPassword.length < 4)  return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });
    const row = await db.get(`SELECT * FROM password_resets WHERE token=? AND used=0 AND expiresAt>?`, [token, Date.now()]);
    if (!row) return res.status(400).json({ error: '만료되었거나 유효하지 않은 링크입니다.' });
    await db.run(`UPDATE users SET password=?, authProvider=CASE WHEN authProvider='kakao' THEN 'both' ELSE authProvider END WHERE userId=?`,
        [await bcrypt.hash(newPassword, 10), row.userId]);
    await db.run(`UPDATE password_resets SET used=1 WHERE token=?`, [token]);
    res.json({ ok: true });
});

// ── Socket.IO ──
io.on('connection', (socket) => {

    // 로그인 (기존 계정만, 없으면 login_fail)
    socket.on('login', async ({ userId, userPw }) => {
        if (!userId || !userPw) return socket.emit('error_msg', '아이디와 비밀번호를 입력해주세요.');
        try {
            const user = await db.get('SELECT * FROM users WHERE userId=?', [userId]);
            if (!user) return socket.emit('login_fail', { reason: 'no_user' });
            if (!user.password) return socket.emit('error_msg', '카카오로 가입된 계정입니다. 카카오 로그인을 이용해주세요.');
            if (!await bcrypt.compare(userPw, user.password)) return socket.emit('error_msg', '비밀번호가 틀렸습니다.');
            socket.userId = userId;
            socket.emit('login_success', {
                userId, provider: user.authProvider||'local',
                email: user.email||null, isOnboarded: user.isOnboarded||0,
                name: user.name||null, phone: user.phone||null,
            });
        } catch (e) { console.error(e); socket.emit('error_msg', '서버 오류가 발생했습니다.'); }
    });

    // 카카오 소켓 인증
    socket.on('kakao_verify', async ({ token }) => {
        if (!token) return socket.emit('error_msg', '유효하지 않은 토큰입니다.');
        try {
            const row = await db.get(`SELECT * FROM password_resets WHERE token=? AND used=0 AND expiresAt>?`, [token, Date.now()]);
            if (!row) return socket.emit('error_msg', '카카오 로그인 세션이 만료되었습니다. 다시 시도해주세요.');
            await db.run(`UPDATE password_resets SET used=1 WHERE token=?`, [token]);
            socket.userId = row.userId;
            const user = await db.get(`SELECT * FROM users WHERE userId=?`, [row.userId]);
            socket.emit('login_success', {
                userId: row.userId, provider: user?.authProvider||'kakao',
                email: user?.email||null, isOnboarded: user?.isOnboarded||0,
                name: user?.name||null, phone: user?.phone||null,
            });
        } catch (e) { console.error(e); socket.emit('error_msg', '카카오 로그인 처리 중 오류가 발생했습니다.'); }
    });

    socket.on('change_password', async ({ currentPw, newPw }) => {
        if (!socket.userId) return;
        if (!newPw || newPw.length < 4) return socket.emit('error_msg', '새 비밀번호는 4자 이상이어야 합니다.');
        try {
            const user = await db.get(`SELECT * FROM users WHERE userId=?`, [socket.userId]);
            if (!user) return socket.emit('error_msg', '유저를 찾을 수 없습니다.');
            if (user.authProvider !== 'kakao') {
                if (!currentPw) return socket.emit('error_msg', '현재 비밀번호를 입력해주세요.');
                if (!await bcrypt.compare(currentPw, user.password)) return socket.emit('error_msg', '현재 비밀번호가 틀렸습니다.');
            }
            await db.run(`UPDATE users SET password=?, authProvider=CASE WHEN authProvider='kakao' THEN 'both' ELSE authProvider END WHERE userId=?`,
                [await bcrypt.hash(newPw, 10), socket.userId]);
            socket.emit('change_password_success');
        } catch (e) { console.error(e); socket.emit('error_msg', '비밀번호 변경 중 오류가 발생했습니다.'); }
    });

    socket.on('update_email', async ({ email }) => {
        if (!socket.userId) return;
        if (!email || !email.includes('@')) return socket.emit('error_msg', '올바른 이메일 주소를 입력해주세요.');
        try {
            if (await db.get(`SELECT 1 FROM users WHERE email=? AND userId!=?`, [email, socket.userId]))
                return socket.emit('error_msg', '이미 사용 중인 이메일입니다.');
            await db.run(`UPDATE users SET email=? WHERE userId=?`, [email, socket.userId]);
            socket.emit('update_email_success');
        } catch (e) { console.error(e); socket.emit('error_msg', '이메일 업데이트 중 오류가 발생했습니다.'); }
    });

    socket.on('request_init_rooms', () => broadcastRooms());

    socket.on('create_room', async ({ date, origin, dest, time, specificLocation, maxPax }) => {
        if (!socket.userId) return;
        try {
            const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
            const ani = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
            const r = await db.run(
                `INSERT INTO rooms (roomName,creatorId,date,origin,dest,specificLocation,time,maxPax) VALUES (?,?,?,?,?,?,?,?)`,
                [`${adj} ${ani}`, socket.userId, date, origin, dest, specificLocation, time, maxPax||4]
            );
            await db.run(`INSERT INTO participants (roomId,userId) VALUES (?,?)`, [r.lastID, socket.userId]);
            await db.run(`UPDATE users SET driveCount=driveCount+1 WHERE userId=?`, [socket.userId]);
            broadcastRooms();
        } catch (e) { console.error(e); }
    });

    socket.on('search_rooms', async ({ origin, dest, date }) => {
        if (!date) date = new Date(Date.now() + 9*3600000).toISOString().split('T')[0];
        const oL = origin ? [origin, ...(NEARBY_MAP[origin]||[])] : [];
        const dL = dest   ? [dest,   ...(NEARBY_MAP[dest]  ||[])] : [];
        try {
            let q = `SELECT r.*, (SELECT COUNT(*) FROM participants WHERE roomId=r.id) as currentPax,
                     (SELECT GROUP_CONCAT(userId) FROM participants WHERE roomId=r.id) as participantList
                     FROM rooms r WHERE date=?`;
            const p = [date];
            if (oL.length) { q += ` AND origin IN (${oL.map(()=>'?').join(',')})`; p.push(...oL); }
            if (dL.length) { q += ` AND dest IN (${dL.map(()=>'?').join(',')})`; p.push(...dL); }
            q += ' ORDER BY time ASC';
            socket.emit('search_result', { rooms: await db.all(q, p)||[], searchCriteria:{origin,dest,date} });
        } catch (e) { console.error(e); }
    });

    socket.on('join_room', async (roomId) => {
        if (!socket.userId) return;
        try {
            const room = await db.get(`SELECT * FROM rooms WHERE id=?`, [roomId]);
            if (!room) return;
            const cnt = await db.get(`SELECT COUNT(*) as c FROM participants WHERE roomId=?`, [roomId]);
            if (cnt.c >= room.maxPax) return socket.emit('error_msg', '정원이 가득 찼습니다.');
            await db.run(`INSERT INTO participants (roomId,userId) VALUES (?,?)`, [roomId, socket.userId]);
            broadcastRooms();
        } catch (e) {
            if (e.message?.includes('UNIQUE')) socket.emit('error_msg', '이미 참여 중인 카풀입니다.');
            else socket.emit('error_msg', '참여 처리 중 오류가 발생했습니다.');
        }
    });

    socket.on('cancel_join', async ({ roomId }) => {
        if (!socket.userId) return;
        try {
            const room = await db.get(`SELECT * FROM rooms WHERE id=?`, [roomId]);
            if (!room) return socket.emit('error_msg', '방을 찾을 수 없습니다.');
            if (room.payerId === socket.userId)
                await db.run(`UPDATE rooms SET payAmount=0,payBank=NULL,payAccount=NULL,payerId=NULL WHERE id=?`, [roomId]);
            const r = await db.run(`DELETE FROM participants WHERE roomId=? AND userId=?`, [roomId, socket.userId]);
            if (r.changes > 0) {
                const left = await db.get(`SELECT COUNT(*) as c FROM participants WHERE roomId=?`, [roomId]);
                if (left.c === 0) await db.run(`DELETE FROM rooms WHERE id=?`, [roomId]);
            } else return socket.emit('error_msg', '참여 중인 카풀이 아닙니다.');
            broadcastRooms();
        } catch (e) { console.error(e); socket.emit('error_msg', '취소 처리 중 오류가 발생했습니다.'); }
    });

    socket.on('submit_payment', async ({ roomId, amount, bank, account }) => {
        if (!socket.userId) return;
        try {
            if (!await db.get(`SELECT 1 FROM participants WHERE roomId=? AND userId=?`, [roomId, socket.userId]))
                return socket.emit('error_msg', '참여자만 정산을 등록할 수 있습니다.');
            const safe = parseInt(amount);
            if (isNaN(safe) || safe <= 0) return socket.emit('error_msg', '올바른 금액을 입력해주세요.');
            const r = await db.run(`UPDATE rooms SET payAmount=?,payBank=?,payAccount=?,payerId=? WHERE id=?`,
                [safe, bank, account, socket.userId, roomId]);
            if (r.changes > 0) broadcastRooms();
            else socket.emit('error_msg', '방을 찾을 수 없습니다.');
        } catch (e) { console.error(e); socket.emit('error_msg', '서버 오류가 발생했습니다.'); }
    });

    socket.on('complete_payment', async ({ roomId }) => {
        if (!socket.userId) return;
        try {
            const room = await db.get(`
                SELECT r.*, (SELECT GROUP_CONCAT(userId) FROM participants WHERE roomId=r.id) as participantList
                FROM rooms r WHERE r.id=?`, [roomId]);
            if (!room?.participantList) return;
            if (room.payerId !== socket.userId) return socket.emit('error_msg', '정산 등록자만 완료 처리할 수 있습니다.');
            const ps = room.participantList.split(',');
            const split = Math.floor(room.payAmount / ps.length);
            for (const uid of ps) {
                await db.run(
                    `INSERT INTO history (userId,origin,dest,date,time,totalAmount,splitAmount,pax,isPayer) VALUES (?,?,?,?,?,?,?,?,?)`,
                    [uid,room.origin,room.dest,room.date,room.time,room.payAmount,split,ps.length,uid===room.payerId?1:0]
                );
            }
            await db.run('DELETE FROM rooms WHERE id=?', [roomId]);
            await db.run('DELETE FROM participants WHERE roomId=?', [roomId]);
            await broadcastRooms();
            io.emit('history_updated');
        } catch (e) { console.error(e); }
    });

    socket.on('request_history', async () => {
        if (!socket.userId) return;
        try {
            socket.emit('history_data',
                await db.all('SELECT * FROM history WHERE userId=? ORDER BY completedAt DESC', [socket.userId])||[]);
        } catch (e) { console.error(e); }
    });

    socket.on('disconnect', () => console.log('disconnected:', socket.id));
});

server.listen(PORT, '0.0.0.0', () => console.log(`http://localhost:${PORT}`));