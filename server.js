const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcrypt');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const LOCATIONS = ["Warrior Zone", "P6060", "Pacific Victors Chapel", "Pedestrian Gate", "Main PX", "Provider DFAC","Maude Hall" , "Turner Gym", "Talon DFAC", "Spartan DFAC", "8th Army", "USFK Parking Lot", "CFC(Wa Mart)", "KTA", "Balboni Field", "Pyeongtaek Stn", "Pyeongtaek-Jije Stn"];

const NEARBY_MAP = {
    "P6060" : ["Spartan DFAC", "Pacific Victors Chapel", "KTA"],
    "Pacific Victors Chapel" : ["P6060", "KTA", "Spartan DFAC"],
    "KTA": ["P6060", "Pacific Victors Chapel", "Spartan DFAC"],
    "Spartan DFAC": ["P6060", "Pacific Victors Chapel", "KTA"],
    "Pedestrian Gate" : ["Provider DFAC"],
    "Provider DFAC" : ["Pedestrian Gate"],
    "Main PX": ["Maude Hall"],
    "Maude Hall": ["Main PX"],
    "Turner Gym": ["Talon DFAC"],
    "Talon DFAC": ["Turner Gym"],
    
    "8th Army" : ["USFK Parking Lot", "CFC(Wa Mart)"],
    "USFK Parking Lot" : ["8th Army", "CFC(Wa Mart)"],
    "CFC(Wa Mart)": ["8th Army", "USFK Parking Lot"],
    
    "Balboni Field" : ["Warrior Zone"],
    "Warrior Zone" : ["Balboni Field"],
    "Pyeongtaek Stn" : ["Pyeongtaek-Jije Stn"],
    "Pyeongtaek-Jije Stn" : ["Pyeongtaek Stn"],
    // 이런 식으로 인근 지역들을 리스트로 묶어서.
};

const SPECIFIC_SPOTS = {
    "Pyeongtaek Stn": ["1번 출구(동부) 편의점 앞", "2번 출구(서부) 택시승강장"],
    "Pyeongtaek-Jije Stn": ["1번 출구 에스컬레이터 앞", "SRT 매표소 앞", "2번 출구 주차장"],
    "Warrior Zone": ["입구 흡연장 옆", "주차장 입구", "내부 소파 구역"],
    "P6060": ["주차장 입구", "건물 정문 앞"],
    "Pacific Victors Chapel": ["교회 정문 계단", "주차장 끝부분"],
    "Pedestrian Gate": ["게이트 안쪽 벤치", "CPX 쪽 보도"],
    "Main PX": ["푸드코트 입구", "택시 승강장", "커미서리 쪽 주차장"],
    "Provider DFAC": ["식당 정문 앞", "주차장 입구"],
    "Maude Hall": ["건물 메인 로비 앞", "주차장 깃대 아래"],
    "Turner Gym": ["체육관 입구", "수영장 쪽 주차장"],
    "Talon DFAC": ["식당 입구 벤치", "주차장"],
    "Spartan DFAC": ["식당 정문", "옆쪽 주차구역"],
    "8th Army": ["버스 정류장", "주차장"],
    "USFK Parking Lot": ["바이크 랙", "스모킹 스테이션"],
    "CFC(Wa Mart)": ["와마트 입구", "주차장 끝"],
    "KTA": ["터프 앞", "황무지"],
    "Balboni Field": ["관중석 입구", "트랙 시작점"]
};

/*
    for (let loc in NEARBY_MAP) {
        NEARBY_MAP[loc].forEach(near => {
            if (!NEARBY_MAP[near]) NEARBY_MAP[near] = [];
            if (!NEARBY_MAP[near].includes(loc)) NEARBY_MAP[near].push(loc);
        });
    }   
        이거 도저히 실수때메 안되겠어서 필요하면 쓰셈 나중에
    */
const ADJECTIVES = ["말년의", "짬찬", "노련한", "능글맞은", "뺀질대는", "빠릿한", "빠진", "기합든", "각잡힌", "껄렁한", "든든한", "서글서글한", "시니컬한", "무덤덤한", "고참급", "실세인", "운좋은", "꼬인", "풀린", "피곤한", "졸린", "배고픈", "출출한", "든든한", "가식없는", "털털한", "호탕한", "화끈한", "뒤끝없는", "야무진", "어리바리한", "멍때리는", "눈치빠른", "영악한", "발칙한", "대담한", "배짱좋은", "헐렁한", "느긋한", "여유로운", "츤데레같은", "무심한", "까칠한", "꼬질꼬질한", "뽀송한", "각잡은", "광낸", "칼같은", "헐렁한", "가벼운", "묵직한", "듬직한", "우직한", "엉뚱한", "골때리는", "비범한", "평범한", "비루한", "화려한", "반짝이는", "구질구질한", "깔끔한", "반듯한", "삐딱한", "날카로운", "무딘", "둥글둥글한", "깐깐한", "유들유들한", "넉살좋은", "짠한", "짠내나는", "간절한", "치밀한", "허술한", "단단한", "물렁한", "독한", "독기빠진", "순박한"]

