// server.js
// 環境変数の読み込み
require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const db = new sqlite3.Database('./reservation.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY,
    login_id TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    is_first_login BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    role TEXT NOT NULL DEFAULT 'user',
    password_reset_token TEXT,
    password_reset_expires DATETIME
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS buildings (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS classrooms (
    id INTEGER PRIMARY KEY,
    building_id INTEGER NOT NULL,
    is_usable BOOLEAN NOT NULL DEFAULT 1,
    floor INTEGER,
    room_number TEXT NOT NULL,
    room_name TEXT,
    capacity INTEGER,
    seat_type TEXT,
    FOREIGN KEY (building_id) REFERENCES buildings (id)
  )`);

  // 日ごとの予約システム：日付のみで管理
  db.run(`CREATE TABLE IF NOT EXISTS reservation_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    request_date DATE NOT NULL,
    classroom_ids TEXT NOT NULL,
    cycle_start_time DATETIME,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'pending',
    assigned_classroom_id INTEGER,
    purpose TEXT,
    expected_participants INTEGER,
    is_cancelled BOOLEAN DEFAULT 0,
    cancelled_at DATETIME,
    FOREIGN KEY (organization_id) REFERENCES organizations (id),
    FOREIGN KEY (assigned_classroom_id) REFERENCES classrooms (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    classroom_id INTEGER NOT NULL,
    reservation_date DATE NOT NULL,
    purpose TEXT,
    participants INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations (id),
    FOREIGN KEY (classroom_id) REFERENCES classrooms (id)
  )`);

    
  db.run(`CREATE TABLE IF NOT EXISTS classroom_closures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    classroom_id INTEGER NOT NULL,
    closure_date DATE NOT NULL,
    restriction_type TEXT NOT NULL DEFAULT 'closed', -- 'closed' or 'no-sound'
    reason TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (classroom_id) REFERENCES classrooms (id),
    FOREIGN KEY (created_by) REFERENCES organizations (id),
    UNIQUE(classroom_id, closure_date)
  )`);

  // お知らせテーブルを追加
  db.run(`CREATE TABLE IF NOT EXISTS system_notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notice_text TEXT,
    updated_by INTEGER NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES organizations (id)
  )`);

  // パスワードリセット通知テーブルを追加
  db.run(`CREATE TABLE IF NOT EXISTS password_reset_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    reset_token TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    is_read BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations (id)
  )`);

  insertSampleData();
});

function insertSampleData() {
  const buildings = [
    ['A棟', '第1教育棟'],
    ['B棟', '第2教育棟'],
    ['C棟', '第3教育棟']
  ];
  
  buildings.forEach(building => {
    db.run("INSERT OR IGNORE INTO buildings (name, description) VALUES (?, ?)", building, (err) => {
      if (err) console.error('Building insert error:', err);
    });
  });

  const celasClassrooms = [
    [3, 1, 1, 'C101', '講義室C101', 105, '固定'],
    [3, 1, 1, 'C104', '講義室C104', 52, 'セパレート'],
    [3, 1, 1, 'C105', '講義室C105', 68, 'セパレート'],
    [3, 1, 1, 'C106', '講義室C106', 102, 'セパレート'],
    [3, 1, 2, 'C202', '講義室C202', 156, '固定'], 
    [3, 1, 2, 'C203', '講義室C203', 73, '固定'],
    [3, 1, 2, 'C204', '講義室C204', 44, 'セパレート'],
    [3, 1, 2, 'C205', '講義室C205', 60, '固定'],
    [3, 1, 2, 'C208', '講義室C208', 108, '固定'],
    [3, 1, 3, 'C301', '講義室C301', 105, '固定'],
    [3, 1, 3, 'C302', '講義室C302', 156, '固定'],
    [3, 1, 3, 'C303', '講義室C303', 72, '固定'],
    [3, 1, 3, 'C304', '講義室C304', 51, 'セパレート'],
    [3, 1, 3, 'C305', '講義室C305', 54, '固定'],
    [3, 1, 3, 'C306', '講義室C306', 106, '固定'],
    [3, 1, 3, 'C307', '講義室C307', 72, '固定'],
    [3, 1, 3, 'C308', '講義室C308', 72, '固定'],
    [3, 1, 4, 'C401', '講義室C401', 105, '固定'],
    [3, 1, 4, 'C402', '講義室C402', 156, '固定'],
    [3, 1, 4, 'C403', '講義室C403', 72, '固定'],
    [3, 1, 4, 'C404', '講義室C404', 53, 'セパレート'],
    [3, 1, 4, 'C405', '講義室C405', 54, '固定'],
    [3, 1, 4, 'C406', '講義室C406', 106, '固定'],
    [3, 1, 4, 'C407', '講義室C407', 36, 'セパレート'],
    [3, 1, 4, 'C408', '講義室C408', 36, 'セパレート'],
    [3, 1, 4, 'C409', '講義室C409', 36, 'セパレート'],
    [3, 1, 1, '講義室', '大講義室', 309, '固定'],
  ];

  celasClassrooms.forEach(room => {
    db.run(`INSERT OR IGNORE INTO classrooms (building_id, is_usable, floor, room_number, room_name, capacity, seat_type) VALUES (?, ?, ?, ?, ?, ?, ?)`, room, (err) => {
      if (err) console.error('Classroom insert error:', err);
    });
  });

  console.log('---団体の初期設定を開始します---');

  const culturalClubs = [
   "交響01","交響02","交響03","交響04","交響05","混成01","混成02","混成03","混成04","混成05","ロボ01","ロボ02","ロボ03","ロボ04","ロボ05"
  ];
  
  const organizationsToInsert = [
    {
      loginId: 'admin',
      name: 'システム管理者',
      role: 'admin',
      password: 'adminpass'
    },
    ...culturalClubs.map((clubName, index) => ({
      loginId: clubName,
      name: clubName,
      role: 'user',
    }))
  ];

  const insertOrgs = async () => {
    for (const org of organizationsToInsert) {
      try {
        const existingOrg = await new Promise((resolve, reject) => {
          db.get('SELECT login_id FROM organizations WHERE login_id = ?', [org.loginId], (err, row) => {
            if (err) return reject(err);
            resolve(row);
          });
        });
        
        if (!existingOrg) {
          const password = org.role === 'admin' ? org.password : crypto.randomBytes(4).toString('hex');
          const hashedPassword = await bcrypt.hash(password, 10);
          
          db.run(`INSERT INTO organizations (login_id, password_hash, name, role) VALUES (?, ?, ?, ?)`,
            [org.loginId, hashedPassword, org.name, org.role]);

          if (org.role !== 'admin') {
            console.log(`[初期設定] 団体名: ${org.name} | 初期パスワード: ${password}`);
          } else {
            console.log(`[初期設定] 管理者アカウント (ID: ${org.loginId}, Name: ${org.name}) を設定しました。`);
          }
        }
      } catch (error) {
        console.error(`Error inserting organization ${org.name}:`, error);
      }
    }
    console.log('---団体の初期設定が完了しました---');
  };

  insertOrgs();

  setTimeout(() => {
    db.get("SELECT COUNT(*) as count FROM classrooms", [], (err, row) => {
      if (!err) {
        console.log(`データベース内の教室数: ${row.count}`);
      }
    });
  }, 2000);

  // insertSampleData関数の最後に追加
  setTimeout(() => {
    // 初期お知らせを設定（管理者IDを1と仮定）
    db.run(`INSERT OR IGNORE INTO system_notices (id, notice_text, updated_by) 
            VALUES (1, 'システムからのお知らせがここに表示されます。', 1)`,
      (err) => {
        if (err) console.error('初期お知らせ設定エラー:', err);
        else console.log('初期お知らせを設定しました');
      }
    );
  }, 3000);
}

app.use(express.json());
app.use(express.static('public'));

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

const authenticateAdmin = (req, res, next) => {
  authenticateToken(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'アクセス権限がありません。' });
    }
    next();
  });
};

// 日ごとの予約処理：その日に教室が空いているかチェック
async function processReservationRequests() {
  console.log('予約処理を開始:', new Date().toISOString());

  const now = new Date();
  const cycleTimeToProcess = new Date(now);
  cycleTimeToProcess.setMinutes(Math.floor(now.getMinutes() / 5) * 5, 0, 0);

  const sql = `
        SELECT rr.*, o.name as org_name 
        FROM reservation_requests rr
        JOIN organizations o ON rr.organization_id = o.id
        WHERE rr.cycle_start_time < ? AND rr.status = 'pending' AND rr.is_cancelled = 0
        ORDER BY rr.submitted_at ASC`;

  db.all(sql, [cycleTimeToProcess.toISOString()], async (err, requests) => {
    if (err) {
      console.error('予約リクエスト取得エラー:', err);
      return;
    }
    if (requests.length === 0) {
      console.log('処理対象の予約リクエストはありません。');
      return;
    }

    for (const request of requests) {
      try {
        const classroomIds = JSON.parse(request.classroom_ids);
        let assignedClassroom = null;

        for (const classroomId of classroomIds) {
          // その教室の、その日付の予約をチェック
          const existingReservation = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM reservations WHERE classroom_id = ? AND reservation_date = ?',
              [classroomId, request.request_date],
              (err, row) => err ? reject(err) : resolve(row));
          });

          if (!existingReservation) {
            assignedClassroom = classroomId;
            break; // 空いている教室が見つかったのでループを抜ける
          }
        }

        if (assignedClassroom) {
          // 予約を確定
          await new Promise((resolve, reject) => {
            db.run('INSERT INTO reservations (organization_id, classroom_id, reservation_date, purpose, participants) VALUES (?, ?, ?, ?, ?)',
              [request.organization_id, assignedClassroom, request.request_date, request.purpose, request.expected_participants],
              (err) => err ? reject(err) : resolve()
            );
          });

          await new Promise((resolve, reject) => {
            db.run('UPDATE reservation_requests SET status = ?, assigned_classroom_id = ? WHERE id = ?',
              ['approved', assignedClassroom, request.id],
              (err) => err ? reject(err) : resolve()
            );
          });

          // 教室情報を取得してログ出力
          const classroomInfo = await new Promise((resolve, reject) => {
            db.get(`SELECT c.*, b.name as building_name FROM classrooms c 
                                JOIN buildings b ON c.building_id = b.id WHERE c.id = ?`,
              [assignedClassroom], (err, row) => err ? reject(err) : resolve(row));
          });

          console.log(`✅ 予約承認: ${request.org_name} - ${request.request_date} - ${classroomInfo.building_name} ${classroomInfo.room_number}`);

        } else {
          // 予約を却下
          await new Promise((resolve, reject) => {
            db.run('UPDATE reservation_requests SET status = ? WHERE id = ?', ['rejected', request.id], (err) => err ? reject(err) : resolve());
          });

          console.log(`❌ 予約却下: ${request.org_name} - ${request.request_date} - 教室が満室`);
        }
      } catch (e) {
        console.error(`リクエストID ${request.id} の処理中にエラーが発生しました:`, e);
      }
    }
  });
}

async function cleanupOldRecords() {
  const epoch = new Date('2024-01-01');
  const now = new Date();
  const weeksSinceEpoch = Math.floor((now - epoch) / (1000 * 60 * 60 * 24 * 7));

  if (weeksSinceEpoch % 2 == 0) {
    console.log('クリーンアップスキップ: 実行は2週間に1回です。');
    return;
  }
  console.log('古い予約データのクリーンアップ処理を開始:', new Date().toISOString());
  try {
    const getMonday = (d) => {
      const date = new Date(d);
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(date.setDate(diff));
      monday.setHours(0, 0, 0, 0);
      return monday;
    };

    const today = new Date();
    const thisWeekMonday = getMonday(today);

    const cutoffDate = new Date(thisWeekMonday);
    cutoffDate.setDate(thisWeekMonday.getDate() - 7);
    const cutoffDateString = cutoffDate.toISOString().split('T')[0];

    console.log(`この日付より前のレコードを削除します: ${cutoffDateString}`);

    const deletedReservations = await new Promise((resolve, reject) => {
      db.run(`DELETE FROM reservations WHERE reservation_date < ?`, [cutoffDateString], function (err) {
        if (err) return reject(err);
        resolve(this.changes);
      });
    });
    console.log(`削除された確定予約の数: ${deletedReservations}`);

    const deletedRequests = await new Promise((resolve, reject) => {
      db.run(`DELETE FROM reservation_requests WHERE request_date < ?`, [cutoffDateString], function (err) {
        if (err) return reject(err);
        resolve(this.changes);
      });
    });
    console.log(`削除された予約リクエストの数: ${deletedRequests}`);

  } catch (error) {
    console.error('古い予約データのクリーンアップ中にエラーが発生しました:', error);
  }
}

// ログインページのプルダウン用に、団体名とログインIDの一覧を返すAPI
app.get('/api/organizations', (req, res) => {
  const sql = `
    SELECT login_id, name 
    FROM organizations 
    ORDER BY 
      CASE WHEN role = 'admin' THEN 0 ELSE 1 END, 
      name
  `;
  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: '団体の取得に失敗しました。' });
    }
    res.json(rows);
  });
});

// プルダウン選択方式のログイン
app.post('/api/login', async (req, res) => {
  const { loginId, password } = req.body;

  try {
    const org = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM organizations WHERE login_id = ?', [loginId], (err, row) => err ? reject(err) : resolve(row));
    });

    if (!org || !(await bcrypt.compare(password, org.password_hash))) {
      return res.status(401).json({ error: '選択された団体名またはパスワードが違います' });
    }

    const token = jwt.sign(
      { id: org.id, loginId: org.login_id, name: org.name, role: org.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      organization: {
        id: org.id,
        name: org.name,
        isFirstLogin: org.is_first_login,
        role: org.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'サーバー内部でエラーが発生しました。' });
  }
});

// ユーザー情報取得API
app.get('/api/user-info', authenticateToken, async (req, res) => {
  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT login_id, name FROM organizations WHERE id = ?',
        [req.user.id], (err, row) => {
          if (err) return reject(err);
          resolve(row);
        });
    });

    if (!user) {
      return res.status(404).json({ error: 'ユーザーが見つかりません。' });
    }

    res.json(user);
  } catch (error) {
    console.error('ユーザー情報取得エラー:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました。' });
  }
});

// 初回ログイン設定完了API
app.post('/api/complete-first-login', authenticateToken, async (req, res) => {
  const { newPassword } = req.body;

  // バリデーション
  if (!newPassword) {
    return res.status(400).json({ error: 'パスワードは必須です。' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'パスワードは6文字以上で設定してください。' });
  }

  try {
    // まず現在のユーザー情報を取得して初回ログインかチェック
    const currentUser = await new Promise((resolve, reject) => {
      db.get('SELECT is_first_login FROM organizations WHERE id = ?', [req.user.id], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (!currentUser || !currentUser.is_first_login) {
      return res.status(400).json({ error: '初回ログイン設定は既に完了しています。' });
    }

    // パスワードをハッシュ化
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // データベースを更新
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE organizations SET password_hash = ?, is_first_login = 0 WHERE id = ?',
        [hashedPassword, req.user.id],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });

    // 新しいトークンを生成（is_first_loginフラグを更新）
    const newToken = jwt.sign(
      {
        id: req.user.id,
        loginId: req.user.loginId,
        name: req.user.name,
        role: req.user.role
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: '初回ログイン設定が完了しました。',
      token: newToken
    });

  } catch (error) {
    console.error('初回ログイン設定エラー:', error);
    res.status(500).json({ error: '設定中にエラーが発生しました。' });
  }
});

app.get('/api/buildings', (req, res) => {
  db.all('SELECT * FROM buildings ORDER BY name', (err, buildings) => {
    if (err) return res.status(500).json({ error: 'データ取得エラー' });
    res.json(buildings);
  });
});

app.get('/api/admin/classrooms', authenticateAdmin, (req, res) => {
  db.all('SELECT * FROM classrooms ORDER BY building_id, room_number', [], (err, classrooms) => {
    if (err) return res.status(500).json({ error: 'データ取得エラー' });
    res.json(classrooms);
  });
});

app.put('/api/admin/classrooms/:id/toggle_usability', authenticateAdmin, (req, res) => {
  const { is_usable } = req.body;
  if (typeof is_usable !== 'boolean') {
    return res.status(400).json({ error: 'is_usable の値 (true/false) が必要です。' });
  }
  db.run('UPDATE classrooms SET is_usable = ? WHERE id = ?', [is_usable, req.params.id], function (err) {
    if (err) return res.status(500).json({ error: 'データベースの更新に失敗しました。' });
    if (this.changes === 0) return res.status(404).json({ error: '該当する教室が見つかりません。' });
    res.json({ message: '教室の状態を更新しました。' });
  });
});

// 全ての教室情報を取得するAPI
app.get('/api/classrooms/all', authenticateToken, (req, res) => {
  const sql = `SELECT id, room_number, floor, is_usable FROM classrooms`;
  console.log('[/api/classrooms/all] Executing SQL:', sql);

  db.all(sql, [], (err, classrooms) => {
    if (err) {
      console.error('[/api/classrooms/all] エラー:', err);
      return res.status(500).json({ error: '教室データの取得に失敗しました。' });
    }
    console.log(`[/api/classrooms/all] Found ${classrooms ? classrooms.length : 0} classrooms`);
    if (classrooms && classrooms.length > 0) {
      console.log('[/api/classrooms/all] First classroom:', classrooms[0]);
    }

    res.json(classrooms || []);
  });
});

app.get('/api/classrooms/:buildingId', (req, res) => {
  db.all(`SELECT c.*, b.name as building_name FROM classrooms c JOIN buildings b ON c.building_id = b.id WHERE c.building_id = ? AND c.is_usable = 1 ORDER BY c.floor, c.room_number`, [req.params.buildingId], (err, classrooms) => {
    if (err) return res.status(500).json({ error: 'データ取得エラー' });
    res.json(classrooms);
  });
});

app.get('/api/classrooms/details/:id', (req, res) => {
  db.get(`SELECT c.*, b.name as building_name FROM classrooms c JOIN buildings b ON c.building_id = b.id WHERE c.id = ?`, [req.params.id], (err, room) => {
    if (err) return res.status(500).json({ error: '教室詳細の取得エラー' });
    if (!room) return res.status(404).json({ error: '教室が見つかりません' });
    res.json(room);
  });
});

app.get('/api/my-requests', authenticateToken, async (req, res) => {
  try {
    const requests = await new Promise((resolve, reject) => {
      db.all(`SELECT rr.*, c.room_number, c.room_name, b.name as building_name 
                   FROM reservation_requests rr 
                   LEFT JOIN classrooms c ON rr.assigned_classroom_id = c.id 
                   LEFT JOIN buildings b ON c.building_id = b.id 
                   WHERE rr.organization_id = ? 
                   ORDER BY rr.submitted_at DESC`, [req.user.id], (err, rows) => err ? reject(err) : resolve(rows));
    });
    const processedRequests = await Promise.all(requests.map(async (req) => {
      const classroomIds = JSON.parse(req.classroom_ids || '[]');
      if (classroomIds.length === 0) return { ...req, requested_classrooms_details: [] };
      const requestedClassroomsInfo = await new Promise((resolve, reject) => {
        db.all(`SELECT id, room_number, room_name FROM classrooms WHERE id IN (${classroomIds.map(() => '?').join(',')})`, classroomIds, (err, rooms) => err ? reject(err) : resolve(rooms));
      });
      return { ...req, requested_classrooms_details: requestedClassroomsInfo };
    }));
    res.json(processedRequests);
  } catch (error) {
    res.status(500).json({ error: 'データ取得エラー' });
  }
});

app.get('/api/my-reservations', authenticateToken, (req, res) => {
  db.all(`SELECT r.*, c.room_number, c.room_name, b.name as building_name FROM reservations r JOIN classrooms c ON r.classroom_id = c.id JOIN buildings b ON c.building_id = b.id WHERE r.organization_id = ? ORDER BY r.reservation_date DESC`, [req.user.id], (err, reservations) => {
    if (err) return res.status(500).json({ error: 'データ取得エラー' });
    res.json(reservations);
  });
});

// 使用禁止設定を追加するAPI
app.post('/api/admin/classroom-closures', authenticateAdmin, (req, res) => {
  const { classroomId, closureDate, restrictionType } = req.body;

  if (!classroomId || !closureDate || !restrictionType) {
    return res.status(400).json({ error: '必須項目が不足しています' });
  }

  // 'available' (使用可) が選択された場合は、データベースからその日の制限を削除
  if (restrictionType === 'available') {
    const sql = 'DELETE FROM classroom_closures WHERE classroom_id = ? AND closure_date = ?';
    db.run(sql, [classroomId, closureDate], function (err) {
      if (err) {
        console.error('削除エラー:', err);
        return res.status(500).json({ error: 'データベースエラー' });
      }
      res.status(200).json({ message: '使用制限を解除しました' });
    });
  } else {
    // 'closed' (使用不可) または 'no-sound' (音出し禁止) の場合
    const sql = `
            INSERT OR REPLACE INTO classroom_closures 
            (classroom_id, closure_date, restriction_type, created_by) 
            VALUES (?, ?, ?, ?)
        `;
    db.run(sql, [classroomId, closureDate, restrictionType, req.user.id], function (err) {
      if (err) {
        console.error('挿入エラー:', err);
        return res.status(500).json({ error: 'データベースエラー' });
      }
      res.status(201).json({ message: '使用制限を保存しました' });
    });
  }
});

app.get('/api/admin/classroom-closures', authenticateAdmin, (req, res) => {
  const sql = "SELECT classroom_id, closure_date, restriction_type FROM classroom_closures WHERE closure_date >= date('now', '-1 day')";
  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'データベースエラー' });
    }
    res.json(rows);
  });
});

// 音出し制限情報を取得するAPI（一般ユーザー用）
app.get('/api/classroom-closures', authenticateToken, (req, res) => {
  const { date } = req.query;
  let sql = `
        SELECT classroom_id, closure_date, restriction_type 
        FROM classroom_closures 
        WHERE closure_date >= date('now', '-1 day')
    `;
  const params = [];

  if (date) {
    sql += ' AND closure_date = ?';
    params.push(date);
  }

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('使用制限情報取得エラー:', err);
      return res.status(500).json({ error: 'データベースエラー' });
    }
    res.json(rows);
  });
});

// 使用禁止設定を取得するAPI
app.get('/api/admin/classroom-closures', authenticateAdmin, (req, res) => {
  const sql = `
        SELECT cc.*, c.room_number, c.room_name, b.name as building_name, o.name as created_by_name
        FROM classroom_closures cc
        JOIN classrooms c ON cc.classroom_id = c.id
        JOIN buildings b ON c.building_id = b.id
        JOIN organizations o ON cc.created_by = o.id
        WHERE cc.closure_date >= date('now')
        ORDER BY cc.closure_date, b.name, c.room_number
    `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('使用禁止設定取得エラー:', err);
      return res.status(500).json({ error: 'データ取得エラー' });
    }
    res.json(rows);
  });
});

// 使用禁止設定を削除するAPI
app.delete('/api/admin/classroom-closures/:id', authenticateAdmin, (req, res) => {
  db.run('DELETE FROM classroom_closures WHERE id = ?', [req.params.id], function (err) {
    if (err) {
      console.error('使用禁止設定削除エラー:', err);
      return res.status(500).json({ error: '削除に失敗しました。' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: '該当する設定が見つかりません。' });
    }
    res.json({ message: '使用禁止設定を削除しました。' });
  });
});

// 予約状況取得APIを修正
app.get('/api/reservations/status', authenticateToken, (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: '日付を指定してください。' });
  }

  // 予約済みと使用不可（closed）のみを取得（音出し禁止は含めない）
  const sql = `
        SELECT classroom_id FROM reservations WHERE reservation_date = ?
        UNION
        SELECT classroom_id FROM classroom_closures WHERE closure_date = ? AND restriction_type = 'closed'
    `;

  db.all(sql, [date, date], (err, rows) => {
    if (err) {
      console.error('予約状況の取得エラー:', err);
      return res.status(500).json({ error: 'サーバーエラーが発生しました。' });
    }
    res.json({ reservedClassroomIds: rows.map(r => r.classroom_id) });
  });
});

// 予約期間を取得する関数（サーバー側）
function getReservationPeriod() {
  // script.jsと同じロジックを実装
  const getWeekNumber = (date) => {
    const baseDate = new Date('2024-01-01');
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const diffTime = targetDate.getTime() - baseDate.getTime();
    const diffWeeks = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000));
    return diffWeeks + 1;
  };

  const getMonday = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  };

  const now = new Date();
  const currentWeekNumber = getWeekNumber(now);
  const currentMonday = getMonday(now);

  let reservationStartMonday;

  if (currentWeekNumber % 2 === 1) {
    reservationStartMonday = currentMonday;
  } else {
    reservationStartMonday = new Date(currentMonday);
    reservationStartMonday.setDate(currentMonday.getDate() - 7);
  }

  const reservationEndDate = new Date(reservationStartMonday);
  reservationEndDate.setDate(reservationStartMonday.getDate() + 13);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const effectiveStartDate = reservationStartMonday < today ? today : reservationStartMonday;

  return {
    start: effectiveStartDate,
    end: reservationEndDate
  };
}

// 日ごとの予約リクエストAPI
app.post('/api/reservation-request', authenticateToken, async(req, res) => {
  const { requestDate, classroomIds, purpose, expectedParticipants } = req.body;
  const organizationId = req.user.id;

  try {
        const reservationLimit = 3;

        const existingReservations = await new Promise((resolve, reject) => {
            const sql = "SELECT COUNT(*) as count FROM reservations WHERE organization_id = ? AND reservation_date = ?";
            db.get(sql, [organizationId, requestDate], (err, row) => {
                if (err) return reject(new Error('既存の予約数の確認に失敗しました。'));
                resolve(row.count);
            });
        });

        const pendingRequests = await new Promise((resolve, reject) => {
            const sql = "SELECT COUNT(*) as count FROM reservation_requests WHERE organization_id = ? AND request_date = ? AND status = 'pending' AND is_cancelled = 0";
            db.get(sql, [organizationId, requestDate], (err, row) => {
                if (err) return reject(new Error('申請中の予約数の確認に失敗しました。'));
                resolve(row.count);
            });
        });
    
        if (existingReservations + pendingRequests >= reservationLimit) {
            return res.status(400).json({
                error: `1日の予約上限（${reservationLimit}件）に達しているため、同じ日にはこれ以上予約できません。`
            });
        }
    } catch (error) {
        console.error('予約上限チェックエラー:', error);
        return res.status(500).json({ error: 'サーバーエラーが発生しました。' });
    }

  const getWeekNumber = (date) => {
    const baseDate = new Date('2024-01-01');
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const diffTime = targetDate.getTime() - baseDate.getTime();
    const diffWeeks = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000));
    return diffWeeks + 1;
  };

  const getMonday = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  };

  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentWeekNumber = getWeekNumber(now);

  const thisWeekMonday = getMonday(now);
  const reservationStartDate = new Date(thisWeekMonday);
  const reservationEndDate = new Date(thisWeekMonday);
  reservationEndDate.setDate(thisWeekMonday.getDate() + 13);

  const requestedDate = new Date(requestDate);
  requestedDate.setHours(0, 0, 0, 0);

  if (requestedDate < today) {
    return res.status(400).json({ error: '過去の日付は予約できません。' });
  }

  if (requestedDate < reservationStartDate || requestedDate > reservationEndDate) {
    const formatDate = (d) => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    return res.status(400).json({
      error: `予約期間外です。現在予約可能なのは${formatDate(reservationStartDate)}から${formatDate(reservationEndDate)}までです。`
    });
  }

  if (!requestDate || !classroomIds || !purpose || expectedParticipants === undefined) {
    return res.status(400).json({ error: '必須項目が不足しています' });
  }

  const participants = Number(expectedParticipants);
  if (isNaN(participants) || participants <= 0) {
    return res.status(400).json({ error: '参加予定人数は1以上の数値を入力してください。' });
  }

  const cycleStart = new Date();
  cycleStart.setMinutes(Math.floor(new Date().getMinutes() / 30) * 30, 0, 0);

  db.run(`INSERT INTO reservation_requests (organization_id, request_date, classroom_ids, cycle_start_time, purpose, expected_participants) VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user.id, requestDate, JSON.stringify(classroomIds), cycleStart.toISOString(), purpose, participants],
    function (err) {
      if (err) return res.status(500).json({ error: '予約リクエストの送信に失敗しました' });
      res.status(201).json({
        message: '予約リクエストを送信しました',
        requestId: this.lastID
      });
    }
  );
});

