'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
const { z } = require('zod');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DB_PATH = path.resolve(process.env.DB_PATH || './data/construction-classroom.db');
const JWT_SECRET = process.env.JWT_SECRET || '';
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || 'teacher').trim();
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';
const TOKEN_EXPIRES_IN = process.env.TOKEN_EXPIRES_IN || '4h';
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000,null')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

if (!JWT_SECRET || JWT_SECRET.length < 24) {
  console.error('JWT_SECRET 환경변수는 24자 이상의 임의 문자열이어야 합니다.');
  process.exit(1);
}
if (!ADMIN_USERNAME || ADMIN_USERNAME.length > 40 || !/^[A-Za-z0-9_.-]+$/.test(ADMIN_USERNAME)) {
  console.error('ADMIN_USERNAME은 1~40자의 영문, 숫자, _, -, .만 사용할 수 있습니다.');
  process.exit(1);
}
if (!ADMIN_PASSWORD_HASH || !ADMIN_PASSWORD_HASH.startsWith('$2')) {
  console.error('ADMIN_PASSWORD_HASH 환경변수에 bcrypt 해시를 설정해 주세요.');
  process.exit(1);
}

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_code TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS class_settings (
      class_id INTEGER PRIMARY KEY,
      assessment_open INTEGER NOT NULL DEFAULT 1,
      leaderboard_visible INTEGER NOT NULL DEFAULT 1,
      scoring_mode TEXT NOT NULL DEFAULT 'partial',
      length_tolerance_percent REAL NOT NULL DEFAULT 1.5,
      angle_tolerance_degrees REAL NOT NULL DEFAULT 1.5,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assessment_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_submission_id TEXT NOT NULL UNIQUE,
      class_id INTEGER NOT NULL,
      student_name TEXT NOT NULL,
      score INTEGER NOT NULL,
      correct_count INTEGER NOT NULL,
      total_time_ms INTEGER NOT NULL,
      segment_score INTEGER NOT NULL,
      angle_score INTEGER NOT NULL,
      submitted_at TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS question_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assessment_result_id INTEGER NOT NULL,
      question_index INTEGER NOT NULL,
      question_type TEXT NOT NULL,
      target_value REAL NOT NULL,
      student_value REAL,
      error_value REAL,
      score INTEGER NOT NULL,
      attempts INTEGER NOT NULL,
      time_ms INTEGER NOT NULL,
      submitted_at TEXT NOT NULL,
      FOREIGN KEY (assessment_result_id) REFERENCES assessment_results(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_results_class ON assessment_results(class_id);
    CREATE INDEX IF NOT EXISTS idx_results_student ON assessment_results(class_id, student_name);
    CREATE INDEX IF NOT EXISTS idx_results_submitted ON assessment_results(submitted_at);
    CREATE INDEX IF NOT EXISTS idx_question_result_parent ON question_results(assessment_result_id);
  `);
}
migrate();

const app = express();
app.disable('x-powered-by');
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    const normalized = origin;
    if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(normalized)) {
      callback(null, true);
      return;
    }
    callback(new Error('허용되지 않은 출처입니다.'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.PUBLIC_RATE_LIMIT || 120),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }
});
const submitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: Number(process.env.SUBMIT_RATE_LIMIT || 20),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: '짧은 시간에 제출이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }
});
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.ADMIN_RATE_LIMIT || 40),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: '관리자 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }
});
app.use('/api', publicLimiter);

const safeTextPattern = /^[\p{L}\p{N}\s_.\-가-힣]+$/u;
const classCodeSchema = z.string().trim().min(1).max(20).regex(safeTextPattern, '학급 코드 형식이 올바르지 않습니다.');
const studentNameSchema = z.string().trim().min(1).max(12).regex(safeTextPattern, '별명 형식이 올바르지 않습니다.');
const isoDateSchema = z.string().datetime({ offset: true }).or(z.string().datetime());
const allowedSegmentTargets = new Set([105, 125, 145, 165, 185, 205, 225, 245]);
const allowedAngleTargets = new Set([30, 45, 60, 75, 90, 105, 120, 135, 150]);

const questionSchema = z.object({
  questionIndex: z.number().int().min(0).max(9),
  questionType: z.enum(['segment', 'angle']),
  targetValue: z.number().finite().positive().max(10000),
  studentValue: z.number().finite().nonnegative().max(10000).nullable(),
  attempts: z.number().int().min(1).max(100),
  timeMs: z.number().int().min(0).max(60 * 60 * 1000),
  submittedAt: isoDateSchema
}).superRefine((question, ctx) => {
  if (question.questionType === 'segment' && !allowedSegmentTargets.has(question.targetValue)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '허용되지 않은 선분 문제 목표값입니다.' });
  }
  if (question.questionType === 'angle' && !allowedAngleTargets.has(question.targetValue)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '허용되지 않은 각 문제 목표값입니다.' });
  }
  if (question.questionType === 'angle' && question.studentValue !== null && question.studentValue > 180.001) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '각도 결과값의 범위가 올바르지 않습니다.' });
  }
});

const resultSchema = z.object({
  clientSubmissionId: z.string().uuid(),
  classCode: classCodeSchema,
  studentName: studentNameSchema,
  totalTimeMs: z.number().int().min(1000).max(6 * 60 * 60 * 1000),
  submittedAt: isoDateSchema,
  questions: z.array(questionSchema).length(10)
}).superRefine((value, ctx) => {
  const indexes = new Set(value.questions.map((q) => q.questionIndex));
  if (indexes.size !== 10) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '문항 번호가 중복되거나 누락되었습니다.' });
  }
  const segmentCount = value.questions.filter((q) => q.questionType === 'segment').length;
  const angleCount = value.questions.filter((q) => q.questionType === 'angle').length;
  if (segmentCount !== 5 || angleCount !== 5) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '선분 5문항과 각 5문항이어야 합니다.' });
  }
  const sumTime = value.questions.reduce((sum, q) => sum + q.timeMs, 0);
  if (Math.abs(sumTime - value.totalTimeMs) > 120000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '문항별 시간 합계와 전체 시간이 지나치게 다릅니다.' });
  }
  const submittedAtMs = Date.parse(value.submittedAt);
  if (!Number.isFinite(submittedAtMs) || submittedAtMs > Date.now() + 5 * 60 * 1000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '제출 시각이 올바르지 않습니다.' });
  }
});

const settingsSchema = z.object({
  assessmentOpen: z.boolean().optional(),
  leaderboardVisible: z.boolean().optional(),
  scoringMode: z.enum(['partial', 'binary']).optional(),
  lengthTolerancePercent: z.number().min(0.1).max(10).optional(),
  angleToleranceDegrees: z.number().min(0.1).max(10).optional()
}).refine((value) => Object.keys(value).length > 0, '변경할 설정이 없습니다.');

function cleanError(error) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message || '입력값을 확인해 주세요.';
  }
  return '요청을 처리하지 못했습니다.';
}

function getOrCreateClass(classCode) {
  const existing = db.prepare('SELECT id, class_code FROM classes WHERE class_code = ?').get(classCode);
  if (existing) return existing;
  const transaction = db.transaction(() => {
    const result = db.prepare('INSERT INTO classes (class_code) VALUES (?)').run(classCode);
    db.prepare('INSERT INTO class_settings (class_id) VALUES (?)').run(result.lastInsertRowid);
    return db.prepare('SELECT id, class_code FROM classes WHERE id = ?').get(result.lastInsertRowid);
  });
  return transaction();
}

function getSettingsForClass(classCode, create = true) {
  let classRow = db.prepare('SELECT id, class_code FROM classes WHERE class_code = ?').get(classCode);
  if (!classRow && create) classRow = getOrCreateClass(classCode);
  if (!classRow) {
    return {
      classCode,
      assessmentOpen: true,
      leaderboardVisible: true,
      scoringMode: 'partial',
      lengthTolerancePercent: 1.5,
      angleToleranceDegrees: 1.5
    };
  }
  const row = db.prepare(`
    SELECT assessment_open, leaderboard_visible, scoring_mode,
           length_tolerance_percent, angle_tolerance_degrees
    FROM class_settings WHERE class_id = ?
  `).get(classRow.id);
  return {
    classCode,
    assessmentOpen: Boolean(row.assessment_open),
    leaderboardVisible: Boolean(row.leaderboard_visible),
    scoringMode: row.scoring_mode,
    lengthTolerancePercent: row.length_tolerance_percent,
    angleToleranceDegrees: row.angle_tolerance_degrees
  };
}

function computeQuestionScore(question, settings) {
  if (question.studentValue === null || !Number.isFinite(question.studentValue)) {
    return { errorValue: null, score: 0, correct: false };
  }
  const errorValue = Math.abs(question.studentValue - question.targetValue);
  const tolerance = question.questionType === 'segment'
    ? question.targetValue * settings.lengthTolerancePercent / 100
    : settings.angleToleranceDegrees;

  let score = 0;
  if (errorValue <= tolerance) score = 10;
  else if (settings.scoringMode === 'partial' && errorValue <= tolerance * 2) score = 7;
  else if (settings.scoringMode === 'partial' && errorValue <= tolerance * 3) score = 4;

  return { errorValue, score, correct: score === 10 };
}

function requireAdmin(req, res, next) {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: '관리자 로그인이 필요합니다.' });
    return;
  }
  try {
    req.admin = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    next();
  } catch (_error) {
    res.status(401).json({ error: '관리자 인증이 만료되었거나 올바르지 않습니다.' });
  }
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function csvEscape(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'construction-classroom', serverTime: new Date().toISOString() });
});

app.get('/api/config', (req, res) => {
  try {
    const classCode = req.query.classCode ? classCodeSchema.parse(req.query.classCode) : '';
    const classSettings = classCode ? getSettingsForClass(classCode, false) : null;
    res.json({
      appName: '영도쌤과 함께하는 작도교실',
      serverMode: true,
      classSettings,
      limits: { studentName: 12, classCode: 20 }
    });
  } catch (error) {
    res.status(400).json({ error: cleanError(error) });
  }
});

app.get('/api/leaderboard', (req, res) => {
  try {
    const classCode = classCodeSchema.parse(req.query.classCode);
    const settings = getSettingsForClass(classCode, false);
    if (!settings.leaderboardVisible) {
      res.status(403).json({ error: '현재 이 학급의 리더보드가 공개되어 있지 않습니다.' });
      return;
    }
    const classRow = db.prepare('SELECT id FROM classes WHERE class_code = ?').get(classCode);
    if (!classRow) {
      res.json({ classCode, rows: [], settings });
      return;
    }
    const rows = db.prepare(`
      WITH ranked AS (
        SELECT ar.*,
               ROW_NUMBER() OVER (
                 PARTITION BY student_name
                 ORDER BY score DESC, correct_count DESC, total_time_ms ASC, submitted_at ASC
               ) AS best_rank
        FROM assessment_results ar
        WHERE class_id = ?
      )
      SELECT id, student_name, score, correct_count, total_time_ms, submitted_at
      FROM ranked
      WHERE best_rank = 1
      ORDER BY score DESC, correct_count DESC, total_time_ms ASC, submitted_at ASC
      LIMIT 100
    `).all(classRow.id).map((row, index) => ({
      rank: index + 1,
      id: row.id,
      studentName: row.student_name,
      score: row.score,
      correctCount: row.correct_count,
      totalTimeMs: row.total_time_ms,
      totalTimeText: formatDuration(row.total_time_ms),
      submittedAt: row.submitted_at
    }));
    res.json({ classCode, rows, settings });
  } catch (error) {
    res.status(400).json({ error: cleanError(error) });
  }
});

app.get('/api/results/me', (req, res) => {
  try {
    const classCode = classCodeSchema.parse(req.query.classCode);
    const studentName = studentNameSchema.parse(req.query.studentName);
    const classRow = db.prepare('SELECT id FROM classes WHERE class_code = ?').get(classCode);
    if (!classRow) {
      res.json({ recent: null, best: null, attempts: 0 });
      return;
    }
    const attempts = db.prepare('SELECT COUNT(*) AS count FROM assessment_results WHERE class_id = ? AND student_name = ?')
      .get(classRow.id, studentName).count;
    const recent = db.prepare(`
      SELECT id, score, correct_count, total_time_ms, segment_score, angle_score, submitted_at
      FROM assessment_results WHERE class_id = ? AND student_name = ?
      ORDER BY submitted_at DESC LIMIT 1
    `).get(classRow.id, studentName) || null;
    const best = db.prepare(`
      SELECT id, score, correct_count, total_time_ms, segment_score, angle_score, submitted_at
      FROM assessment_results WHERE class_id = ? AND student_name = ?
      ORDER BY score DESC, correct_count DESC, total_time_ms ASC, submitted_at ASC LIMIT 1
    `).get(classRow.id, studentName) || null;
    const normalize = (row) => row ? {
      id: row.id,
      score: row.score,
      correctCount: row.correct_count,
      totalTimeMs: row.total_time_ms,
      segmentScore: row.segment_score,
      angleScore: row.angle_score,
      submittedAt: row.submitted_at
    } : null;
    res.json({ recent: normalize(recent), best: normalize(best), attempts });
  } catch (error) {
    res.status(400).json({ error: cleanError(error) });
  }
});

app.post('/api/results', submitLimiter, (req, res) => {
  try {
    const payload = resultSchema.parse(req.body);
    const classRow = getOrCreateClass(payload.classCode);
    const settings = getSettingsForClass(payload.classCode, true);
    if (!settings.assessmentOpen) {
      res.status(403).json({ error: '현재 이 학급의 형성평가가 닫혀 있습니다.' });
      return;
    }
    const already = db.prepare('SELECT id FROM assessment_results WHERE client_submission_id = ?').get(payload.clientSubmissionId);
    if (already) {
      res.status(409).json({ error: '이미 처리된 제출입니다.', resultId: already.id });
      return;
    }

    const computed = payload.questions
      .slice()
      .sort((a, b) => a.questionIndex - b.questionIndex)
      .map((question) => ({ ...question, ...computeQuestionScore(question, settings) }));
    const score = computed.reduce((sum, q) => sum + q.score, 0);
    const correctCount = computed.filter((q) => q.correct).length;
    const segmentScore = computed.filter((q) => q.questionType === 'segment').reduce((sum, q) => sum + q.score, 0);
    const angleScore = computed.filter((q) => q.questionType === 'angle').reduce((sum, q) => sum + q.score, 0);

    const saveResult = db.transaction(() => {
      const inserted = db.prepare(`
        INSERT INTO assessment_results (
          client_submission_id, class_id, student_name, score, correct_count,
          total_time_ms, segment_score, angle_score, submitted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payload.clientSubmissionId,
        classRow.id,
        payload.studentName,
        score,
        correctCount,
        payload.totalTimeMs,
        segmentScore,
        angleScore,
        payload.submittedAt
      );
      const insertQuestion = db.prepare(`
        INSERT INTO question_results (
          assessment_result_id, question_index, question_type, target_value,
          student_value, error_value, score, attempts, time_ms, submitted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      computed.forEach((q) => insertQuestion.run(
        inserted.lastInsertRowid,
        q.questionIndex,
        q.questionType,
        q.targetValue,
        q.studentValue,
        q.errorValue,
        q.score,
        q.attempts,
        q.timeMs,
        q.submittedAt
      ));
      return inserted.lastInsertRowid;
    });

    const resultId = saveResult();
    res.status(201).json({
      ok: true,
      resultId,
      score,
      correctCount,
      segmentScore,
      angleScore,
      questions: computed.map((q) => ({
        questionIndex: q.questionIndex,
        errorValue: q.errorValue,
        score: q.score
      }))
    });
  } catch (error) {
    if (String(error.message).includes('UNIQUE constraint failed')) {
      res.status(409).json({ error: '이미 처리된 제출입니다.' });
      return;
    }
    res.status(400).json({ error: cleanError(error) });
  }
});

app.post('/api/admin/login', adminLimiter, async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!username || username.length > 40 || !password || password.length > 200) {
    res.status(400).json({ error: '관리자 아이디와 비밀번호를 모두 입력해 주세요.' });
    return;
  }
  const usernameMatched = username === ADMIN_USERNAME;
  const passwordMatched = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  if (!usernameMatched || !passwordMatched) {
    res.status(401).json({ error: '관리자 아이디 또는 비밀번호가 올바르지 않습니다.' });
    return;
  }
  const token = jwt.sign({ role: 'teacher', username: ADMIN_USERNAME }, JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN, algorithm: 'HS256' });
  res.json({ token, username: ADMIN_USERNAME, expiresIn: TOKEN_EXPIRES_IN });
});

app.get('/api/admin/results', requireAdmin, (req, res) => {
  try {
    const classCode = classCodeSchema.parse(req.query.classCode);
    const search = String(req.query.search || '').trim().slice(0, 12);
    const sort = ['score', 'time', 'submitted'].includes(req.query.sort) ? req.query.sort : 'submitted';
    const classRow = db.prepare('SELECT id FROM classes WHERE class_code = ?').get(classCode);
    if (!classRow) {
      res.json({ classCode, rows: [], settings: getSettingsForClass(classCode, false) });
      return;
    }
    const orderSql = sort === 'score'
      ? 'ar.score DESC, ar.correct_count DESC, ar.total_time_ms ASC'
      : sort === 'time'
        ? 'ar.total_time_ms ASC, ar.score DESC'
        : 'ar.submitted_at DESC';
    const rows = db.prepare(`
      SELECT ar.id, ar.student_name, ar.score, ar.correct_count, ar.total_time_ms,
             ar.segment_score, ar.angle_score, ar.submitted_at,
             GROUP_CONCAT(qr.question_type || ':' || printf('%.3f', COALESCE(qr.error_value, -1)), ' | ') AS error_summary
      FROM assessment_results ar
      LEFT JOIN question_results qr ON qr.assessment_result_id = ar.id
      WHERE ar.class_id = ? AND ar.student_name LIKE ?
      GROUP BY ar.id
      ORDER BY ${orderSql}
      LIMIT 1000
    `).all(classRow.id, `%${search}%`).map((row) => ({
      id: row.id,
      studentName: row.student_name,
      score: row.score,
      correctCount: row.correct_count,
      totalTimeMs: row.total_time_ms,
      segmentScore: row.segment_score,
      angleScore: row.angle_score,
      submittedAt: row.submitted_at,
      errorSummary: row.error_summary || ''
    }));
    res.json({ classCode, rows, settings: getSettingsForClass(classCode, false) });
  } catch (error) {
    res.status(400).json({ error: cleanError(error) });
  }
});

app.delete('/api/admin/results/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: '기록 ID가 올바르지 않습니다.' });
    return;
  }
  const result = db.prepare('DELETE FROM assessment_results WHERE id = ?').run(id);
  if (!result.changes) {
    res.status(404).json({ error: '삭제할 기록을 찾지 못했습니다.' });
    return;
  }
  res.json({ ok: true });
});

app.delete('/api/admin/classes/:classCode/results', requireAdmin, (req, res) => {
  try {
    const classCode = classCodeSchema.parse(req.params.classCode);
    const confirmation = String(req.get('X-Confirm-Class') || '');
    if (confirmation !== classCode) {
      res.status(400).json({ error: '학급 코드 확인값이 일치하지 않습니다.' });
      return;
    }
    const classRow = db.prepare('SELECT id FROM classes WHERE class_code = ?').get(classCode);
    if (!classRow) {
      res.json({ ok: true, deleted: 0 });
      return;
    }
    const result = db.prepare('DELETE FROM assessment_results WHERE class_id = ?').run(classRow.id);
    res.json({ ok: true, deleted: result.changes });
  } catch (error) {
    res.status(400).json({ error: cleanError(error) });
  }
});

function getExportRows(classCode) {
  const classRow = db.prepare('SELECT id FROM classes WHERE class_code = ?').get(classCode);
  return classRow ? db.prepare(`
    SELECT ar.id, ar.student_name, ar.score, ar.correct_count, ar.total_time_ms,
           ar.submitted_at, ar.segment_score, ar.angle_score,
           GROUP_CONCAT(
             (qr.question_index + 1) || '번 ' ||
             CASE qr.question_type WHEN 'segment' THEN '선분' ELSE '각' END ||
             ' 목표=' || printf('%.3f', qr.target_value) ||
             ' 결과=' || printf('%.3f', COALESCE(qr.student_value, -1)) ||
             ' 오차=' || printf('%.3f', COALESCE(qr.error_value, -1)) ||
             ' 점수=' || qr.score, '; '
           ) AS error_summary
    FROM assessment_results ar
    LEFT JOIN question_results qr ON qr.assessment_result_id = ar.id
    WHERE ar.class_id = ?
    GROUP BY ar.id
    ORDER BY ar.submitted_at DESC
  `).all(classRow.id) : [];
}

app.get('/api/admin/export.csv', requireAdmin, (req, res) => {
  try {
    const classCode = classCodeSchema.parse(req.query.classCode);
    const rows = getExportRows(classCode);

    const header = ['학급 코드', '학생 별명', '점수', '정답 수', '총 시간', '제출 시각', '선분 점수', '각 점수', '문항별 오차 요약'];
    const lines = [header.map(csvEscape).join(',')];
    rows.forEach((row) => {
      lines.push([
        classCode,
        row.student_name,
        row.score,
        row.correct_count,
        formatDuration(row.total_time_ms),
        row.submitted_at,
        row.segment_score,
        row.angle_score,
        row.error_summary || ''
      ].map(csvEscape).join(','));
    });
    const filename = `construction-results-${classCode}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(`\uFEFF${lines.join('\r\n')}`);
  } catch (error) {
    res.status(400).json({ error: cleanError(error) });
  }
});