const ANIMALS = ["이등병", "일병", "상병", "병장", "하사", "중사", "상사", "소위", "중위", "대위", "행보관", "중대장", "대대장", "당직사관", "당직병", "취사병", "의무병", "통신병", "운전병", "행정병", "작전병", "피엑스병", "말년병장", "관심병사", "깍두기", "일수", "투수", "실세", "에이스", "고문관", "생활관", "내무반", "연병장", "위병소", "탄약고", "행정실", "취사장", "싸지방", "피엑스", "면회실", "독도법", "각개전투", "유격", "혹한기", "행군", "불침번", "경계근무", "탄알집", "방독면", "수갑", "대검", "야전삽", "반도", "단독군장", "완전군장", "활동복", "전투복", "전투화", "고무링", "베레모", "깔깔이", "맛다시", "군대리아", "건빵", "뽀글이", "냉동식품", "빅팜", "슈넬치킨", "가라", "쇼부", "짬밥", "짬타이거", "짬찌", "짬바", "휴가증", "포상휴가", "외박", "외출", "정기휴가", "말출", "복귀", "전역증", "개구리", "군번줄", "인식표", "관물대", "모포", "포대기", "침낭", "침상", "관물함", "빗자루", "쓰레기받기", "눈가래", "넉가래", "제설", "작업", "예비군", "민간인"]
let db;

// DB 초기화 및 테이블 생성
(async () => {
    db = await open({
        filename: './carpool.db',
        driver: sqlite3.Database
    });

    await db.exec(`PRAGMA journal_mode=WAL;`);
    await db.exec(`PRAGMA foreign_keys=ON;`);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            userId TEXT PRIMARY KEY,
            password TEXT,
            score INTEGER DEFAULT 100,
            driveCount INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS rooms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            creatorId TEXT,
            roomName TEXT,
            date TEXT,
            origin TEXT,
            dest TEXT,
            time TEXT,
            specificLocation TEXT,
            maxPax INTEGER DEFAULT 4,
            payAmount INTEGER DEFAULT 0,  -- 결제 금액
            payBank TEXT,                 -- 은행
            payAccount TEXT,              -- 계좌
            payerId TEXT                  -- 결제자 아이디
        );
        CREATE TABLE IF NOT EXISTS participants (
            roomId INTEGER,
            userId TEXT,
            PRIMARY KEY (roomId, userId),
            FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT,
            origin TEXT,
            dest TEXT,
            date TEXT,
            time TEXT,
            totalAmount INTEGER,
            splitAmount INTEGER,
            pax INTEGER,
            isPayer BOOLEAN,
            completedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log("M2 MacBook: SQLite Database Ready!");
})();

// 핵심: DB에서 데이터를 긁어와서 모두에게 뿌려주는 함수
async function broadcastRooms() {
    try {
        const now = new Date();
        const kstOffset = 9 * 60 * 60 * 1000;
        const kstNow = new Date(now.getTime() + kstOffset);

        const limitTime = new Date(kstNow.getTime() - (3 * 60 * 60 * 1000));
        const limitDate = limitTime.toISOString().split('T')[0];
        const limitTimeString = limitTime.toISOString().split('T')[1].substring(0, 5);

        const rooms = await db.all(`
            SELECT r.*, 
            (SELECT COUNT(*) FROM participants WHERE roomId = r.id) as currentPax,
            (SELECT GROUP_CONCAT(userId) FROM participants WHERE roomId = r.id) as participantList
            FROM rooms r 
            WHERE (date > ?) OR (date = ? AND time >= ?)
            ORDER BY date ASC, time ASC
        `, [limitDate, limitDate, limitTimeString]);

        // [수정] search_result와 형식을 맞춰서 보냅니다.
        io.emit('update_rooms', { 
            rooms: rooms || [], 
            searchCriteria: { origin: "", dest: "" } 
        });
    } catch (err) { console.error(err); }
}