app.post('/api/cancel-request/:id', authenticateToken, async (req, res) => {
  try {
    const request = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM reservation_requests WHERE id = ? AND organization_id = ?',
        [req.params.id, req.user.id], (err, row) => err ? reject(err) : resolve(row));
    });

    if (!request) {
      return res.status(404).json({ error: '該当する予約リクエストが見つかりません。' });
    }

    if (request.is_cancelled) {
      return res.status(400).json({ error: 'この予約リクエストは既にキャンセル済みです。' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'この予約リクエストはキャンセルできません。（既に処理済み）' });
    }

    await new Promise((resolve, reject) => {
      db.run('UPDATE reservation_requests SET is_cancelled = 1, cancelled_at = CURRENT_TIMESTAMP WHERE id = ?',
        [req.params.id], (err) => err ? reject(err) : resolve());
    });

    res.json({ message: '予約リクエストをキャンセルしました。' });

  } catch (error) {
    console.error('キャンセル処理エラー:', error);
    res.status(500).json({ error: 'キャンセル処理中にエラーが発生しました。' });
  }
});

// パスワードリセット機能（管理者向け）
app.post('/api/admin/reset-password', authenticateAdmin, async (req, res) => {
  try {
    const { loginId } = req.body;
    
    if (!loginId) {
      return res.status(400).json({ error: 'ログインIDが必要です。' });
    }

    const org = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM organizations WHERE login_id = ?', [loginId], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (!org) {
      return res.status(404).json({ error: '該当する団体が見つかりません。' });
    }

    // 新しいランダムパスワードを生成
    const newPassword = crypto.randomBytes(4).toString('hex');
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // パスワードを更新し、初回ログインフラグをリセット
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE organizations SET password_hash = ?, is_first_login = 1 WHERE id = ?',
        [hashedPassword, org.id],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });

    console.log(`[管理者操作] パスワードリセット: ${org.name} | 新パスワード: ${newPassword}`);

    res.json({ 
      message: `${org.name}のパスワードをリセットしました。`,
      newPassword: newPassword,
      note: '新しいパスワードを該当団体に連絡してください。'
    });

  } catch (error) {
    console.error('パスワードリセットエラー:', error);
    res.status(500).json({ error: '処理中にエラーが発生しました。' });
  }
});

