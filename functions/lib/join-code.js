// 0000..9999, uniformly sampled without modulo bias. Keep leading zeroes.
export function generateJoinCode(randomBytes) {
  let value;
  do { value = randomBytes(2).readUInt16BE(0); } while (value >= 60000);
  return String(value % 10000).padStart(4, '0');
}
