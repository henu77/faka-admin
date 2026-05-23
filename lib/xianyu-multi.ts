import WebSocket from 'ws';
import crypto from 'crypto';
import { generateKeys } from './keys';
import { getDb } from './db';

// --- Cookie 解析 ---

function transCookies(cookiesStr: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const cookie of cookiesStr.split('; ')) {
    const eq = cookie.indexOf('=');
    if (eq > 0) {
      cookies[cookie.substring(0, eq)] = cookie.substring(eq + 1);
    }
  }
  return cookies;
}

// --- ID 生成 ---

function generateMid(): string {
  const randomPart = Math.floor(1000 * Math.random());
  const timestamp = Date.now();
  return `${randomPart}${timestamp} 0`;
}

function generateUuid(): string {
  const timestamp = Date.now();
  return `-${timestamp}1`;
}

function generateDeviceId(userId: string): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const result: string[] = [];
  for (let i = 0; i < 36; i++) {
    if ([8, 13, 18, 23].includes(i)) {
      result.push('-');
    } else if (i === 14) {
      result.push('4');
    } else if (i === 19) {
      const randVal = Math.floor(16 * Math.random());
      result.push(chars[(randVal & 0x3) | 0x8]);
    } else {
      const randVal = Math.floor(16 * Math.random());
      result.push(chars[randVal]);
    }
  }
  return result.join('') + '-' + userId;
}

// --- MTOP 签名 ---

function generateSign(t: string, token: string, data: string): string {
  const appKey = '34839810';
  const msg = `${token}&${t}&${appKey}&${data}`;
  return crypto.createHash('md5').update(msg, 'utf-8').digest('hex');
}

// --- MessagePack 解码器 ---

class MessagePackDecoder {
  private data: Buffer;
  private pos = 0;

  constructor(data: Buffer) {
    this.data = data;
  }

  private readByte(): number {
    if (this.pos >= this.data.length) throw new Error('Unexpected end of data');
    return this.data[this.pos++];
  }

  private readBytes(count: number): Buffer {
    if (this.pos + count > this.data.length) throw new Error('Unexpected end of data');
    const result = this.data.subarray(this.pos, this.pos + count);
    this.pos += count;
    return result;
  }

  private readUInt8(): number { return this.readByte(); }
  private readUInt16(): number { return this.readBytes(2).readUInt16BE(0); }
  private readUInt32(): number { return this.readBytes(4).readUInt32BE(0); }
  private readUInt64(): number { return Number(this.readBytes(8).readBigUInt64BE(0)); }
  private readInt8(): number { return this.readBytes(1).readInt8(0); }
  private readInt16(): number { return this.readBytes(2).readInt16BE(0); }
  private readInt32(): number { return this.readBytes(4).readInt32BE(0); }
  private readInt64(): number { return Number(this.readBytes(8).readBigInt64BE(0)); }
  private readFloat32(): number { return this.readBytes(4).readFloatBE(0); }
  private readFloat64(): number { return this.readBytes(8).readDoubleBE(0); }

  private readString(length: number): string {
    return this.readBytes(length).toString('utf-8');
  }

  private decodeArray(size: number): unknown[] {
    const result: unknown[] = [];
    for (let i = 0; i < size; i++) result.push(this.decodeValue());
    return result;
  }