// パスワード変更API（ログイン済みユーザー用）
app.post('/api/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: '現在のパスワードと新しいパスワードが必要です。' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'パスワードは6文字以上で設定してください。' });
    }

    // 現在のユーザー情報を取得
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM organizations WHERE id = ?', [req.user.id], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (!user) {
      return res.status(404).json({ error: 'ユーザーが見つかりません。' });
    }

    // 現在のパスワードを確認
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ error: '現在のパスワードが正しくありません。' });
    }

    // 新しいパスワードをハッシュ化
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // パスワードを更新
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE organizations SET password_hash = ? WHERE id = ?',
        [hashedNewPassword, user.id],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });

    res.json({ message: 'パスワードを変更しました。' });

  } catch (error) {
    console.error('パスワード変更エラー:', error);
    res.status(500).json({ error: '処理中にエラーが発生しました。' });
  }
});

// デバッグ用：データベースの状態を確認
app.get('/api/debug/check-database', authenticateToken, (req, res) => {
  const results = {};

  // テーブルの存在確認
  db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
    if (err) {
      return res.status(500).json({ error: 'テーブル確認エラー', details: err.message });
    }

    results.tables = tables.map(t => t.name);

    // classroomsテーブルのデータ数を確認
    db.get("SELECT COUNT(*) as count FROM classrooms", [], (err, row) => {
      if (err) {
        results.classroomCount = 'エラー: ' + err.message;
      } else {
        results.classroomCount = row.count;
      }

      // サンプルデータを取得
      db.all("SELECT * FROM classrooms LIMIT 5", [], (err, rows) => {
        if (err) {
          results.sampleClassrooms = 'エラー: ' + err.message;
        } else {
          results.sampleClassrooms = rows;
        }

        res.json(results);
      });
    });
  });
});

