var DEFAULT_LOCAL_CURRENCY = "GBP";
var EXCLUDE_CURRENCIES = ["GBX"];

/** TxLogSet abstracts a collection of transaction logs. */
function TxLogSet(logs, worksheet, prices, livePrices, status, localCurrency = DEFAULT_LOCAL_CURRENCY) {
  this.logs = logs;
  this.worksheet = worksheet;
  this.livePrices = livePrices;
  this.prices = prices;
  this.status = status;
  this.localCurrency = localCurrency;
}

TxLogSet.prototype.createExpensesLog = function(sheet) {
  var tagSet = {};
  var tags = [];
  var result = [];
  var formulas = ["=MONTH(R[0]C[-6])", "=YEAR(R[0]C[-7])"];

  for (var i = 0; i < this.logs.length; i++) {
    if (this.logs[i].options.hasExpenses) {
      tagSet = this.unionMap(tags, this.logs[i].tagSet);
    }
  }

  tags = Object.keys(tagSet);
  for (var i = 0; i < this.logs.length; i++) {
    if (this.logs[i].options.hasExpenses) {
      this.logs[i].appendToStandardLog(result, formulas, tags, new ExpensesFilter());
    }
  }

  sheet.clear();

  var headers = ["Date", "Description", "Account", "Symbol", "Amount", "Category", "Month", "Year"];
  for (var i = 0; i < tags.length; i++) {
    headers.push(tags[i]);
  }
  
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  if (result.length > 0 && result[0].length > 0) {
    sheet.getRange(headers.length + 1, 1, result.length, result[0].length).setValues(result);
  }

  sheet.sort(1);
}

TxLogSet.prototype.updatePrices = function() {
  var update  = this.fetchNewPrices();
  update = this.fetchRecentPrices() || update;

  // Serialize Price timeseries
  if (update) {
    this.status.setStatus("Writing prices...");
    this.prices.toSheet();

    this.updateLivePrices();
    this.livePrices.toSheet();
  } else {
    this.status.setStatus("No price updates needed...");
  }
}

TxLogSet.prototype.updateLivePrices = function() {
  this.livePrices = new Price(this.livePrices.sheet, new Date());
  var symbols = this.prices.symbols();
  for (var i = 0; i < symbols.length; i++) {
    var symbol = symbols[i];
    this.livePrices.copyColumnGroup(symbol, this.prices.columns[symbol]);
  }

  var row = [];
  for (var i = 0; i < symbols.length; i++) {
    var symbol = symbols[i];
    var fetchStatus = this.livePrices.fetchStatus(symbol);

    if (fetchStatus === "AVAILABLE") {
      if (this.prices.type(symbol) === "PRICE") {
        row.push(LIVE_PRICE_FORMULA[0] + symbol + LIVE_PRICE_FORMULA[1]);
      } else if (this.prices.type(symbol) === "FX") {
        row.push(LIVE_FX_FORMULA[0] + symbol + LIVE_FX_FORMULA[1]);
      }
    } else {
      var latestPrice = this.prices.get(this.prices.length() - 1, symbol, "price");
      row.push(latestPrice);
    }
  }
  this.livePrices.values.push(row);
}