  private decodeMap(size: number): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (let i = 0; i < size; i++) {
      const key = this.decodeValue();
      const value = this.decodeValue();
      result[String(key)] = value;
    }
    return result;
  }

  decodeValue(): unknown {
    if (this.pos >= this.data.length) throw new Error('Unexpected end of data');
    const formatByte = this.readByte();

    if (formatByte <= 0x7f) return formatByte;
    if (formatByte >= 0x80 && formatByte <= 0x8f) return this.decodeMap(formatByte & 0x0f);
    if (formatByte >= 0x90 && formatByte <= 0x9f) return this.decodeArray(formatByte & 0x0f);
    if (formatByte >= 0xa0 && formatByte <= 0xbf) return this.readString(formatByte & 0x1f);
    if (formatByte === 0xc0) return null;
    if (formatByte === 0xc2) return false;
    if (formatByte === 0xc3) return true;
    if (formatByte === 0xc4) return this.readBytes(this.readUInt8());
    if (formatByte === 0xc5) return this.readBytes(this.readUInt16());
    if (formatByte === 0xc6) return this.readBytes(this.readUInt32());
    if (formatByte === 0xca) return this.readFloat32();
    if (formatByte === 0xcb) return this.readFloat64();
    if (formatByte === 0xcc) return this.readUInt8();
    if (formatByte === 0xcd) return this.readUInt16();
    if (formatByte === 0xce) return this.readUInt32();
    if (formatByte === 0xcf) return this.readUInt64();
    if (formatByte === 0xd0) return this.readInt8();
    if (formatByte === 0xd1) return this.readInt16();
    if (formatByte === 0xd2) return this.readInt32();
    if (formatByte === 0xd3) return this.readInt64();
    if (formatByte === 0xd9) return this.readString(this.readUInt8());
    if (formatByte === 0xda) return this.readString(this.readUInt16());
    if (formatByte === 0xdb) return this.readString(this.readUInt32());
    if (formatByte === 0xdc) return this.decodeArray(this.readUInt16());
    if (formatByte === 0xdd) return this.decodeArray(this.readUInt32());
    if (formatByte === 0xde) return this.decodeMap(this.readUInt16());
    if (formatByte === 0xdf) return this.decodeMap(this.readUInt32());
    if (formatByte >= 0xe0) return formatByte - 256;

    throw new Error(`Unknown format byte: 0x${formatByte.toString(16).padStart(2, '0')}`);
  }

  decode(): unknown {
    try {
      return this.decodeValue();
    } catch {
      return this.data.toString('base64');
    }
  }
}

function decrypt(data: string): unknown {
  try {
    const cleaned = data.replace(/[^A-Za-z0-9+/=]/g, '');
    let padded = cleaned;
    while (padded.length % 4 !== 0) padded += '=';
    const decoded = Buffer.from(padded, 'base64');

    try {
      const text = decoded.toString('utf-8');
      return JSON.parse(text);
    } catch { }

    const decoder = new MessagePackDecoder(decoded);
    return decoder.decode();
  } catch (e) {
    return { error: `Decrypt failed: ${e}` };
  }
}

// --- Token 获取 ---

