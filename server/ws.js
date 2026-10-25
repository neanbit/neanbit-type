import { createHash } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX = 4096;

export function handshake(req, socket) {
  const key = req.headers['sec-websocket-key'];
  const ok = String(req.headers.upgrade || '').toLowerCase() === 'websocket' && key && req.headers['sec-websocket-version'] === '13';
  if (!ok) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return null;
  }
  const accept = createHash('sha1').update(key + GUID).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  return new Conn(socket);
}

class Conn {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.open = true;
    this.seen = Date.now();
    this.stamp = Date.now();
    this.sent = 0;
    this.onmessage = () => {};
    this.onclose = () => {};
    socket.setNoDelay(true);
    socket.on('data', (chunk) => this.read(chunk));
    socket.on('error', () => this.drop());
    socket.on('close', () => this.drop());
    this.beat = setInterval(() => {
      if (Date.now() - this.seen > 60000) return this.socket.destroy();
      this.frame(0x9, Buffer.alloc(0));
    }, 25000);
  }

  read(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    this.seen = Date.now();
    while (this.open) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = b[0] & 0x80;
      const op = b[0] & 0x0f;
      const masked = b[1] & 0x80;
      let len = b[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        const big = b.readBigUInt64BE(2);
        if (big > BigInt(MAX)) return this.close(1009);
        len = Number(big);
        off = 10;
      }
      if (len > MAX) return this.close(1009);
      if (!masked) return this.close(1002);
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4);
      const data = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      this.buf = b.subarray(off + 4 + len);
      if (op === 0x8) return this.close(1000);
      if (op === 0x9) { this.frame(0xa, data); continue; }
      if (op === 0xa) continue;
      if (op !== 0x1 || !fin) return this.close(1003);
      const now = Date.now();
      if (now - this.stamp > 1000) { this.stamp = now; this.sent = 0; }
      if (++this.sent > 60) return this.close(1008);
      this.onmessage(data.toString('utf8'));
    }
  }

  frame(op, payload) {
    if (!this.open) return;
    const n = payload.length;
    const head = n < 126 ? Buffer.from([0x80 | op, n]) : Buffer.from([0x80 | op, 126, n >> 8, n & 255]);
    this.socket.write(Buffer.concat([head, payload]));
  }

  send(text) {
    this.frame(0x1, Buffer.from(text));
  }

  close(code = 1000) {
    if (!this.open) return;
    this.frame(0x8, Buffer.from([code >> 8, code & 255]));
    this.socket.end();
    this.drop();
  }

  drop() {
    if (!this.open) return;
    this.open = false;
    clearInterval(this.beat);
    this.onclose();
  }
}
