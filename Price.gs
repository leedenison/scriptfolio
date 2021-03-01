// @ts-nocheck
var PRICE_METADATA = {
  currency: 0,
  fetch: 1
};

var PRICE_KEYSPEC = {
  symbol: 0
};

var PRICE_TYPES = {
  PRICE: { 
    stride: 1,
    price: 0
  },
  FX: {
    stride: 1,
    price: 0
  }
};

/** Constants which represent the state a symbol can be in w.r.t.
 *  fetching data from the Google Finance API.  State can be one
 *  of:
 *     UNKNOWN - Unknown whether this symbol can be fetched from
 *               Google.  If this symbol is included in a fetch
 *               job retrieval will be attempted and the symbol
 *               will either be classified as AVAILABLE or
 *               NOT_AVAILABLE depending on the result.
 *     AVAILABLE - Fetching has succeeded in the past.
 *     NOT_AVAILABLE - Fetching has never succeeded despite
 *               attempts in the past.
 *     DEFUNCT - Symbol was previously available but is no longer
 *               available.  This may be due to a temporary
 *               network error or because the symbol has been
 *               removed, likely due to an acquisition.
 *     ARCHIVED - Symbol is DEFUNCT and the existing price data
 *               has been archived to a dedicated transaction log
 *               since it can no longer be retrieved from
 *               Google Finance.
 */
var UNKNOWN = "UNKNOWN";
var AVAILABLE = "AVAILABLE";
var NOT_AVAILABLE = "NOT_AVAILABLE";
var DEFUNCT = "DEFUNCT";
var ARCHIVED = "ARCHIVED";

/** Constructs a non-sparse price timeseries. */
function Price(sheet, start) {
  Timeseries.call(this, sheet, PRICE_METADATA, PRICE_KEYSPEC, PRICE_TYPES, start);
}

Price.prototype = Object.create(Timeseries.prototype);

Object.defineProperty(Price.prototype, 'constructor', { 
    value: Price, 
    enumerable: false,
    writable: true });

Price.prototype.fromSheet = function(sheet) {
  return Timeseries.prototype.fromSheet.call(this, sheet, PRICE_METADATA, PRICE_KEYSPEC, PRICE_TYPES); 
}

Price.prototype.metadataFromSheet = function(sheet) {
  return Timeseries.prototype.metadataFromSheet.call(this, sheet, PRICE_METADATA, PRICE_KEYSPEC, PRICE_TYPES); 
}

Price.prototype.symbols = function() {
  return this.keys();
}

Price.prototype.symbol = function(key) {
  return key;
}

Price.prototype.currency = function(key) {
  return this.getMetadata(key, "currency");
}

Price.prototype.currencySet = function() {
  var result = {};
  var currencyMap = this.currencyMap();
  var keys = this.keys();

  for (var i = 0; i < keys.length; i++) {
    result[currencyMap[keys[i]]] = true;
  }

  return result;
}

Price.prototype.currencyMap = function() {
  return this.metadataMap("currency");
}

Price.prototype.fetchStatus = function(key) {
  return this.getMetadata(key, "fetch");
}

Price.prototype.addPriceColumn = function(symbol, type, currency, fetch) {
  Timeseries.prototype.addColumnGroup.call(this, this.keyOf([symbol]), type, { currency: currency, fetch: fetch });
}

/** Constructs a sparse price timeseries. */
function SparsePrice(sheet, start) {
  SparseTimeseries.call(this, sheet, PRICE_METADATA, PRICE_KEYSPEC, PRICE_TYPES, start);
}

SparsePrice.prototype = Object.create(SparseTimeseries.prototype);

Object.defineProperty(SparsePrice.prototype, 'constructor', { 
    value: SparsePrice, 
    enumerable: false,
    writable: true });

SparsePrice.prototype.fromSheet = function(sheet) {
  return SparseTimeseries.prototype.fromSheet.call(this, sheet, PRICE_METADATA, PRICE_KEYSPEC, PRICE_TYPES); 
}

SparsePrice.prototype.symbol = function(key) {
  return this.getKeyPart(key, "symbol");
}

SparsePrice.prototype.currency = function(key) {
  return this.getMetadata(key, "currency");
}

SparsePrice.prototype.google = function(key) {
  return this.getMetadata(key, "google");
}

SparsePrice.prototype.addPriceColumn = function(symbol, type, currency, fetch) {
  SparseTimeseries.prototype.addColumnGroup.call(this, this.keyOf([symbol]), type, { currency: currency, fetch: fetch });
}

/** Converts the SparsePrice to a non-sparse Price. */
SparsePrice.prototype.toPrice = function(start, end) {  
  var result = new Price(this.sheet, start);

  var keys = this.keys();
  for (var i = 0; i < keys.length; i++) {
    result.copyColumnGroup(keys[i], this.columns[keys[i]]);
  }
  result.values = this.materializeValues(start, end);
  return result;
}