app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/locations', (req, res) => res.json(LOCATIONS));
app.get('/api/specific-spots', (req, res) => {
    res.json(SPECIFIC_SPOTS);
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // 로그인 시도
    socket.on('login', async (data) => {
        const { userId, userPw } = data;

        if (!userId || !userPw) return;

        try {
            const user = await db.get('SELECT * FROM users WHERE userId = ?', [userId]);

            if (!user) {
                // 1. 신규 가입
                const hash = await bcrypt.hash(userPw, 10);
                await db.run('INSERT INTO users (userId, password) VALUES (?, ?)', [userId, hash]);
                socket.userId = userId;
                socket.emit('login_success', { userId, msg: "새 계정이 생성되었습니다!" });
                console.log(`[신규가입] ${userId}`);
            } else {
                const match = await bcrypt.compare(userPw, user.password);
                if (match) {
                    socket.userId = userId;
                    socket.emit('login_success', { userId });
                } else {
                    socket.emit('error_msg', '비밀번호가 틀렸습니다.');
                }
            }
        } catch (e) { 
            console.error(e);
            socket.emit('error_msg', "로그인 중 서버 오류가 발생했습니다.");
        }
    });

    // 로그인 후 목록 요청 수신
    socket.on('request_init_rooms', () => broadcastRooms());

    // 1. 방 만들기 (DB 저장 방식)
    socket.on('create_room', async (data) => {
        if (!socket.userId) return;
        try {
            // [수정] specificLocation을 구조 분해 할당으로 받음
            const { date, origin, dest, time, specificLocation, maxPax } = data;
            const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
            const ani = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
            const roomName = `${adj} ${ani}`;
            
            const result = await db.run(
                `INSERT INTO rooms (roomName, creatorId, date, origin, dest, specificLocation, time, maxPax) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [roomName, socket.userId, date, origin, dest, specificLocation, time, maxPax || 4]
            );
            
            await db.run(`INSERT INTO participants (roomId, userId) VALUES (?, ?)`, [result.lastID, socket.userId]);
            await db.run(`UPDATE users SET driveCount = driveCount + 1 WHERE userId = ?`, [socket.userId]);
            
            broadcastRooms();
        } catch (e) { console.error(e); }
    });

    socket.on('search_rooms', async (data) => {
        // 프론트에서 넘어온 date 값을 확인 (없으면 오늘 날짜 강제 지정)
        let { origin, dest, date } = data;
        
        if (!date) {
            const now = new Date();
            const kstOffset = 9 * 60 * 60 * 1000;
            date = new Date(now.getTime() + kstOffset).toISOString().split('T')[0];
        }

        const originList = origin ? [origin, ...(NEARBY_MAP[origin] || [])] : [];
        const destList = dest ? [dest, ...(NEARBY_MAP[dest] || [])] : [];

        try {
            let query = `
                SELECT r.*, 
                (SELECT COUNT(*) FROM participants WHERE roomId = r.id) as currentPax,
                (SELECT GROUP_CONCAT(userId) FROM participants WHERE roomId = r.id) as participantList 
                FROM rooms r 
                WHERE date = ?`; // 선택한 날짜의 데이터만 조회
            
            let params = [date];

            // 출발지 조건
            if (originList.length > 0) {
                const placeholders = originList.map(() => '?').join(',');
                query += ` AND origin IN (${placeholders})`;
                params.push(...originList);
            }

            // 목적지 조건
            if (destList.length > 0) {
                const placeholders = destList.map(() => '?').join(',');
                query += ` AND dest IN (${placeholders})`;
                params.push(...destList);
            }

            query += " ORDER BY time ASC";

            const rooms = await db.all(query, params);
            
            // 검색 결과를 클라이언트에 전송
            socket.emit('search_result', { 
                rooms: rooms || [], 
                searchCriteria: { origin, dest, date } 
            });
        } catch (e) {
            console.error("검색 에러:", e);
        }
    });
    
    // 2. 합승하기
    socket.on('join_room', async (roomId) => {
        if (!socket.userId) return;
        try {
            const room = await db.get(`SELECT * FROM rooms WHERE id = ?`, [roomId]);
            if (!room) return;

            const pCount = await db.get(`SELECT COUNT(*) as cnt FROM participants WHERE roomId = ?`, [roomId]);
            if (pCount.cnt >= room.maxPax) {
                return socket.emit('error_msg', '정원이 가득 찼습니다.');
            }

            // 중복 참여 방지는 PRIMARY KEY가 알아서 에러를 내줌
            await db.run(`INSERT INTO participants (roomId, userId) VALUES (?, ?)`, [roomId, socket.userId]);
            broadcastRooms();
        } catch (e) {
            if (e.message && e.message.includes('UNIQUE constraint failed')) {
                socket.emit('error_msg', '이미 참여 중인 카풀입니다.');
            } else {
                socket.emit('error_msg', '참여 처리 중 오류가 발생했습니다.');
            }
        }
    });

    // 3. 취소/폭파
    // [취소 로직 수정] 누구나 똑같이 본인만 삭제됨
    socket.on('cancel_join', async (data) => {
        if (!socket.userId) return;
        const { roomId } = data;

        try {
            // 1. 내가 결제자라면 먼저 정산 정보 초기화 (방이 살아있을 때 해야 함)
            await db.run(
                `UPDATE rooms SET payAmount=0, payBank=NULL, payAccount=NULL, payerId=NULL 
                WHERE id=? AND payerId=?`,
                [roomId, socket.userId]
            );

            // 2. 참여자 명단에서 나를 삭제
            const result = await db.run(
                `DELETE FROM participants WHERE roomId = ? AND userId = ?`,
                [roomId, socket.userId]
            );

            if (result.changes > 0) {
                console.log(`[취소] ${socket.userId}가 방(ID: ${roomId})에서 나감`);

                // 3. 방에 남은 인원 확인
                const left = await db.get(
                    `SELECT COUNT(*) as cnt FROM participants WHERE roomId = ?`, 
                    [roomId]
                );

                // 4. 아무도 없으면 방 삭제
                if (left && left.cnt === 0) {
                    await db.run(`DELETE FROM rooms WHERE id = ?`, [roomId]);
                    console.log(`[방 자동삭제] 참여자가 없어 방(ID: ${roomId})이 사라짐`);
                }
            }

            broadcastRooms();

        } catch (e) {
            console.error("취소 처리 중 에러:", e);
            socket.emit('error_msg', '취소 처리 중 오류가 발생했습니다.');
        }
    });

    socket.on('submit_payment', async (data) => {
        const { roomId, amount, bank, account } = data;
        
        // 1. 로그인 확인
        if (!socket.userId) return;

        try {
            // 2. [중요] 이 유저가 실제로 이 방에 참여 중인지 확인 (방 외부인이 정산 조작 방지)
            const isParticipant = await db.get(
                `SELECT * FROM participants WHERE roomId = ? AND userId = ?`, 
                [roomId, socket.userId]
            );
            
            if (!isParticipant) {
                return socket.emit('error_msg', '해당 카풀 참여자만 정산을 등록할 수 있습니다.');
            }

            const safeAmount = parseInt(amount);
            if (isNaN(safeAmount) || safeAmount <= 0) {
                return socket.emit('error_msg', '올바른 금액을 입력해주세요.');
            }

            // 3. DB 업데이트
            const result = await db.run(`
                UPDATE rooms 
                SET payAmount = ?, payBank = ?, payAccount = ?, payerId = ?
                WHERE id = ?
            `, [amount, bank, account, socket.userId, roomId]);

            if(result.changes > 0) {
                console.log(`[정산등록성공] 방 ${roomId} - ${amount}원 by ${socket.userId}`);
                broadcastRooms(); // 성공 시 목록 갱신
            } else {
                socket.emit('error_msg', '정산 정보를 업데이트할 방을 찾지 못했습니다.');
            }
        } catch (e) { 
            console.error("정산 에러:", e); 
            socket.emit('error_msg', '서버 DB 에러가 발생했습니다.');
        }
    });

    socket.on('complete_payment', async (data) => {
        const { roomId } = data;
        if (!socket.userId) return;

        try {
            const room = await db.get(`
                SELECT r.*, (SELECT GROUP_CONCAT(userId) FROM participants WHERE roomId = r.id) as participantList
                FROM rooms r WHERE r.id = ?
            `, [roomId]);

            if (!room || !room.participantList) return;
            
            if (room.payerId !== socket.userId) {
               return socket.emit('error_msg', '정산 등록자만 완료 처리할 수 있습니다.');
            }  
            const participants = room.participantList.split(',');
            const paxCount = participants.length;
            const splitAmount = Math.floor(room.payAmount / paxCount);

            // 2. 히스토리에 기록 (반복문 돌며 await)
            for (const uId of participants) {
                await db.run(`
                    INSERT INTO history 
                    (userId, origin, dest, date, time, totalAmount, splitAmount, pax, isPayer) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [uId, room.origin, room.dest, room.date, room.time, 
                    room.payAmount, splitAmount, paxCount, (uId === room.payerId ? 1 : 0)]);
            }

            // 3. 방 및 참여자 데이터 삭제 (Cascade 설정되어 있어도 안전하게 삭제)
            await db.run("DELETE FROM rooms WHERE id = ?", [roomId]);
            await db.run("DELETE FROM participants WHERE roomId = ?", [roomId]);

            console.log(`[정산완료/폭파] 방 ID: ${roomId} 기록 완료`);
            
            // 4. 즉시 갱신 신호 발송
            await broadcastRooms();
            io.emit('history_updated');
            
        } catch (e) {
            console.error("정산 완료 처리 에러:", e);
        }
    });

    socket.on('request_history', async () => {
        if (!socket.userId) return;
        try {
            const rows = await db.all(
                "SELECT * FROM history WHERE userId = ? ORDER BY completedAt DESC", 
                [socket.userId]
            );
            socket.emit('history_data', rows || []);
        } catch (e) {
            console.error("히스토리 조회 에러:", e);
        }
    });

    socket.on('disconnect', () => { console.log('User disconnected'); });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});