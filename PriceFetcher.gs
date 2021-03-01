var MAX_CHUNK_SYMBOLS = 10;
var MAX_CHUNK_INTERVAL = 365;

var RETRY_WAIT_TIME = 2000;

var DAY_IN_MILLIS = 86400000;

var LIVE_PRICE_FORMULA = [
  "=IFERROR(GOOGLEFINANCE(\"", 
  "\",\"price\"), 0)"
];

var LIVE_FX_FORMULA = [
  "=IFERROR(GOOGLEFINANCE(\"", 
  "\"), 0)"
];

var PRICE_FORMULA = [
  "=QUERY(GOOGLEFINANCE(\"",
  "\",\"price\",\"",
  "\",\"",
  "\"), \"select Col1, Col2 label Col1 '', Col2 ''\")"
];

var CURRENCY_FORMULA = [
  "=GOOGLEFINANCE(\"",
  "\",\"currency\")"
];

var QUERY_STRIDE = 2;

/** PriceFetcher fetches price data for the specified symbols from
 *  start date up to, but not including the end date.
 * 
 *  Since the Google Finance API limits the amount of data that can
 *  be requested and the number of simultaneous requests, fetching is
 *  broken into chunks that limit the maximum number of symbols and 
 *  the maximum interval that can be requested at once.
 */
function PriceFetcher(sheet, status, job) {
  this.sheet = sheet;
  this.job = job;
  this.status = status;
}

/** Fetches the specified symbols for the specified interval.  After 
 *  fetch completes the status of each symbol is available in the
 *  job.
 */
PriceFetcher.prototype.fetchPrices = function(retries = 1) {
  this.status.setStatus("Starting fetch: " + this.job.toString());
  var chunkJobs = this.createChunkJobs(this.job);
  var results = [];

  for (var i = 0; i < chunkJobs.length; i++) {
    this.status.setStatus("Fetching chunk job: " + chunkJobs[i].toString());
    var job = chunkJobs[i];
    var retryJobs = [];
    var attempts = 0;

    if (job.symbols.attemptFetch().length == 0) {
      // Skip this chunk job if there are no symbols to fetch
      continue;
    }

    while (attempts < retries) {
      this.initWorksheet();

      var formulas = this.generatePriceFormulas(job);
      this.writeFormulas(formulas);
      this.readPriceResults(job);
      retryJobs.push(job);

      job = this.createRetryJob(job);

      if (!job.isEmpty()) {
        Utilities.sleep(RETRY_WAIT_TIME);
        attempts++;
      } else {
        break;
      }
    }

    job = this.mergeRetryJobs(retryJobs);
    results.push(job);
  }

  this.job = this.mergeChunkJobs(results);
}

/** Fetches the specified symbol currencies. */
PriceFetcher.prototype.fetchCurrencies = function(unknownCurrencyMap) {
  this.job.unknownCurrencyMap = unknownCurrencyMap;
  this.initWorksheet();
  var formulas = this.generateCurrencyFormulas(this.job);
  this.writeFormulas(formulas);
  this.job.currencies = this.readCurrencyResults(this.job);
}

PriceFetcher.prototype.initWorksheet = function() {
  clearSheet(this.sheet);
}

/** Returns a list of fetch jobs with fewer than MAX_CHUNK_SYMBOLS 
 *  symbols and fewer than MAX_CHUNK_INTERVAL days per fetch job which,
 *  when combined, will constitute the list of symbols and date range
 *  specified.
 */
PriceFetcher.prototype.createChunkJobs = function(job) {
  var jobs = [];

  if (job.isEmpty()) {
    throw new Error("Empty fetch job requested: " + job.toString());
  }

  for (var i = 0; i < job.symbols.all.length; i = i + MAX_CHUNK_SYMBOLS) {
    var chunkSymbols = job.symbols.all.slice(i, i + MAX_CHUNK_SYMBOLS);

    var intervalStart = new Date(job.start);
    var intervalEnd = new Date(intervalStart);
    intervalEnd.setDate(intervalEnd.getDate()+ MAX_CHUNK_INTERVAL);
    for (var j = new Date(intervalEnd); j.getTime() < job.end.getTime(); j.setDate(j.getDate() + MAX_CHUNK_INTERVAL)) {
      jobs.push(new PriceFetcherJob(chunkSymbols, new Date(intervalStart), new Date(j), job.symbols.doNotAttemptFetch()));
      intervalStart = new Date(j);
    }

    if (intervalStart.getTime() < job.end.getTime()) {
      jobs.push(new PriceFetcherJob(chunkSymbols, new Date(intervalStart), new Date(job.end), job.symbols.doNotAttemptFetch()));
    }
  }

  return jobs;
}

