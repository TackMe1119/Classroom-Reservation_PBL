// server.js
require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const db = new sqlite3.Database('./reservation.db');

// データベース初期化
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY,
    login_id TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    is_first_login BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    role TEXT NOT NULL DEFAULT 'user'
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
    restriction_type TEXT NOT NULL DEFAULT 'closed',
    reason TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (classroom_id) REFERENCES classrooms (id),
    FOREIGN KEY (created_by) REFERENCES organizations (id),
    UNIQUE(classroom_id, closure_date)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS system_notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notice_text TEXT,
    updated_by INTEGER NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES organizations (id)
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
    db.run("INSERT OR IGNORE INTO buildings (name, description) VALUES (?, ?)", building);
  });

  const classrooms = [
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

  classrooms.forEach(room => {
    db.run(`INSERT OR IGNORE INTO classrooms (building_id, is_usable, floor, room_number, room_name, capacity, seat_type) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`, room);
  });

  const organizations = [
    { loginId: 'admin', name: 'システム管理者', role: 'admin', password: 'adminpass' },
    { loginId: '交響01', name: '交響01', role: 'user' },
    { loginId: '交響02', name: '交響02', role: 'user' },
    { loginId: '交響03', name: '交響03', role: 'user' },
    { loginId: '交響04', name: '交響04', role: 'user' },
    { loginId: '交響05', name: '交響05', role: 'user' },
    { loginId: '混成01', name: '混成01', role: 'user' },
    { loginId: '混成02', name: '混成02', role: 'user' },
    { loginId: '混成03', name: '混成03', role: 'user' },
    { loginId: '混成04', name: '混成04', role: 'user' },
    { loginId: '混成05', name: '混成05', role: 'user' },
    { loginId: 'ロボ01', name: 'ロボ01', role: 'user' },
    { loginId: 'ロボ02', name: 'ロボ02', role: 'user' },
    { loginId: 'ロボ03', name: 'ロボ03', role: 'user' },
    { loginId: 'ロボ04', name: 'ロボ04', role: 'user' },
    { loginId: 'ロボ05', name: 'ロボ05', role: 'user' }
  ];

  organizations.forEach(async (org) => {
    db.get('SELECT login_id FROM organizations WHERE login_id = ?', [org.loginId], async (err, row) => {
      if (!row) {
        const password = org.role === 'admin' ? org.password : crypto.randomBytes(4).toString('hex');
        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.run(`INSERT INTO organizations (login_id, password_hash, name, role) VALUES (?, ?, ?, ?)`,
          [org.loginId, hashedPassword, org.name, org.role]);
        
        if (org.role !== 'admin') {
          console.log(`団体: ${org.name} | パスワード: ${password}`);
        }
      }
    });
  });

  setTimeout(() => {
    db.run(`INSERT OR IGNORE INTO system_notices (id, notice_text, updated_by) 
            VALUES (1, 'システムからのお知らせがここに表示されます。', 1)`);
  }, 1000);
}

app.use(express.json());
app.use(express.static('public'));

// 認証ミドルウェア
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

