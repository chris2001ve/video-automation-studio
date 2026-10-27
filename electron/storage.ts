import fs from 'node:fs';
import path from 'node:path';

/** Archivo JSON con escritura atómica y diferida (evita corromper datos si la app se cierra). */
export class JsonFile<T> {
  private timer: NodeJS.Timeout | null = null;
  private pending: T | null = null;
  constructor(private file: string, private fallback: T) {}

  read(): T {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8')) as T;
    } catch {
      return structuredClone(this.fallback);
    }
  }

  writeNow(data: T) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  write(data: T, delayMs = 300) {
    this.pending = data;
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), delayMs);
  }

  flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.pending) { this.writeNow(this.pending); this.pending = null; }
  }
}
