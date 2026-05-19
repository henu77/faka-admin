import WebSocket from 'ws';
import crypto from 'crypto';
import { generateKeys } from './keys';
import { getSetting, setSetting } from './settings';

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

    if (formatByte <= 0x7f) return formatByte; // positive fixint
    if (formatByte >= 0x80 && formatByte <= 0x8f) return this.decodeMap(formatByte & 0x0f); // fixmap
    if (formatByte >= 0x90 && formatByte <= 0x9f) return this.decodeArray(formatByte & 0x0f); // fixarray
    if (formatByte >= 0xa0 && formatByte <= 0xbf) return this.readString(formatByte & 0x1f); // fixstr
    if (formatByte === 0xc0) return null; // nil
    if (formatByte === 0xc2) return false; // false
    if (formatByte === 0xc3) return true; // true
    if (formatByte === 0xc4) return this.readBytes(this.readUInt8()); // bin 8
    if (formatByte === 0xc5) return this.readBytes(this.readUInt16()); // bin 16
    if (formatByte === 0xc6) return this.readBytes(this.readUInt32()); // bin 32
    if (formatByte === 0xca) return this.readFloat32(); // float 32
    if (formatByte === 0xcb) return this.readFloat64(); // float 64
    if (formatByte === 0xcc) return this.readUInt8(); // uint 8
    if (formatByte === 0xcd) return this.readUInt16(); // uint 16
    if (formatByte === 0xce) return this.readUInt32(); // uint 32
    if (formatByte === 0xcf) return this.readUInt64(); // uint 64
    if (formatByte === 0xd0) return this.readInt8(); // int 8
    if (formatByte === 0xd1) return this.readInt16(); // int 16
    if (formatByte === 0xd2) return this.readInt32(); // int 32
    if (formatByte === 0xd3) return this.readInt64(); // int 64
    if (formatByte === 0xd9) return this.readString(this.readUInt8()); // str 8
    if (formatByte === 0xda) return this.readString(this.readUInt16()); // str 16
    if (formatByte === 0xdb) return this.readString(this.readUInt32()); // str 32
    if (formatByte === 0xdc) return this.decodeArray(this.readUInt16()); // array 16
    if (formatByte === 0xdd) return this.decodeArray(this.readUInt32()); // array 32
    if (formatByte === 0xde) return this.decodeMap(this.readUInt16()); // map 16
    if (formatByte === 0xdf) return this.decodeMap(this.readUInt32()); // map 32
    if (formatByte >= 0xe0) return formatByte - 256; // negative fixint

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

    // Try direct UTF-8 / JSON first
    try {
      const text = decoded.toString('utf-8');
      return JSON.parse(text);
    } catch {
      // Not plain JSON, try MessagePack
    }

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

// --- 发卡日志 ---

export interface XianyuLog {
  time: string;
  chatId: string;
  buyerId: string;
  key: string;
  message: string;
}

const logs: XianyuLog[] = [];
const MAX_LOGS = 200;

function addLog(log: XianyuLog) {
  logs.unshift(log);
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
}

export function getLogs(): XianyuLog[] {
  return [...logs];
}

// --- 连接状态 ---

export type XianyuStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

let status: XianyuStatus = 'disconnected';
let ws: WebSocket | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let tokenRefreshTimer: ReturnType<typeof setInterval> | null = null;
let currentToken: string | null = null;
let lastTokenRefresh = 0;
let cookies: Record<string, string> = {};
let myId = '';
let deviceId = '';
let cookiesStr = '';

export function getStatus(): XianyuStatus {
  return status;
}

export function getStatusDetail() {
  return { status, myId, connected: status === 'connected', logCount: logs.length };
}

// --- 核心：启动连接 ---

export async function startXianyu(cookieInput: string): Promise<{ ok: boolean; error?: string }> {
  if (status === 'connected' || status === 'connecting') {
    return { ok: false, error: '已在连接中' };
  }

  cookiesStr = cookieInput;
  cookies = transCookies(cookiesStr);
  myId = cookies['unb'] || '';
  if (!myId) return { ok: false, error: 'Cookie 中缺少 unb 字段，请确认已登录闲鱼' };

  deviceId = generateDeviceId(myId);
  status = 'connecting';

  try {
    currentToken = await getToken(cookies, deviceId);
    if (!currentToken) {
      status = 'error';
      return { ok: false, error: '获取 Token 失败，Cookie 可能已过期' };
    }
    lastTokenRefresh = Date.now();

    // 保存 cookie 到 settings
    setSetting('xianyu_cookies', cookiesStr);

    connectWs();
    return { ok: true };
  } catch (e: any) {
    status = 'error';
    return { ok: false, error: e.message || '启动失败' };
  }
}