// 予約処理
async function processReservationRequests() {
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
    if (err || requests.length === 0) return;

    for (const request of requests) {
      try {
        const classroomIds = JSON.parse(request.classroom_ids);
        let assignedClassroom = null;

        for (const classroomId of classroomIds) {
          const existingReservation = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM reservations WHERE classroom_id = ? AND reservation_date = ?',
              [classroomId, request.request_date],
              (err, row) => err ? reject(err) : resolve(row));
          });

          if (!existingReservation) {
            assignedClassroom = classroomId;
            break;
          }
        }

        if (assignedClassroom) {
          await new Promise((resolve, reject) => {
            db.run('INSERT INTO reservations (organization_id, classroom_id, reservation_date, purpose, participants) VALUES (?, ?, ?, ?, ?)',
              [request.organization_id, assignedClassroom, request.request_date, request.purpose, request.expected_participants],
              (err) => err ? reject(err) : resolve());
          });

          await new Promise((resolve, reject) => {
            db.run('UPDATE reservation_requests SET status = ?, assigned_classroom_id = ? WHERE id = ?',
              ['approved', assignedClassroom, request.id],
              (err) => err ? reject(err) : resolve());
          });

          const classroomInfo = await new Promise((resolve, reject) => {
            db.get(`SELECT c.*, b.name as building_name FROM classrooms c 
                    JOIN buildings b ON c.building_id = b.id WHERE c.id = ?`,
              [assignedClassroom], (err, row) => err ? reject(err) : resolve(row));
          });

          console.log(`✅ 予約承認: ${request.org_name} - ${request.request_date} - ${classroomInfo.building_name} ${classroomInfo.room_number}`);

        } else {
          await new Promise((resolve, reject) => {
            db.run('UPDATE reservation_requests SET status = ? WHERE id = ?', 
              ['rejected', request.id], 
              (err) => err ? reject(err) : resolve());
          });

          console.log(`❌ 予約却下: ${request.org_name} - ${request.request_date} - 教室が満室`);
        }
      } catch (e) {
        console.error(`リクエストID ${request.id} の処理エラー:`, e);
      }
    }
  });
}

async function cleanupOldRecords() {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);
    const cutoffDateString = cutoffDate.toISOString().split('T')[0];

    await new Promise((resolve, reject) => {
      db.run(`DELETE FROM reservations WHERE reservation_date < ?`, [cutoffDateString], function (err) {
        if (err) return reject(err);
        resolve();
      });
    });

    await new Promise((resolve, reject) => {
      db.run(`DELETE FROM reservation_requests WHERE request_date < ?`, [cutoffDateString], function (err) {
        if (err) return reject(err);
        resolve();
      });
    });
  } catch (error) {
    console.error('クリーンアップエラー:', error);
  }
}

// APIエンドポイント

// 認証関連
app.get('/api/organizations', (req, res) => {
  const sql = `
    SELECT login_id, name 
    FROM organizations 
    ORDER BY 
      CASE WHEN role = 'admin' THEN 0 ELSE 1 END, 
      name`;
  
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: '団体の取得に失敗しました。' });
    res.json(rows);
  });
});

app.post('/api/login', async (req, res) => {
  const { loginId, password } = req.body;

  try {
    const org = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM organizations WHERE login_id = ?', [loginId], 
        (err, row) => err ? reject(err) : resolve(row));
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

app.get('/api/user-info', authenticateToken, async (req, res) => {
  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT login_id, name FROM organizations WHERE id = ?',
        [req.user.id], (err, row) => err ? reject(err) : resolve(row));
    });

    if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません。' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'サーバーエラーが発生しました。' });
  }
});

app.post('/api/complete-first-login', authenticateToken, async (req, res) => {
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'パスワードは6文字以上で設定してください。' });
  }

  try {
    const currentUser = await new Promise((resolve, reject) => {
      db.get('SELECT is_first_login FROM organizations WHERE id = ?', [req.user.id], 
        (err, row) => err ? reject(err) : resolve(row));
    });

    if (!currentUser || !currentUser.is_first_login) {
      return res.status(400).json({ error: '初回ログイン設定は既に完了しています。' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await new Promise((resolve, reject) => {
      db.run('UPDATE organizations SET password_hash = ?, is_first_login = 0 WHERE id = ?',
        [hashedPassword, req.user.id],
        (err) => err ? reject(err) : resolve());
    });

    const newToken = jwt.sign(
      { id: req.user.id, loginId: req.user.loginId, name: req.user.name, role: req.user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ message: '初回ログイン設定が完了しました。', token: newToken });
  } catch (error) {
    res.status(500).json({ error: '設定中にエラーが発生しました。' });
  }
});

app.post('/api/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'パスワードは6文字以上で設定してください。' });
  }

  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM organizations WHERE id = ?', [req.user.id], 
        (err, row) => err ? reject(err) : resolve(row));
    });

    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
      return res.status(401).json({ error: '現在のパスワードが正しくありません。' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await new Promise((resolve, reject) => {
      db.run('UPDATE organizations SET password_hash = ? WHERE id = ?',
        [hashedNewPassword, user.id],
        (err) => err ? reject(err) : resolve());
    });

    res.json({ message: 'パスワードを変更しました。' });
  } catch (error) {
    res.status(500).json({ error: '処理中にエラーが発生しました。' });
  }
});