/** Merges the results of a list of completed jobs that cover
 *  non-overlapping ranges of data.  Assumes that the jobs are
 *  ordered with earlier result sets appearing first in the
 *  list.
 */
PriceFetcher.prototype.mergeChunkJobs = function(jobs) {
  var debug = this;
  // Foreach chunk job
  for (var i = 0; i < jobs.length; i++) {
    var chunkJob = jobs[i];

    // Foreach symbol attempted in the chunk job
    var chunkAttempted = chunkJob.symbols.attemptFetch();
    for (var j = 0; j < chunkAttempted.length; j++) {
      var symbol = chunkAttempted[j];

      if (chunkJob.symbols.isSuccess(symbol)) {
        var srcIdx = chunkJob.symbols.indexOf(symbol);
        var destIdx = this.job.symbols.indexOf(symbol);
        var rowOffset = 0;

        // Find the first row not set for this symbol
        for (; rowOffset < this.job.values.length; rowOffset++) {
          if (this.job.values[rowOffset][destIdx] == "") {
            break;
          }
        }

        // Foreach row in the chunk job
        for (var k = 0; k < chunkJob.values.length; k++) {
          if (this.job.values.length <= k + rowOffset) {
            var row = [];
            for (var l = 0; l < this.job.symbols.all.length * QUERY_STRIDE; l++) {
              row.push("");
            }
            this.job.values.push(row);
          }

          // Foreach column of the symbol
          for (var l = 0; l < QUERY_STRIDE; l++) {
            this.job.values[k + rowOffset][destIdx + l] = chunkJob.values[k][srcIdx + l];
          }
        }

        // Mark the job a success
        this.job.symbols.update(symbol, true);
      } else {
        this.job.symbols.update(symbol, false);
      }
    }
  }

  return this.job;
}

PriceFetcher.prototype.generatePriceFormulas = function(job) {
  var result = [];

  for (var i = 0; i < job.symbols.all.length; i++) {
    var symbol = job.symbols.all[i];

    if (job.symbols.shouldAttemptFetch(symbol)) {
      var formula = PRICE_FORMULA[0] + symbol + PRICE_FORMULA[1] +
          job.formattedStart() + PRICE_FORMULA[2] +
          job.formattedEnd() + PRICE_FORMULA[3];
      result.push(formula);
    } else {
      result.push("");
    }

    for (var j = 0; j < QUERY_STRIDE - 1; j++) {
      result.push("");
    }
  }

  return result;
}

PriceFetcher.prototype.generateCurrencyFormulas = function(job) {
  var result = [];

  for (var i = 0; i < job.symbols.all.length; i++) {
    var symbol = job.symbols.all[i];

    if (job.symbols.shouldAttemptFetch(symbol) &&
        !symbol.startsWith("CURRENCY:")) {
      var formula = CURRENCY_FORMULA[0] + symbol + CURRENCY_FORMULA[1];
      result.push(formula);
    } else {
      result.push("");
    }
  }

  return result;
}

PriceFetcher.prototype.writeFormulas = function(formulas) {
  this.sheet.getRange(1, 1, 1, formulas.length).setValues([formulas]);
}

PriceFetcher.prototype.readPriceResults = function(job) {
  // Read the actual fetch results
  job.values = this.sheet.getRange(1, 1, this.sheet.getLastRow(), job.width()).getValues();

  if (job.values.length == 0) {
    return;
  }

  // Update the state of all symbols we attempted to fetch
  var fetchAttempted = job.symbols.attemptFetch();
  for (var i = 0; i < fetchAttempted.length; i++) {
    var symbol = fetchAttempted[i];
    var idx = job.symbols.indexOf(symbol);
    job.symbols.update(symbol, job.values[0][idx] != "#N/A");

    if (job.symbols.isSuccess(symbol)) {
      for (var j = 0; j < job.values.length; j++) {
        if (job.values[j][idx] !== "") {
          job.values[j][idx] = new Date(job.values[j][idx]);
          job.values[j][idx].setHours(0,0,0,0);
        }
      }
    }
  }
}

PriceFetcher.prototype.readCurrencyResults = function(job) {
  // Read the actual fetch results
  var values = this.sheet.getRange(1, 1, 1, job.symbols.all.length).getValues();
  var result = {};

  if (values.length == 0) {
    return {};
  } else {
    var row = values[0];

    for (var i = 0; i < job.symbols.all.length && i < row.length; i++) {
      var symbol = job.symbols.all[i];
      
      if (row[i] != "#N/A") {
        result[symbol] = row[i];
      } else if (job.unknownCurrencyMap[symbol] !== undefined) {
        result[symbol] = job.unknownCurrencyMap[symbol];
      } else {
        result[symbol] = "";
      }
    }

    return result;
  }
}

