declare module 'xtea' {
  class XTEA {
    constructor(key: Buffer);
    encipher(data: Buffer): Buffer;
    decipher(data: Buffer): Buffer;
  }
  export = XTEA;
}
