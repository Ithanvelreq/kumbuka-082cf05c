import type { PinCrypto } from "../domain/ports.ts";

/**
 * STUB, NOT SECURE. Demo only: stores a trivial marker and accepts any PIN.
 * Planned: AES-GCM with a key derived from the PIN via PBKDF2/Argon2; verifyPin decrypts pin_check
 * and compares to id. Swap at injection time in infra/container.ts.
 */
export class NoOpPinCrypto implements PinCrypto {
  encryptCheck(id: string, _pin: string): string {
    return `noop:${id}`;
  }

  verifyPin(_id: string, _pin: string, _pinCheck: string): boolean {
    return true;
  }
}
