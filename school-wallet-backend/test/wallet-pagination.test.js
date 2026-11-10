const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const Wallet = require('../src/models/Wallet');
const WalletController = require('../src/controllers/WalletController');

function response() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

test('admin wallet listing returns requested page and total wallet count', async () => {
  const originalGetAllWallets = Wallet.getAllWallets;
  const originalCountAllWallets = Wallet.countAllWallets;
  let pageArgs;
  Wallet.getAllWallets = async (...args) => {
    pageArgs = args;
    return [{ id: 8 }, { id: 9 }];
  };
  Wallet.countAllWallets = async () => 323;

  try {
    const res = response();
    await WalletController.getAllWallets({ query: { limit: '100', offset: '200' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.count, 2);
    assert.equal(res.body.data.totalCount, 323);
    assert.equal(res.body.data.limit, 100);
    assert.equal(res.body.data.offset, 200);
    assert.deepEqual(pageArgs, [100, 200]);
  } finally {
    Wallet.getAllWallets = originalGetAllWallets;
    Wallet.countAllWallets = originalCountAllWallets;
  }
});

test('admin wallet listing rejects invalid pagination before querying', async () => {
  const originalGetAllWallets = Wallet.getAllWallets;
  const originalCountAllWallets = Wallet.countAllWallets;
  let queried = false;
  Wallet.getAllWallets = async () => {
    queried = true;
    return [];
  };
  Wallet.countAllWallets = async () => {
    queried = true;
    return 0;
  };

  try {
    const res = response();
    await WalletController.getAllWallets({ query: { limit: '101', offset: '-1' } }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(queried, false);
  } finally {
    Wallet.getAllWallets = originalGetAllWallets;
    Wallet.countAllWallets = originalCountAllWallets;
  }
});
