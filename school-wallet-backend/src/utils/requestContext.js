const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

const storage = new AsyncLocalStorage();

const requestContext = (req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  storage.run({ requestId: req.requestId }, next);
};

const getRequestId = () => storage.getStore()?.requestId;

module.exports = { requestContext, getRequestId };