// 教室関連
app.get('/api/buildings', (req, res) => {
  db.all('SELECT * FROM buildings ORDER BY name', (err, buildings) => {
    if (err) return res.status(500).json({ error: 'データ取得エラー' });
    res.json(buildings);
  });
});

app.get('/api/classrooms/:buildingId', (req, res) => {
  const sql = `
    SELECT c.*, b.name as building_name 
    FROM classrooms c 
    JOIN buildings b ON c.building_id = b.id 
    WHERE c.building_id = ? AND c.is_usable = 1 
    ORDER BY c.floor, c.room_number`;
  
  db.all(sql, [req.params.buildingId], (err, classrooms) => {
    if (err) return res.status(500).json({ error: 'データ取得エラー' });
    res.json(classrooms);
  });
});

app.get('/api/classrooms/details/:id', (req, res) => {
  const sql = `
    SELECT c.*, b.name as building_name 
    FROM classrooms c 
    JOIN buildings b ON c.building_id = b.id 
    WHERE c.id = ?`;
  
  db.get(sql, [req.params.id], (err, room) => {
    if (err) return res.status(500).json({ error: '教室詳細の取得エラー' });
    if (!room) return res.status(404).json({ error: '教室が見つかりません' });
    res.json(room);
  });
});

app.get('/api/classrooms/all', authenticateToken, (req, res) => {
  db.all('SELECT id, room_number, floor, is_usable FROM classrooms', [], (err, classrooms) => {
    if (err) return res.status(500).json({ error: '教室データの取得に失敗しました。' });
    res.json(classrooms || []);
  });
});

// 予約関連
app.get('/api/reservations/status', authenticateToken, (req, res) => {
  const { date } = req.query;

  if (!date) return res.status(400).json({ error: '日付を指定してください。' });

  const sql = `
    SELECT classroom_id FROM reservations WHERE reservation_date = ?
    UNION
    SELECT classroom_id FROM classroom_closures WHERE closure_date = ? AND restriction_type = 'closed'`;

  db.all(sql, [date, date], (err, rows) => {
    if (err) return res.status(500).json({ error: 'サーバーエラーが発生しました。' });
    res.json({ reservedClassroomIds: rows.map(r => r.classroom_id) });
  });
});