TxLogSet.prototype.fetchNewPrices = function() {
  // Find a map of symbols which are new in the logs
  this.status.setStatus("Calculating new symbols...");
  var newSymbols = Object.keys(this.newSymbolSet());
  var existingCurrencySet = this.prices.currencySet();
  var end = this.prices.end();

  if (this.prices.length() == 0) {
    // Fetch until yesterday if we have no prices currently
    end = new Date();
    end.setHours(0,0,0,0);
  }

  var fetcher = this.createFetcher(
      this.prices.start(),
      end,
      newSymbols,
      this.initialPriceStatusUnknown(newSymbols));

  if (newSymbols.length > 0) {
    this.status.setStatus("Fetching currencies for new symbols...");
    fetcher.fetchCurrencies(this.currencyMap());

    var newCurrencySet = this.subtractMap(fetcher.job.currencySet(), existingCurrencySet);
    fetcher.job.appendSymbolsWithCurrency(this.fxSymbols(newCurrencySet));

    this.status.setStatus("Fetching prices for new symbols...");
    fetcher.fetchPrices();

    // Convert fetched prices to a SparsePrice timeseries
    this.status.setStatus("Merging prices for new symbols...");
    var newSparsePrices = fetcher.job.toSparsePrice();

    // Add any prices for new symbols present in this TxLogSet
    // to the SparsePrice timeseries 
    this.addToSparsePrice(newSparsePrices, fetcher.job.symbols.failed());

    // Convert to non-sparse timeseries
    var newPrices = newSparsePrices.toPrice(this.prices.start(), end);

    // Add new symbols to Price timeseries
    this.prices.merge(newPrices);

    return true;
  } else {
    return false;
  }
}

TxLogSet.prototype.fetchRecentPrices = function() {
  // Fetch Google prices for all symbols covering the period after the Price timeseries to yesterday
  var start = new Date(this.prices.end());
  var end = new Date();
  end.setHours(0,0,0,0);

  var fetcher = this.createFetcher(start, end, this.prices.symbols(), this.prices.metadataMap("fetch"));

  if (!fetcher.job.isEmpty()) {
    this.status.setStatus("Fetching recent prices for all symbols...");
    fetcher.fetchPrices();

    this.status.setStatus("Appending recent prices...");
    // Convert fetched prices to a SparsePrice timeseries
    var recentSparsePrices = fetcher.job.toSparsePrice();

    // Copy the most recent prices for each symbol to the sparse 
    // price to allow initial prices to be interpolated
    this.addMostRecentRowToSparsePrice(recentSparsePrices, this.prices);

    // Add any recent prices for symbols present in this TxLogSet
    // to the SparsePrice timeseries 
    this.addToSparsePrice(recentSparsePrices, fetcher.job.symbols.empty());

    // Convert to non-sparse timeseries
    var recentPrices = recentSparsePrices.toPrice(start, end);

    // Append values to Price timeseries
    this.prices.append(recentPrices);

    return true;
  } else {
    return false;
  }
}

/** Set the initial Price fetch status to UNKNOWN for all symbols. */
TxLogSet.prototype.initialPriceStatusUnknown = function(symbols) {
  var result = {};

  for (var i = 0; i < symbols.length; i++) {
    result[symbols[i]] = UNKNOWN;
  }

  return result
}

/** Returns the new symbols found in the logs which do not appear
 *  in the current price timeseries.  Includes any symbols which
 *  are marked with UNKNOWN fetch status in current Price 
 *  timeseries.
 * 
 *  Returns a set of new symbols.
 */
TxLogSet.prototype.newSymbolSet = function() {
  priceSymbols = this.prices.symbols();
  logSymbols = this.assetSymbols();
  
  // Filter for new symbols and their currencies
  for (var i = 0; i < priceSymbols.length; i++) {
    var symbol = priceSymbols[i];
    if (this.prices.getMetadata(symbol, "fetch") != UNKNOWN) {
      delete logSymbols[symbol];
    }
  }
  return logSymbols;
}

TxLogSet.prototype.createFetcher = function(start, end, symbols, statusMap) {
  var fetchJob = new PriceFetcherJob(symbols, start, end);
  fetchJob.symbols.setInitialPriceStatus(statusMap);
  return new PriceFetcher(this.worksheet, this.status, fetchJob);
}

/** Return a map of symbols to currencies for this log set.
 */
TxLogSet.prototype.currencyMap = function() {
  var result = {};

  for (var i = 0; i < this.logs.length; i++) {
    var logMap = this.logs[i].currencyMap();
    var logSymbols = Object.keys(logMap);

    for (var j = 0; j < logSymbols.length; j++) {
      var symbol = logSymbols[j];

      if (!(symbol in result)) {
        result[symbol] = logMap[symbol];
      }
    }
  }

  return result;
}