app.get('/api/admin/export.xlsx', requireAdmin, async (req, res) => {
  try {
    const classCode = classCodeSchema.parse(req.query.classCode);
    const rows = getExportRows(classCode);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = '영도쌤과 함께하는 작도교실';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('형성평가 기록', {
      views: [{ state: 'frozen', ySplit: 1 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
    });
    sheet.columns = [
      { header: '학급 코드', key: 'classCode', width: 16 },
      { header: '학생 별명', key: 'studentName', width: 16 },
      { header: '점수', key: 'score', width: 10 },
      { header: '정답 수', key: 'correctCount', width: 10 },
      { header: '총 시간', key: 'totalTime', width: 12 },
      { header: '제출 시각', key: 'submittedAt', width: 23 },
      { header: '선분 점수', key: 'segmentScore', width: 12 },
      { header: '각 점수', key: 'angleScore', width: 12 },
      { header: '문항별 목표·결과·오차·점수', key: 'errorSummary', width: 88 }
    ];
    rows.forEach((row) => sheet.addRow({
      classCode,
      studentName: row.student_name,
      score: row.score,
      correctCount: row.correct_count,
      totalTime: formatDuration(row.total_time_ms),
      submittedAt: new Date(row.submitted_at),
      segmentScore: row.segment_score,
      angleScore: row.angle_score,
      errorSummary: row.error_summary || ''
    }));
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF12264F' } };
    header.alignment = { vertical: 'middle', horizontal: 'center' };
    header.height = 26;
    sheet.autoFilter = { from: 'A1', to: 'I1' };
    sheet.getColumn('score').numFmt = '0"점"';
    sheet.getColumn('correctCount').numFmt = '0"개"';
    sheet.getColumn('submittedAt').numFmt = 'yyyy-mm-dd hh:mm:ss';
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.alignment = { vertical: 'top', wrapText: true };
        if (rowNumber % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F6FA' } };
      }
      row.eachCell((cell) => { cell.border = { bottom: { style: 'thin', color: { argb: 'FFD8E0EC' } } }; });
    });
    const filename = `construction-results-${classCode}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    if (!res.headersSent) res.status(400).json({ error: cleanError(error) });
    else res.end();
  }
});

app.put('/api/admin/classes/:classCode/settings', requireAdmin, (req, res) => {
  try {
    const classCode = classCodeSchema.parse(req.params.classCode);
    const changes = settingsSchema.parse(req.body);
    const classRow = getOrCreateClass(classCode);
    const current = getSettingsForClass(classCode, true);
    const next = {
      assessmentOpen: changes.assessmentOpen ?? current.assessmentOpen,
      leaderboardVisible: changes.leaderboardVisible ?? current.leaderboardVisible,
      scoringMode: changes.scoringMode ?? current.scoringMode,
      lengthTolerancePercent: changes.lengthTolerancePercent ?? current.lengthTolerancePercent,
      angleToleranceDegrees: changes.angleToleranceDegrees ?? current.angleToleranceDegrees
    };
    db.prepare(`
      UPDATE class_settings
      SET assessment_open = ?, leaderboard_visible = ?, scoring_mode = ?,
          length_tolerance_percent = ?, angle_tolerance_degrees = ?, updated_at = datetime('now')
      WHERE class_id = ?
    `).run(
      next.assessmentOpen ? 1 : 0,
      next.leaderboardVisible ? 1 : 0,
      next.scoringMode,
      next.lengthTolerancePercent,
      next.angleToleranceDegrees,
      classRow.id
    );
    db.prepare("UPDATE classes SET updated_at = datetime('now') WHERE id = ?").run(classRow.id);
    res.json({ ok: true, settings: getSettingsForClass(classCode, false) });
  } catch (error) {
    res.status(400).json({ error: cleanError(error) });
  }
});

app.use(express.static(path.join(__dirname), {
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
  }
}));

app.use('/api', (_req, res) => {
  res.status(404).json({ error: '요청한 API를 찾을 수 없습니다.' });
});

app.use((error, _req, res, _next) => {
  if (error && error.message === '허용되지 않은 출처입니다.') {
    res.status(403).json({ error: '이 주소에서는 서버에 접속할 수 없습니다.' });
    return;
  }
  console.error(error);
  res.status(500).json({ error: '서버에서 요청을 처리하지 못했습니다.' });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`영도쌤 작도교실 서버: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`데이터베이스: ${DB_PATH}`);
});

function shutdown(signal) {
  console.log(`\n${signal} 수신: 서버를 안전하게 종료합니다.`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
