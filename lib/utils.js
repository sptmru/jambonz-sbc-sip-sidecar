const crypto = require('crypto');
const algorithm = process.env.LEGACY_CRYPTO ? 'aes-256-ctr' : 'aes-256-cbc';
const secretKey = crypto.createHash('sha256')
  .update(process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET)
  .digest('base64')
  .substring(0, 32);

function isUacBehindNat(req) {

  // no need for nat handling if wss or tcp being used
  if (req.protocol !== 'udp') return false;

  // let's keep it simple -- if udp, let's crank down the register interval
  return true;
}

function getSipProtocol(req) {
  if (req.getParsedHeader('Via')[0].protocol.toLowerCase().startsWith('wss')) return 'wss';
  if (req.getParsedHeader('Via')[0].protocol.toLowerCase().startsWith('ws')) return 'ws';
  if (req.getParsedHeader('Via')[0].protocol.toLowerCase().startsWith('tcp')) return 'tcp';
  if (req.getParsedHeader('Via')[0].protocol.toLowerCase().startsWith('udp')) return 'udp';
}

const decrypt = (data) => {
  const hash = JSON.parse(data);
  const decipher = crypto.createDecipheriv(algorithm, secretKey, Buffer.from(hash.iv, 'hex'));
  const decrpyted = Buffer.concat([decipher.update(Buffer.from(hash.content, 'hex')), decipher.final()]);
  return decrpyted.toString();
};

module.exports = {
  isUacBehindNat,
  getSipProtocol,
  decrypt,
  NAT_EXPIRES: 30
};
