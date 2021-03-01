// @ts-nocheck
var PORTFOLIO_METADATA = {
  currency: 0
};

var PORTFOLIO_KEYSPEC = {
  account: 0,
  symbol: 1
};

var PORTFOLIO_TYPES = {
  CURRENCY: {
    stride: 1,
    amount: 0
  },
  UNITARY_ASSET: {
    stride: 1,
    amount: 0
  },
  ASSET: { 
    stride: 1,
    amount: 0
  }
};

function Portfolio(sheet, start) {
  Timeseries.call(this, sheet, PORTFOLIO_METADATA, PORTFOLIO_KEYSPEC, PORTFOLIO_TYPES, start);
}

Portfolio.prototype = Object.create(Timeseries.prototype);

Object.defineProperty(Portfolio.prototype, 'constructor', { 
    value: Portfolio, 
    enumerable: false,
    writable: true });

Portfolio.prototype.fromSheet = function(sheet) {
  return Timeseries.prototype.fromSheet.call(this, sheet, PORTFOLIO_METADATA, PORTFOLIO_KEYSPEC, PORTFOLIO_TYPES); 
}

Portfolio.prototype.metadataFromSheet = function(sheet) {
  return Timeseries.prototype.metadataFromSheet.call(this, sheet, PORTFOLIO_METADATA, PORTFOLIO_KEYSPEC, PORTFOLIO_TYPES); 
}

Portfolio.prototype.symbol = function(key) {
  return this.getKeyPart(key, "symbol");
}

Portfolio.prototype.account = function(key) {
  return this.getKeyPart(key, "account");
}

Portfolio.prototype.currency = function(key) {
  return this.getMetadata(key, "currency");
}

Portfolio.prototype.addAssetColumn = function(account, symbol, type, currency) {
  Timeseries.prototype.addColumnGroup.call(this, this.keyOf([account, symbol]), type, { currency: currency });
}