// お知らせを取得（認証必須）
app.get('/api/system-notice', authenticateToken, (req, res) => {
  db.get('SELECT notice_text FROM system_notices ORDER BY updated_at DESC LIMIT 1', [], (err, row) => {
    if (err) {
      console.error('お知らせ取得エラー:', err);
      return res.status(500).json({ error: 'お知らせの取得に失敗しました' });
    }
    res.json({ notice: row ? row.notice_text : '' });
  });
});

// お知らせを更新（管理者のみ）
app.post('/api/admin/system-notice', authenticateAdmin, (req, res) => {
  const { noticeText } = req.body;

  db.run('INSERT INTO system_notices (notice_text, updated_by) VALUES (?, ?)',
    [noticeText, req.user.id],
    function (err) {
      if (err) {
        console.error('お知らせ更新エラー:', err);
        return res.status(500).json({ error: 'お知らせの更新に失敗しました' });
      }
      res.json({ message: 'お知らせを更新しました' });
    }
  );
});

// 使用禁止設定を追加するAPIを修正
app.post('/api/admin/classroom-closures', authenticateAdmin, async (req, res) => {
  const { classroomId, closureDate, restrictionType, reason } = req.body;

  try {
    // 既存の予約をチェック（音出し禁止の場合はスキップ）
    if (restrictionType === 'closed') {
      const existingReservation = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM reservations WHERE classroom_id = ? AND reservation_date = ?',
          [classroomId, closureDate], (err, row) => err ? reject(err) : resolve(row));
      });

      if (existingReservation) {
        return res.status(400).json({ error: 'この日付には既に予約があります。' });
      }
    }

    // 使用制限を追加または更新
    await new Promise((resolve, reject) => {
      db.run(`INSERT OR REPLACE INTO classroom_closures 
                    (classroom_id, closure_date, restriction_type, reason, created_by) 
                    VALUES (?, ?, ?, ?, ?)`,
        [classroomId, closureDate, restrictionType, reason, req.user.id],
        (err) => err ? reject(err) : resolve());
    });

    res.json({ message: '使用制限設定を更新しました。' });

  } catch (error) {
    console.error('使用制限設定エラー:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました。' });
  }
});

// スケジュールされたタスク
cron.schedule('*/5 * * * *', processReservationRequests);
cron.schedule('1 0 * * 1', cleanupOldRecords);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`サーバーが http://localhost:${PORT} で起動しました`);
});