PriceFetcher.prototype.createRetryJob = function(job) {
  return new PriceFetcherJob(job.symbols.failed(), new Date(job.start), new Date(job.end));
}

PriceFetcher.prototype.mergeRetryJobs = function(jobs) {
  var result = jobs[0];

  // Foreach retry job to be merged
  for (var i = 1; i < jobs.length; i++) {
    var job = jobs[i];

    // Foreach symbol that succeeded in the retry job
    var succeeded = job.symbols.succeeded();
    for (var j = 0; j < succeeded.length; j++) {
      var symbol = succeeded[j];
      var srcIdx = job.symbols.indexOf(symbol);
      var destIdx = result.symbols.indexOf(symbol);

      // Foreach row in the result
      for (var k = 0; k < result.values.length; k++) {
        // Foreach column in the symbol query
        for (var l = 0; l < QUERY_STRIDE; l++) {
          result.values[k][destIdx + l] = job.values[k][srcIdx + l];
        }
      }

      // Mark symbol succeeded
      result.symbols.update(symbol, true);
    }
  }

  return result;
}

/** PriceFetcherJob represents a task to fetch the prices for the
 *  specified symbols between start date and end date.  After
 *  completion values is populated with the sparse results.
 * 
 *  Symbol order is preserved and skipSymbols specifies symbols
 *  that should be skipped but preserved in the output.  Values
 *  is therefore guaranteed to contain QUERY_STRIDE * symbols 
 *  columns.
 */
function PriceFetcherJob(symbols, start, end, skipSymbols = []) {
  this.symbols = new SymbolFetchState(symbols);
  this.symbols.setAllDoNotAttemptFetch(skipSymbols);
  this.start = start;
  this.end = end;
  this.values = [];
  this.currencies = {};
  this.unknownCurrencyMap = {};
}

PriceFetcherJob.prototype.appendSymbolsWithCurrency = function(symbolMap) {
  var symbols = Object.keys(symbolMap);
  for (var i = 0; i < symbols.length; i++) {
    var symbol = symbols[i];

    this.symbols.appendSymbol(symbol);
    this.currencies[symbol] = symbolMap[symbol];
  }
}

PriceFetcherJob.prototype.isEmpty = function() {
  return this.symbols.all.length == 0 || this.start.getTime() >= this.end.getTime();
}

PriceFetcherJob.prototype.width = function() {
  return this.symbols.all.length * QUERY_STRIDE;
}

PriceFetcherJob.prototype.formattedStart = function() {
  return this.formatDate(this.start);
}

PriceFetcherJob.prototype.formattedEnd = function() {
  return this.formatDate(this.end);
}

PriceFetcherJob.prototype.interval = function() {
  return interval(this.start, this.end);
}

PriceFetcherJob.prototype.toString = function() {
  return "<Job: symbols[" + this.symbols.all + "], interval: " + this.formattedStart() + " - " + this.formattedEnd() + ">";
}

PriceFetcherJob.prototype.formatDate = function(date) {
  return date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate();
}

function interval(start, end) {
  return Math.floor((end.getTime() - start.getTime()) / DAY_IN_MILLIS);
}

PriceFetcherJob.prototype.currencySet = function() {
  var result = {};
  var symbols = Object.keys(this.currencies);

  for (var i = 0; i < symbols.length; i++) {
    result[this.currencies[symbols[i]]] = true;
  }

  return result;
}

/** Creates a SparsePrice timeseries based on the results of this
 *  fetch job and the specified existing status for each symbol.
 */
PriceFetcherJob.prototype.toSparsePrice = function() {
  var result = new SparsePrice(undefined, this.start);

  for (var i = 0; i < this.symbols.all.length; i++) {
    // Create column group
    var symbol = this.symbols.all[i];
    var idx = this.symbols.symbolIndex[symbol];
    var type = "PRICE";

    if (symbol.startsWith("CURRENCY:")) {
      type = "FX";
    }

    result.addPriceColumn(symbol, type, this.currencies[symbol], this.symbols.getPriceFetchStatus(symbol));

    // Add values
    for (var j = 0; j < this.values.length; j++) {
      if (result.length() <= j) {
        result.appendEmptyRow();
      }

      var price = [];
      for (var k = 0; k < QUERY_STRIDE; k++) {
        price.push(this.values[j][idx + k]);
      }
      var key = result.keyOf([symbol]);
      result.insertAtRow(key, j, price);
    }
  }

  return result;
}