/** Return a map that is the union of the supplied maps. */
TxLogSet.prototype.unionMap = function(...maps) {
  var result = {};

  for (var i = 0; i < maps.length; i++) {
    var keys = Object.keys(maps[i]);
    for (var j = 0; j < keys.length; j++) {
      if (!(keys[j] in result)) {
        result[keys[j]] = maps[i][keys[j]];
      }
    }
  }

  return result;
}

/** Return a map that is the set subtraction of the supplied maps. */
TxLogSet.prototype.subtractMap = function(first, second) {
  var result = {};

  var keys = Object.keys(first);
  for (var j = 0; j < keys.length; j++) {
    if (!(keys[j] in second)) {
      result[keys[j]] = first[keys[j]];
    }
  }

  return result;
}

/** Return a map of asset symbols for this log set.
 */
TxLogSet.prototype.assetSymbols = function() {
  var result = {};

  for (var i = 0; i < this.logs.length; i++) {
    var logSymbols = this.logs[i].symbols();

    for (var j = 0; j < logSymbols.length; j++) {
      var symbol = logSymbols[j];

      if (this.logs[i].type(symbol) == "ASSET") {
        result[symbol] = true;
      }
    }
  }

  return result;
}

/** Return a map of non-asset symbols to currency for this log set.
 */
TxLogSet.prototype.nonAssetCurrencies = function() {
  var result = {};

  for (var i = 0; i < this.logs.length; i++) {
    var logSymbols = this.logs[i].symbols();

    for (var j = 0; j < logSymbols.length; j++) {
      var symbol = logSymbols[j];

      if (this.logs[i].type(symbol) !== "ASSET") {
        result[symbol] = this.logs[i].currency(symbol);
      }
    }
  }

  return result;
}

/** Convert the supplied currencies into fx symbols which convert the
 *  currency to this.localCurrency.
 * 
 *  EXCLUDE_CURRENCIES will be ommitted to allow for special handling
 *  (eg. GBX).
 */
TxLogSet.prototype.fxSymbols = function(currencySet) {
  var result = {};
  var currencies = Object.keys(currencySet);

  for (var j = 0; j < currencies.length; j++) {
    var currency = currencies[j];

    if (currency !== this.localCurrency && EXCLUDE_CURRENCIES.indexOf(currency) < 0) {
      var fxSymbol = "CURRENCY:" + currency + this.localCurrency;
      result[fxSymbol] = this.localCurrency;
    }
  }

  return result;
}

TxLogSet.prototype.addToSparsePrice = function(prices, symbols) {
  // Read values from each transaction log
  for (var i = 0; i < this.logs.length; i++) {
    if (this.logs[i].hasPrices()) {
      this.logs[i].appendPricesToSparsePrice(prices, symbols);
    }
  }
}

TxLogSet.prototype.addMostRecentRowToSparsePrice = function(sparsePrices, prices) {
  if (prices.length() > 0) {
    var symbols = prices.symbols();
    var row = prices.length() - 1;

    for (var i = 0; i < symbols.length; i++) {
      var symbol = symbols[i];
      var key = prices.keyOf([symbol]);
      var price = prices.get(row, key, "price");
      var date = prices.getRowDate(row);

      if (sparsePrices.hasKey(key) && (sparsePrices.length() == 0 || sparsePrices.get(0, key, "price") == "")) {
        sparsePrices.insertAtDate(key, date, [price]);
      }
    }
  }
}

TxLogSet.prototype.toPortfolio = function(name, start, end) {
  var result;
  var currencyMap = this.unionMap(this.prices.currencyMap(), this.nonAssetCurrencies());
  start.setHours(0,0,0,0);
  end.setHours(0,0,0,0);

  for (var i = 0; i < this.logs.length; i++) {
    if (this.logs[i].options.hasAssets) {
      var logPortfolio = this.logs[i].toPortfolio(start, end, currencyMap);

      if (result === undefined) {
        result = logPortfolio;
      } else {
        result.merge(logPortfolio);
      }
    }
  }

  result.toSheet(name);
  return result;
}
