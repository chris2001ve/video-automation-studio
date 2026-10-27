import { safeStorage } from 'electron';
import { JsonFile } from './storage';

export type SecretName = 'fal' | 'byteplus' | 'gemini';

/** API keys cifradas con el llavero del sistema (Electron safeStorage: Keychain / DPAPI / libsecret). */
export class SecretStore {
  private file: JsonFile<Record<string, string>>;
  private cache: Record<string, string>;
  constructor(filePath: string) {
    this.file = new JsonFile(filePath, {});
    this.cache = this.file.read();
  }
  private get encrypted() { return safeStorage.isEncryptionAvailable(); }

  get(name: SecretName): string {
    const v = this.cache[name];
    if (!v) return '';
    try {
      if (v.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(v.slice(4), 'base64'));
      if (v.startsWith('b64:')) return Buffer.from(v.slice(4), 'base64').toString('utf8');
    } catch { /* clave ilegible */ }
    return '';
  }

  set(name: SecretName, value: string) {
    if (!value) delete this.cache[name];
    else this.cache[name] = this.encrypted
      ? 'enc:' + safeStorage.encryptString(value).toString('base64')
      : 'b64:' + Buffer.from(value, 'utf8').toString('base64');
    this.file.writeNow(this.cache);
  }

  status(): Record<SecretName, boolean> {
    return { fal: !!this.cache.fal, byteplus: !!this.cache.byteplus, gemini: !!this.cache.gemini };
  }

  isSecure() { return this.encrypted; }
}
