const assert = require('assert');
assert.ok(process.env.JAMBONES_MYSQL_HOST &&
    process.env.JAMBONES_MYSQL_USER &&
    process.env.JAMBONES_MYSQL_PASSWORD &&
    process.env.JAMBONES_MYSQL_DATABASE, 'missing JAMBONES_MYSQL_XXX env vars');
assert.ok(process.env.JAMBONES_REDIS_HOST, 'missing JAMBONES_REDIS_HOST env var');
assert.ok(process.env.DRACHTIO_HOST, 'missing DRACHTIO_HOST env var');
assert.ok(process.env.DRACHTIO_PORT, 'missing DRACHTIO_PORT env var');
assert.ok(process.env.DRACHTIO_SECRET, 'missing DRACHTIO_SECRET env var');
const opts = Object.assign({
  timestamp: () => { return `, "time": "${new Date().toISOString()}"`; }
}, { level: process.env.JAMBONES_LOGLEVEL || 'info' });
const logger = require('pino')(opts);
const Srf = require('drachtio-srf');
const srf = new Srf();
const setName = `${(process.env.JAMBONES_CLUSTER_ID || 'default')}:active-sip`;

const {
  lookupAllVoipCarriers,
  lookupSipGatewaysByCarrier,
} = require('@jambonz/db-helpers')({
  host: process.env.JAMBONES_MYSQL_HOST,
  user: process.env.JAMBONES_MYSQL_USER,
  password: process.env.JAMBONES_MYSQL_PASSWORD,
  database: process.env.JAMBONES_MYSQL_DATABASE,
  connectionLimit: process.env.JAMBONES_MYSQL_CONNECTION_LIMIT || 10
}, logger);

const {
  retrieveSet } = require('@jambonz/realtimedb-helpers')({
  host: process.env.JAMBONES_REDIS_HOST || 'localhost',
  port: process.env.JAMBONES_REDIS_PORT || 6379
}, logger);

srf.locals = {
  ...srf.locals,
  dbHelpers: {
    lookupAllVoipCarriers,
    lookupSipGatewaysByCarrier,
  },
  realtimeDbHelpers: {
    retrieveSet
  }
};

srf.connect({ host: process.env.DRACHTIO_HOST, port: process.env.DRACHTIO_PORT, secret: process.env.DRACHTIO_SECRET });
srf.on('connect', (err, hp) => {
  const ativateRegBot = async(err, hp) => {
    if (err) return logger.error({ err }, 'Error connecting to drachtio server');
    logger.info(`connected to drachtio listening on ${hp}`);
    // Only run when I'm the first member in the set Of Actip Sip SBC
    const set = await retrieveSet(setName);
    const newArray = Array.from(set);
    let startRegBot = !newArray || newArray.length === 0;
    if (!startRegBot) {
      const firstSbc = newArray.at(0);
      const hostports = hp.split(',');
      for (const hp of hostports) {
        const arr = /^(.*)\/(.*:\d+)$/.exec(hp);
        if (firstSbc === arr[2]) {
          startRegBot = true;
          break;
        }
      }
    }
    if (startRegBot) {
      srf.locals.regbotStatus = require('./lib/sip-trunk-register')(logger, srf);
    } else {
      // Timer 30 seconds to make sure the task is transfered to another SBC outbound handler
      // In case the first server is dead.
      setTimeout(ativateRegBot.bind(this, err, hp), 30 * 1000);
    }
  };
  ativateRegBot(err, hp);
});

if (process.env.NODE_ENV === 'test') {
  srf.on('error', (err) => {
    logger.info(err, 'Error connecting to drachtio');
  });
}

module.exports = { srf, logger };