function connectWs() {
  if (ws) {
    try { ws.close(); } catch { /* ignore */ }
  }

  status = 'connecting';
  ws = new WebSocket('wss://wss-goofish.dingtalk.com/', {
    headers: {
      'Cookie': cookiesStr,
      'Host': 'wss-goofish.dingtalk.com',
      'Origin': 'https://www.goofish.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    },
  });

  ws.on('open', () => {
    sendRegister();
    status = 'connected';
    startHeartbeat();
    startTokenRefresh();
  });

  ws.on('message', (raw: WebSocket.Data) => {
    try {
      const msg = JSON.parse(raw.toString());
      handleWsMessage(msg);
    } catch { /* ignore non-JSON */ }
  });

  ws.on('close', () => {
    status = 'disconnected';
    clearTimers();
    // Auto reconnect after 5s if not stopped
    setTimeout(() => {
      if (status === 'disconnected' && cookiesStr) {
        connectWs();
      }
    }, 5000);
  });

  ws.on('error', () => {
    status = 'error';
  });
}

function sendRegister() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const regMsg = {
    lwp: '/reg',
    headers: {
      'cache-header': 'app-key token ua wv',
      'app-key': '444e9908a51d1cb236a27862abc769c9',
      'token': currentToken,
      'ua': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 DingTalk(2.1.5) OS(Windows/10) Browser(Chrome/133.0.0.0) DingWeb/2.1.5 IMPaaS DingWeb/2.1.5',
      'dt': 'j',
      'wv': 'im:3,au:3,sy:6',
      'sync': '0,0;0;0;',
      'did': deviceId,
      'mid': generateMid(),
    },
  };
  ws.send(JSON.stringify(regMsg));

  // Send sync ack after short delay
  setTimeout(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const ackMsg = {
      lwp: '/r/SyncStatus/ackDiff',
      headers: { mid: '5701741704675979 0' },
      body: [{
        pipeline: 'sync', tooLong2Tag: 'PNM,1', channel: 'sync', topic: 'sync',
        highPts: 0, pts: Date.now() * 1000, seq: 0, timestamp: Date.now(),
      }],
    };
    ws.send(JSON.stringify(ackMsg));
  }, 1000);
}

function startHeartbeat() {
  clearTimers();
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ lwp: '/!', headers: { mid: generateMid() } }));
    }
  }, 15_000);
}

function startTokenRefresh() {
  tokenRefreshTimer = setInterval(async () => {
    if (Date.now() - lastTokenRefresh >= 3_600_000) {
      try {
        const newToken = await getToken(cookies, deviceId);
        if (newToken) {
          currentToken = newToken;
          lastTokenRefresh = Date.now();
          // Re-register with new token
          if (ws && ws.readyState === WebSocket.OPEN) {
            sendRegister();
          }
        }
      } catch { /* ignore */ }
    }
  }, 60_000);
}

function clearTimers() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (tokenRefreshTimer) { clearInterval(tokenRefreshTimer); tokenRefreshTimer = null; }
}

// --- 消息处理 ---

function handleWsMessage(msg: any) {
  // Heartbeat response
  if (msg?.code === 200 && msg?.headers?.mid) return;

  // Send ACK for messages with headers
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
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(ack));
    }
  }

  // Only process sync packages
  if (!isSyncPackage(msg)) return;

  const syncData = msg.body.syncPushPackage.data[0];
  if (!syncData?.data) return;

  // Decrypt
  let message: any;
  try {
    const raw = syncData.data;
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf-8');
      message = JSON.parse(decoded);
      return; // Not encrypted, skip
    } catch { /* encrypted, continue */ }
    const decrypted = decrypt(raw);
    if (typeof decrypted === 'string') {
      message = JSON.parse(decrypted);
    } else {
      message = decrypted;
    }
  } catch { return; }

  if (!isChatMessage(message)) return;

  // Extract message fields
  const sendUserId = message['1']['10']['senderUserId'];
  const sendMessage = message['1']['10']['reminderContent'];
  const chatId = String(message['1']['2']).split('@')[0];
  const createTime = Number(message['1']['5']);

  // Filter expired messages (5 min)
  if (Date.now() - createTime > 300_000) return;

  // Only process messages from seller (self)
  if (sendUserId !== myId) return;

  // Check for "给你卡密" trigger
  if (!sendMessage.includes('给你卡密')) return;

  // Generate key
  const keys = generateKeys(1, 1, false);
  const key = keys[0];

  // Find buyer ID from conversation
  // chatId format: buyerId_sellerId_itemId or just buyerId depending on conversation
  // The buyer is the other party in the conversation
  const buyerId = chatId;

  // Send key to buyer
  const replyText = `您的卡密：${key}\n请在 PPT 导出服务中使用此卡密`;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(buildSendMessage(chatId, buyerId, myId, replyText));
  }

  addLog({
    time: new Date().toLocaleString('zh-CN'),
    chatId,
    buyerId,
    key,
    message: replyText,
  });
}

// --- 停止连接 ---

export function stopXianyu(): { ok: boolean } {
  if (ws) {
    try { ws.close(); } catch { /* ignore */ }
    ws = null;
  }
  clearTimers();
  status = 'disconnected';
  cookiesStr = '';
  return { ok: true };
}