async function getToken(cookies: Record<string, string>, deviceId: string): Promise<string | null> {
  const t = String(Date.now());
  const dataVal = JSON.stringify({ appKey: '444e9908a51d1cb236a27862abc769c9', deviceId });
  const token = (cookies['_m_h5_tk'] || '').split('_')[0];
  const sign = generateSign(t, token, dataVal);

  const params = new URLSearchParams({
    jsv: '2.7.2', appKey: '34839810', t, sign, v: '1.0',
    type: 'originaljson', accountSite: 'xianyu', dataType: 'json',
    timeout: '20000', api: 'mtop.taobao.idlemessage.pc.login.token',
    sessionOption: 'AutoLoginOnly',
  });

  const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');

  const res = await fetch(
    `https://h5api.m.goofish.com/h5/mtop.taobao.idlemessage.pc.login.token/1.0/?${params}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'cookie': cookieHeader,
        'origin': 'https://www.goofish.com',
        'referer': 'https://www.goofish.com/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      },
      body: `data=${encodeURIComponent(dataVal)}`,
    },
  );

  const json = await res.json() as any;
  if (json?.data?.accessToken) return json.data.accessToken;
  return null;
}

// --- 发送消息 ---

function buildSendMessage(chatId: string, toId: string, myId: string, text: string): string {
  const textObj = { contentType: 1, text: { text } };
  const textBase64 = Buffer.from(JSON.stringify(textObj), 'utf-8').toString('base64');
  const msg = {
    lwp: '/r/MessageSend/sendByReceiverScope',
    headers: { mid: generateMid() },
    body: [
      {
        uuid: generateUuid(),
        cid: `${chatId}@goofish`,
        conversationType: 1,
        content: { contentType: 101, custom: { type: 1, data: textBase64 } },
        redPointPolicy: 0,
        extension: { extJson: '{}' },
        ctx: { appVersion: '1.0', platform: 'web' },
        mtags: {},
        msgReadStatusSetting: 1,
      },
      {
        actualReceivers: [`${toId}@goofish`, `${myId}@goofish`],
      },
    ],
  };
  return JSON.stringify(msg);
}

// --- 消息判断 ---

function isChatMessage(msg: any): boolean {
  return (
    typeof msg === 'object' && msg !== null &&
    typeof msg['1'] === 'object' && msg['1'] !== null &&
    typeof msg['1']['10'] === 'object' && msg['1']['10'] !== null &&
    'reminderContent' in msg['1']['10']
  );
}

function isSyncPackage(msg: any): boolean {
  return (
    typeof msg === 'object' && msg !== null &&
    typeof msg.body === 'object' && msg.body !== null &&
    typeof msg.body.syncPushPackage === 'object' && msg.body.syncPushPackage !== null &&
    Array.isArray(msg.body.syncPushPackage.data) &&
    msg.body.syncPushPackage.data.length > 0
  );
}

// --- 账号连接管理 ---

interface AccountConnection {
  accountId: string;
  cookies: Record<string, string>;
  cookiesStr: string;
  myId: string;
  deviceId: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  errorMsg?: string;
  ws: WebSocket | null;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  tokenRefreshTimer: ReturnType<typeof setInterval> | null;
  currentToken: string | null;
  lastTokenRefresh: number;
}

const connections = new Map<string, AccountConnection>();

// --- 数据库操作 ---

export function addAccount(accountId: string, cookies: string): { ok: boolean; error?: string } {
  if (!accountId || !cookies) {
    return { ok: false, error: '账号ID和Cookie不能为空' };
  }

  try {
    const db = getDb();
    const stmt = db.prepare(
      'INSERT OR REPLACE INTO xianyu_accounts (account_id, cookies, status, updated_at) VALUES (?, ?, ?, datetime("now","localtime"))'
    );
    stmt.run(accountId, cookies, 'disconnected');
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export function removeAccount(accountId: string): { ok: boolean; error?: string } {
  try {
    stopAccount(accountId);
    const db = getDb();
    db.prepare('DELETE FROM xianyu_accounts WHERE account_id = ?').run(accountId);
    db.prepare('DELETE FROM xianyu_logs WHERE account_id = ?').run(accountId);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export function getAccounts(): any[] {
  try {
    const db = getDb();
    const accounts = db.prepare('SELECT * FROM xianyu_accounts ORDER BY created_at DESC').all();
    return accounts.map((acc: any) => ({
      ...acc,
      cookies: undefined,
    }));
  } catch {
    return [];
  }
}

export function getAccountLogs(accountId: string, limit = 100): any[] {
  try {
    const db = getDb();
    return db.prepare(
      'SELECT * FROM xianyu_logs WHERE account_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(accountId, limit);
  } catch {
    return [];
  }
}

function updateAccountStatus(accountId: string, status: string, errorMsg?: string) {
  try {
    const db = getDb();
    db.prepare(
      'UPDATE xianyu_accounts SET status = ?, error_msg = ?, updated_at = datetime("now","localtime") WHERE account_id = ?'
    ).run(status, errorMsg || null, accountId);
  } catch { }
}

function addLog(accountId: string, chatId: string, buyerId: string, key: string, message: string) {
  try {
    const db = getDb();
    db.prepare(
      'INSERT INTO xianyu_logs (account_id, chat_id, buyer_id, key, message) VALUES (?, ?, ?, ?, ?)'
    ).run(accountId, chatId, buyerId, key, message);
  } catch { }
}

// --- 连接管理 ---

export async function startAccount(accountId: string): Promise<{ ok: boolean; error?: string }> {
  if (connections.has(accountId)) {
    const conn = connections.get(accountId)!;
    if (conn.status === 'connected' || conn.status === 'connecting') {
      return { ok: false, error: '账号已在连接中' };
    }
  }

  try {
    const db = getDb();
    const account = db.prepare('SELECT * FROM xianyu_accounts WHERE account_id = ?').get(accountId) as any;
    if (!account) {
      return { ok: false, error: '账号不存在' };
    }

    const cookiesStr = account.cookies;
    const cookies = transCookies(cookiesStr);
    const myId = cookies['unb'] || '';
    if (!myId) {
      return { ok: false, error: 'Cookie 中缺少 unb 字段，请确认已登录闲鱼' };
    }

    const deviceId = generateDeviceId(myId);
    const token = await getToken(cookies, deviceId);
    if (!token) {
      updateAccountStatus(accountId, 'error', '获取 Token 失败，Cookie 可能已过期');
      return { ok: false, error: '获取 Token 失败' };
    }

    const conn: AccountConnection = {
      accountId,
      cookies,
      cookiesStr,
      myId,
      deviceId,
      status: 'connecting',
      ws: null,
      heartbeatTimer: null,
      tokenRefreshTimer: null,
      currentToken: token,
      lastTokenRefresh: Date.now(),
    };

    connections.set(accountId, conn);
    updateAccountStatus(accountId, 'connecting');

    connectWs(conn);
    return { ok: true };
  } catch (e: any) {
    updateAccountStatus(accountId, 'error', e.message);
    return { ok: false, error: e.message };
  }
}

export function stopAccount(accountId: string): { ok: boolean } {
  const conn = connections.get(accountId);
  if (conn) {
    if (conn.ws) {
      try { conn.ws.close(); } catch { }
      conn.ws = null;
    }
    clearTimers(conn);
    connections.delete(accountId);
  }
  updateAccountStatus(accountId, 'disconnected');
  return { ok: true };
}

function connectWs(conn: AccountConnection) {
  if (conn.ws) {
    try { conn.ws.close(); } catch { }
  }

  conn.status = 'connecting';
  updateAccountStatus(conn.accountId, 'connecting');

  conn.ws = new WebSocket('wss://wss-goofish.dingtalk.com/', {
    headers: {
      'Cookie': conn.cookiesStr,
      'Host': 'wss-goofish.dingtalk.com',
      'Origin': 'https://www.goofish.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    },
  });

  conn.ws.on('open', () => {
    sendRegister(conn);
    conn.status = 'connected';
    updateAccountStatus(conn.accountId, 'connected');
    startHeartbeat(conn);
    startTokenRefresh(conn);
  });

  conn.ws.on('message', (raw: WebSocket.Data) => {
    try {
      const msg = JSON.parse(raw.toString());
      handleWsMessage(conn, msg);
    } catch { }
  });

  conn.ws.on('close', () => {
    conn.status = 'disconnected';
    updateAccountStatus(conn.accountId, 'disconnected');
    clearTimers(conn);
    setTimeout(() => {
      if (connections.has(conn.accountId) && conn.status === 'disconnected') {
        connectWs(conn);
      }
    }, 5000);
  });

  conn.ws.on('error', () => {
    conn.status = 'error';
    updateAccountStatus(conn.accountId, 'error');
  });
}

function sendRegister(conn: AccountConnection) {
  if (!conn.ws || conn.ws.readyState !== WebSocket.OPEN) return;

  const regMsg = {
    lwp: '/reg',
    headers: {
      'cache-header': 'app-key token ua wv',
      'app-key': '444e9908a51d1cb236a27862abc769c9',
      'token': conn.currentToken,
      'ua': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 DingTalk(2.1.5) OS(Windows/10) Browser(Chrome/133.0.0.0) DingWeb/2.1.5 IMPaaS DingWeb/2.1.5',
      'dt': 'j',
      'wv': 'im:3,au:3,sy:6',
      'sync': '0,0;0;0;',
      'did': conn.deviceId,
      'mid': generateMid(),
    },
  };
  conn.ws.send(JSON.stringify(regMsg));

  setTimeout(() => {
    if (!conn.ws || conn.ws.readyState !== WebSocket.OPEN) return;
    const ackMsg = {
      lwp: '/r/SyncStatus/ackDiff',
      headers: { mid: '5701741704675979 0' },
      body: [{
        pipeline: 'sync', tooLong2Tag: 'PNM,1', channel: 'sync', topic: 'sync',
        highPts: 0, pts: Date.now() * 1000, seq: 0, timestamp: Date.now(),
      }],
    };
    conn.ws.send(JSON.stringify(ackMsg));
  }, 1000);
}

function startHeartbeat(conn: AccountConnection) {
  clearTimers(conn);
  conn.heartbeatTimer = setInterval(() => {
    if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify({ lwp: '/!', headers: { mid: generateMid() } }));
    }
  }, 15_000);
}

function startTokenRefresh(conn: AccountConnection) {
  conn.tokenRefreshTimer = setInterval(async () => {
    if (Date.now() - conn.lastTokenRefresh >= 3_600_000) {
      try {
        const newToken = await getToken(conn.cookies, conn.deviceId);
        if (newToken) {
          conn.currentToken = newToken;
          conn.lastTokenRefresh = Date.now();
          if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
            sendRegister(conn);
          }
        }
      } catch { }
    }
  }, 60_000);
}

function clearTimers(conn: AccountConnection) {
  if (conn.heartbeatTimer) { clearInterval(conn.heartbeatTimer); conn.heartbeatTimer = null; }
  if (conn.tokenRefreshTimer) { clearInterval(conn.tokenRefreshTimer); conn.tokenRefreshTimer = null; }
}

function handleWsMessage(conn: AccountConnection, msg: any) {
  if (msg?.code === 200 && msg?.headers?.mid) return;

  if (msg?.headers?.mid) {
    const ack: any = {
      code: 200,
      headers: {
        mid: msg.headers.mid,
        sid: msg.headers.sid || '',
      },
    };
    for (const key of ['app-key', 'ua', 'dt']) {
      if (msg.headers[key]) ack.headers[key] = msg.headers[key];
    }
    if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(ack));
    }
  }

  if (!isSyncPackage(msg)) return;

  const syncData = msg.body.syncPushPackage.data[0];
  if (!syncData?.data) return;

  let message: any;
  try {
    const raw = syncData.data;
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf-8');
      message = JSON.parse(decoded);
      return;
    } catch { }
    const decrypted = decrypt(raw);
    if (typeof decrypted === 'string') {
      message = JSON.parse(decrypted);
    } else {
      message = decrypted;
    }
  } catch { return; }

  if (!isChatMessage(message)) return;

  const sendUserId = message['1']['10']['senderUserId'];
  const sendMessage = message['1']['10']['reminderContent'];
  const chatId = String(message['1']['2']).split('@')[0];
  const createTime = Number(message['1']['5']);

  if (Date.now() - createTime > 300_000) return;
  if (sendUserId !== conn.myId) return;
  if (!sendMessage.includes('给你卡密')) return;

  const keys = generateKeys(1, 1, false);
  const key = keys[0];
  const buyerId = chatId;

  const replyText = `您的卡密：${key}\n请在 PPT 导出服务中使用此卡密`;
  if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
    conn.ws.send(buildSendMessage(chatId, buyerId, conn.myId, replyText));
  }

  addLog(conn.accountId, chatId, buyerId, key, replyText);
}