app.post('/api/reservation-request', authenticateToken, async (req, res) => {
  const { requestDate, classroomIds, purpose, expectedParticipants } = req.body;
  const organizationId = req.user.id;

  try {
    const reservationLimit = 3;

    const existingReservations = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM reservations WHERE organization_id = ? AND reservation_date = ?',
        [organizationId, requestDate], 
        (err, row) => err ? reject(err) : resolve(row.count));
    });

    const pendingRequests = await new Promise((resolve, reject) => {
      db.get(`SELECT COUNT(*) as count FROM reservation_requests 
              WHERE organization_id = ? AND request_date = ? AND status = 'pending' AND is_cancelled = 0`,
        [organizationId, requestDate], 
        (err, row) => err ? reject(err) : resolve(row.count));
    });

    if (existingReservations + pendingRequests >= reservationLimit) {
      return res.status(400).json({
        error: `1日の予約上限（${reservationLimit}件）に達しているため、同じ日にはこれ以上予約できません。`
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const maxDaysAhead = 14;
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + maxDaysAhead);
    maxDate.setHours(0, 0, 0, 0);

    const requestedDate = new Date(requestDate);
    requestedDate.setHours(0, 0, 0, 0);

    if (requestedDate < today) {
      return res.status(400).json({ error: '過去の日付は予約できません。' });
    }

    if (requestedDate > maxDate) {
      return res.status(400).json({
        error: `予約は${maxDaysAhead}日後まで可能です。`
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

    db.run(`INSERT INTO reservation_requests 
            (organization_id, request_date, classroom_ids, cycle_start_time, purpose, expected_participants) 
            VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, requestDate, JSON.stringify(classroomIds), cycleStart.toISOString(), purpose, participants],
      function (err) {
        if (err) return res.status(500).json({ error: '予約リクエストの送信に失敗しました' });
        res.status(201).json({
          message: '予約リクエストを送信しました',
          requestId: this.lastID
        });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'サーバーエラーが発生しました。' });
  }
});

app.get('/api/my-requests', authenticateToken, async (req, res) => {
  try {
    const sql = `
      SELECT rr.*, c.room_number, c.room_name, b.name as building_name 
      FROM reservation_requests rr 
      LEFT JOIN classrooms c ON rr.assigned_classroom_id = c.id 
      LEFT JOIN buildings b ON c.building_id = b.id 
      WHERE rr.organization_id = ? 
      ORDER BY rr.submitted_at DESC`;
    
    const requests = await new Promise((resolve, reject) => {
      db.all(sql, [req.user.id], (err, rows) => err ? reject(err) : resolve(rows));
    });
    
    const processedRequests = await Promise.all(requests.map(async (req) => {
      const classroomIds = JSON.parse(req.classroom_ids || '[]');
      if (classroomIds.length === 0) return { ...req, requested_classrooms_details: [] };
      
      const requestedClassroomsInfo = await new Promise((resolve, reject) => {
        db.all(`SELECT id, room_number, room_name FROM classrooms 
                WHERE id IN (${classroomIds.map(() => '?').join(',')})`, 
          classroomIds, (err, rooms) => err ? reject(err) : resolve(rooms));
      });
      
      return { ...req, requested_classrooms_details: requestedClassroomsInfo };
    }));
    
    res.json(processedRequests);
  } catch (error) {
    res.status(500).json({ error: 'データ取得エラー' });
  }
});

app.get('/api/my-reservations', authenticateToken, (req, res) => {
  const sql = `
    SELECT r.*, c.room_number, c.room_name, b.name as building_name 
    FROM reservations r 
    JOIN classrooms c ON r.classroom_id = c.id 
    JOIN buildings b ON c.building_id = b.id 
    WHERE r.organization_id = ? 
    ORDER BY r.reservation_date DESC`;
  
  db.all(sql, [req.user.id], (err, reservations) => {
    if (err) return res.status(500).json({ error: 'データ取得エラー' });
    res.json(reservations);
  });
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
    res.status(500).json({ error: 'キャンセル処理中にエラーが発生しました。' });
  }
});

// 管理者機能
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

app.post('/api/admin/classroom-closures', authenticateAdmin, async (req, res) => {
  const { classroomId, closureDate, restrictionType, reason } = req.body;

  if (!classroomId || !closureDate || !restrictionType) {
    return res.status(400).json({ error: '必須項目が不足しています' });
  }

  try {
    if (restrictionType === 'available') {
      db.run('DELETE FROM classroom_closures WHERE classroom_id = ? AND closure_date = ?',
        [classroomId, closureDate], function (err) {
          if (err) return res.status(500).json({ error: 'データベースエラー' });
          res.json({ message: '使用制限を解除しました' });
        });
    } else {
      if (restrictionType === 'closed') {
        const existingReservation = await new Promise((resolve, reject) => {
          db.get('SELECT * FROM reservations WHERE classroom_id = ? AND reservation_date = ?',
            [classroomId, closureDate], (err, row) => err ? reject(err) : resolve(row));
        });

        if (existingReservation) {
          return res.status(400).json({ error: 'この日付には既に予約があります。' });
        }
      }

      db.run(`INSERT OR REPLACE INTO classroom_closures 
              (classroom_id, closure_date, restriction_type, reason, created_by) 
              VALUES (?, ?, ?, ?, ?)`,
        [classroomId, closureDate, restrictionType, reason, req.user.id],
        function (err) {
          if (err) return res.status(500).json({ error: 'データベースエラー' });
          res.status(201).json({ message: '使用制限を保存しました' });
        });
    }
  } catch (error) {
    res.status(500).json({ error: 'サーバーエラーが発生しました。' });
  }
});

app.get('/api/admin/classroom-closures', authenticateAdmin, (req, res) => {
  const sql = `
    SELECT cc.*, c.room_number, c.room_name, b.name as building_name, o.name as created_by_name
    FROM classroom_closures cc
    JOIN classrooms c ON cc.classroom_id = c.id
    JOIN buildings b ON c.building_id = b.id
    JOIN organizations o ON cc.created_by = o.id
    WHERE cc.closure_date >= date('now')
    ORDER BY cc.closure_date, b.name, c.room_number`;

  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'データ取得エラー' });
    res.json(rows);
  });
});

app.delete('/api/admin/classroom-closures/:id', authenticateAdmin, (req, res) => {
  db.run('DELETE FROM classroom_closures WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: '削除に失敗しました。' });
    if (this.changes === 0) return res.status(404).json({ error: '該当する設定が見つかりません。' });
    res.json({ message: '使用禁止設定を削除しました。' });
  });
});

app.post('/api/admin/reset-password', authenticateAdmin, async (req, res) => {
  const { loginId } = req.body;
  
  if (!loginId) return res.status(400).json({ error: 'ログインIDが必要です。' });

  try {
    const org = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM organizations WHERE login_id = ?', [loginId], 
        (err, row) => err ? reject(err) : resolve(row));
    });

    if (!org) return res.status(404).json({ error: '該当する団体が見つかりません。' });

    const newPassword = crypto.randomBytes(4).toString('hex');
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await new Promise((resolve, reject) => {
      db.run('UPDATE organizations SET password_hash = ?, is_first_login = 1 WHERE id = ?',
        [hashedPassword, org.id],
        (err) => err ? reject(err) : resolve());
    });

    console.log(`パスワードリセット: ${org.name} | 新パスワード: ${newPassword}`);

    res.json({ 
      message: `${org.name}のパスワードをリセットしました。`,
      newPassword: newPassword,
      note: '新しいパスワードを該当団体に連絡してください。'
    });
  } catch (error) {
    res.status(500).json({ error: '処理中にエラーが発生しました。' });
  }
});

// お知らせ機能
app.get('/api/system-notice', authenticateToken, (req, res) => {
  db.get('SELECT notice_text FROM system_notices ORDER BY updated_at DESC LIMIT 1', [], 
    (err, row) => {
      if (err) return res.status(500).json({ error: 'お知らせの取得に失敗しました' });
      res.json({ notice: row ? row.notice_text : '' });
    });
});

app.post('/api/admin/system-notice', authenticateAdmin, (req, res) => {
  const { noticeText } = req.body;

  db.run('INSERT INTO system_notices (notice_text, updated_by) VALUES (?, ?)',
    [noticeText, req.user.id],
    function (err) {
      if (err) return res.status(500).json({ error: 'お知らせの更新に失敗しました' });
      res.json({ message: 'お知らせを更新しました' });
    });
});

// 使用制限情報取得（一般ユーザー用）
app.get('/api/classroom-closures', authenticateToken, (req, res) => {
  const { date } = req.query;
  let sql = `
    SELECT classroom_id, closure_date, restriction_type 
    FROM classroom_closures 
    WHERE closure_date >= date('now', '-1 day')`;
  const params = [];

  if (date) {
    sql += ' AND closure_date = ?';
    params.push(date);
  }

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'データベースエラー' });
    res.json(rows);
  });
});

// デバッグ用エンドポイント（問題解決後は削除してください）
app.get('/api/debug/check-db', (req, res) => {
  const results = {};
  
  db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
    if (err) {
      return res.status(500).json({ error: 'テーブル確認エラー', details: err.message });
    }
    
    results.tables = tables.map(t => t.name);
    
    db.get("SELECT COUNT(*) as count FROM classrooms", [], (err, row) => {
      if (err) {
        results.classroomCount = 'エラー: ' + err.message;
      } else {
        results.classroomCount = row.count;
      }
      
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

// スケジューラー設定
cron.schedule('*/5 * * * *', processReservationRequests);
cron.schedule('1 0 * * 1', cleanupOldRecords);

// サーバー起動
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`サーバーが http://localhost:${PORT} で起動しました`);
});