/** SymbolFetchState represents the state of a set of symbols.
 *  
 *  A symbol is in one of two mutually exclusive states
 *  which describe whether retrieval should be attempted for
 *  the symbol: attemptFetch, doNotAttemptFetch.
 * 
 *  A symbol is also in one of three mutually exclusive states
 *  which describe the results of fetching for the symbol:
 *  notAttempted, failed, succeeded
 * 
 *  A convenience state is also described which always contains
 *  the union of notAttempted and failed: empty
 */
function SymbolFetchState(symbols, symbolStride = QUERY_STRIDE) {
  this.all = symbols;
  this.symbolStride = symbolStride;
  this.symbolIndex = this.initSymbolIndex();
  this.attemptFetchSymbols = this.initSymbolIndex();
  this.doNotAttemptFetchSymbols = {};
  this.notAttemptedSymbols = this.initSymbolIndex();
  this.succeededSymbols = {};
  this.failedSymbols = {};
  this.initialPriceStatus = {};
}

SymbolFetchState.prototype.appendSymbol = function(symbol) {
  var idx = this.all.length * this.symbolStride;

  this.all.push(symbol);
  this.symbolIndex[symbol] = idx;
  this.attemptFetchSymbols[symbol] = idx;
  this.notAttemptedSymbols[symbol] = idx;
}

SymbolFetchState.prototype.update = function(symbol, success) {
  delete this.notAttemptedSymbols[symbol];
  if (success) {
    this.succeededSymbols[symbol] = this.symbolIndex[symbol];
  } else {
    this.failedSymbols[symbol] = this.symbolIndex[symbol];
  }
}

SymbolFetchState.prototype.indexOf = function(symbol) {
  return this.symbolIndex[symbol];
}

SymbolFetchState.prototype.shouldAttemptFetch = function(symbol) {
  return (symbol in this.attemptFetchSymbols);
}

SymbolFetchState.prototype.attemptFetch = function() {
  return Object.keys(this.attemptFetchSymbols);
}

SymbolFetchState.prototype.doNotAttemptFetch = function() {
  return Object.keys(this.doNotAttemptFetchSymbols);
}

SymbolFetchState.prototype.failed = function() {
  return Object.keys(this.failedSymbols);
}

SymbolFetchState.prototype.isFailed = function(symbol) {
  return symbol in this.failedSymbols;
}

SymbolFetchState.prototype.succeeded = function() {
  return Object.keys(this.succeededSymbols);
}

SymbolFetchState.prototype.isSuccess = function(symbol) {
  return symbol in this.succeededSymbols;
}

SymbolFetchState.prototype.empty = function() {
  var result = this.failed();
  var notAttempted = this.doNotAttemptFetch();

  for (var i = 0; i < notAttempted.length; i++) {
    result.push(notAttempted[i]);
  }

  return result; 
}

SymbolFetchState.prototype.initSymbolIndex = function() {
  var symbolIndex = {};

  for (var i = 0; i < this.all.length; i++) {
    symbolIndex[this.all[i]] = i * this.symbolStride;
  }

  return symbolIndex;
}

SymbolFetchState.prototype.setAllDoNotAttemptFetch = function(symbols) {
  for (var i = 0; i < symbols.length; i++) {
    delete this.attemptFetchSymbols[symbols[i]];
    this.doNotAttemptFetchSymbols[symbols[i]] = this.indexOf(symbols[i]);
  }
}

/** Set the initial Price fetch status for all symbols. */
SymbolFetchState.prototype.setInitialPriceStatus = function(statusMap) {
  var doNotFetch = [];

  var symbols = Object.keys(statusMap);
  for (var i = 0; i < symbols.length; i++) {
    var symbol = symbols[i];

    if (statusMap[symbol] === NOT_AVAILABLE || statusMap[symbol] === DEFUNCT) {
      doNotFetch.push(symbol);
    }
  }

  this.initialPriceStatus = statusMap;
  this.setAllDoNotAttemptFetch(doNotFetch);
}

/** Return new Price fetch status based on initial fetch status and
 *  the outcome of this fetch job.
 */
SymbolFetchState.prototype.getPriceFetchStatus = function(symbol) {
  if (this.initialPriceStatus[symbol] === undefined || this.initialPriceStatus[symbol] === UNKNOWN) {
    if (this.isSuccess(symbol)) {
      return AVAILABLE;
    } else {
      return NOT_AVAILABLE;
    }
  } else if (this.initialPriceStatus[symbol] === AVAILABLE) {
    if (this.isSuccess(symbol)) {
      return AVAILABLE;
    } else {
      return DEFUNCT;
    }
  } else {
    return this.initialPriceStatus[symbol];
  }
}
