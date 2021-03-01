/** TxLog abstracts a transaction log. */
function TxLog(sheet, reader, options = {hasPrices: false, hasAssets: true, isArchive: false}) {
  this.sheet = sheet;
  this.values = getSheetValues(this.sheet);
  this.reader = reader;
  this.reader.setId(this.idFromSheetName());
  this.reader.setValues(this.values);
  this.symbolMap = {};
  this.tagSet = {};
  this.options = options;

  this.readSymbolMetadata();
}

/** Return a map of symbols to known currencies in the 
 * transaction log.
 */
TxLog.prototype.currencyMap = function() {
  var result = {};
  var symbols = this.symbols();

  for (var i = 0; i < symbols.length; i++) {
    var symbol = symbols[i];

    if (this.symbolMap[symbol].currency !== undefined &&
        this.symbolMap[symbol].currency != "") {
      result[symbol] = this.symbolMap[symbol].currency;
    }
  }

  return result;
}

TxLog.prototype.currency = function(symbol) {
  return this.symbolMap[symbol].currency;
}

TxLog.prototype.type = function(symbol) {
  return this.symbolMap[symbol].type;
}

/** Return the list of unique symbols mentioned in the
 *  transaction log.
 */
TxLog.prototype.symbols = function() {
    return Object.keys(this.symbolMap);
}

TxLog.prototype.validateSymbolMetadata = function(metadata) {
  if (metadata.symbol === undefined || metadata.symbol === "") {
    throw new Error("Invalid metadata returned by log[" + this.sheet.getSheetName() + "]: missing symbol: " + JSON.stringify(metadata));
  }

  if (metadata.type === undefined || metadata.type === "") {
    throw new Error("Invalid metadata returned by log[" + this.sheet.getSheetName() + "]: missing type: " + JSON.stringify(metadata));
  }
}

TxLog.prototype.readSymbolMetadata = function() {
  for (var i = 0; i < this.values.length; i++) {
    // Read symbol metadata for the log
    var metadata = this.reader.symbolMetadata(this.values[i]);

    for (var j = 0; j < metadata.length; j++) {
      this.validateSymbolMetadata(metadata[j]);

      if (!(metadata[j].symbol in this.symbolMap)) {    
        this.symbolMap[metadata[j].symbol] = {
          accounts: []
        };
      }

      var symbol = this.symbolMap[metadata[j].symbol];
      symbol.symbol = metadata[j].symbol;

      if (symbol.accounts.indexOf(metadata[j].account) < 0) {
        symbol.accounts.push(metadata[j].account);
      }
      symbol.currency = metadata[j].currency;
      symbol.type = metadata[j].type;
    }

    // Read the tag set for the log
    var stdRows = this.reader.standardRow(this.values[i]);
    for (var j = 0; j < stdRows.length; j++) {
      var tags = stdRows[j].tags;

      for (var k = 0; k < tags.length; k++) {
        this.tagSet[tags[k]] = true;
      }
    }
  }
}

TxLog.prototype.validatePrice = function(price) {
  if (price.symbol === undefined || price.symbol === "") {
    throw new Error("Invalid price returned by log[" + this.sheet.getSheetName() + "]: missing symbol: " + JSON.stringify(price));
  }

  if (price.price === undefined || price.price === "") {
    throw new Error("Invalid amount returned by log[" + this.sheet.getSheetName() + "]: missing price: " + JSON.stringify(price));
  }

  if (price.date === undefined || isNaN(price.date)) {
    throw new Error("Invalid price returned by log[" + this.sheet.getSheetName() + "]: invalid date: " + JSON.stringify(price));
  }

  if (price.quoteCurrency === undefined || price.quoteCurrency === "") {
    throw new Error("Invalid price returned by log[" + this.sheet.getSheetName() + "]: missing quote currency: " + JSON.stringify(price));
  }
}

/** Generates SparsePrice timeseries price data based on the values
 *  in the transaction logs.
 * 
 *  Only appends prices from the transaction log if the currency agrees
 *  with the SparsePrice metadata.
 */
TxLog.prototype.appendPricesToSparsePrice = function(prices, symbols) {
  for (var i = 0; i < this.values.length; i++) {
    var rowPrices = this.reader.prices(this.values[i]);

    for (var j = 0; j < rowPrices.length; j++) {
      var symbolPrice = rowPrices[j];
      var key = prices.keyOf([symbolPrice.symbol]);
      var symbol = symbolPrice.symbol;
      this.validatePrice(symbolPrice);

      if (prices.hasKey(key) &&
          symbols.indexOf(symbol) >= 0 &&
          symbolPrice.quoteCurrency === prices.currency(symbol)) {
        prices.insertAtDate(key, symbolPrice.date, [symbolPrice.price]);
      }
    }
  }
}

/** Return whether this log contains any asset prices. */
TxLog.prototype.hasPrices = function() {
  return this.options.hasPrices;
}

/** Generate an account name from the supplied sheet name. */
TxLog.prototype.idFromSheetName = function() {
  return this.sheet.getSheetName().toUpperCase().replace(" ", "-").replace(/[^A-Z0-9-]/g, '');
}

/** Converts the transaction log into a Portfolio timeseries
 *  covering the period specified.
 */
TxLog.prototype.toPortfolio = function(start, end, currencyMap) {
  var result = new Portfolio(this.sheet.getSheetName(), start);

  this.initColumnGroups(result, currencyMap);
  this.appendValuesToPortfolio(result, start, end);

  return result;
}

/** Returns a standard format transaction log. */
TxLog.prototype.appendToStandardLog = function(log, extra, tags, filter) {
  for (var i = 0; i < this.values.length; i++) {
    var stdRows = this.reader.standardRow(this.values[i]);

    for (var j = 0; j < stdRows.length; j++) {
      if (filter.include(stdRows[j])) {
        var row = [
          stdRows[j].date,
          stdRows[j].description,
          stdRows[j].account,
          stdRows[j].symbol,
          stdRows[j].amount,
          stdRows[j].category
        ];

        for (var k = 0; k < extra.length; k++) {
          row.push(extra[k]);
        }

        var rowTags = stdRows[j].tags;
        for (var k = 0; k < tags.length; k++) {
          row.push(rowTags.indexOf(tags[k]) >= 0);
        }

        log.push(row);
      }
    }
  }
}

/** Generates column group metadata for the Portfolio based on
 *  the transaction log.
 */
TxLog.prototype.initColumnGroups = function(portfolio, currencyMap) {
  var symbols = this.symbols();

  for (var i = 0; i < symbols.length; i++) {
    var metadata = this.symbolMap[symbols[i]];

    for (var j = 0; j < metadata.accounts.length; j++) {    
      portfolio.addAssetColumn(
         metadata.accounts[j], metadata.symbol, metadata.type, currencyMap[metadata.symbol]);
    }
  }
}

TxLog.prototype.validateAmount = function(amount) {
  if (amount.symbol === undefined || amount.symbol === "") {
    throw new Error("Invalid amount returned by log[" + this.sheet.getSheetName() + "]: missing symbol: " + JSON.stringify(amount));
  }

  if (amount.account === undefined || amount.account === "") {
    throw new Error("Invalid amount returned by log[" + this.sheet.getSheetName() + "]: missing account: " + JSON.stringify(amount));
  }

  if (amount.amount === undefined || amount.amount === "") {
    throw new Error("Invalid amount returned by log[" + this.sheet.getSheetName() + "]: missing amount: " + JSON.stringify(amount));
  }
}

/** Generates the values of the Portfolio based on the 
 *  transaction log.
 */
TxLog.prototype.appendValuesToPortfolio = function(portfolio, startDate, endDate) {
  var keys = portfolio.keys();
  
  // Position within the transaction log
  var tx_row = 0;
  
  // Initialize running counters
  var quantities = {};
  for (var i = 0; i < keys.length; i++) {
    quantities[keys[i]] = 0;
  }

  if (this.values.length == 0) {
    return;
  }
  
  // For each day in the range
  var start = new Date(startDate);
  var end = new Date(endDate);
  var tx_start = new Date(startDate);
  var tx_date = this.reader.date(this.values[0]);
    
  if (tx_date.getTime() < start.getTime()) {
    tx_start = tx_date;
  }
  
  for (var d = new Date(tx_start); d < end; d.setDate(d.getDate() + 1)) {
    var row = [];

    // Seek start of tx data for the current day, if it exists
    for (; tx_row < this.values.length && this.reader.date(this.values[tx_row]).getTime() < d.getTime();) {
      tx_row++;
    }
    
    // Iterate over transactions for the day
    for (; tx_row < this.values.length && this.reader.date(this.values[tx_row]).getTime() == d.getTime();) {
      var vrow = this.values[tx_row];
      var amounts = this.reader.amounts(vrow);

      for (var i = 0; i < amounts.length; i++) {
        var amount = amounts[i];
        var key = portfolio.keyOf([amount.account, amount.symbol]);
        this.validateAmount(amount);

        if (amount.isDelta) {
          quantities[key] += amount.amount;
        } else {
          quantities[key] = amount.amount;
        }
      }
      
      tx_row++;
    }
    
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      row.push(quantities[key]);
    }
    
    if (d >= start && d < end) {
      portfolio.values.push(row);
    }
  }
}

/** Row API access data about a single row of the transaction log.
 */
function TxReader(dateColumn) {
  this.values = [];
  this.id = "";
  this.dateColumn = dateColumn;
}

TxReader.prototype.setValues = function(values) {
  this.values = values;
  this.parseDateColumn();
  return this;
}

TxReader.prototype.setId = function(id) {
  this.id = id;
  return this;
}

TxReader.prototype.parseDateColumn = function() {
  var previous;
  
  for (var i = 0; i < this.values.length; i++) {
    this.setDate(this.values[i], new Date(this.date(this.values[i])));
    
    if (previous !== undefined && previous.getTime() > this.date(this.values[i]).getTime()) {
      throw new Error("dates in transaction log are not ordered: " + this.id);
    }
    
    previous = this.date(this.values[i]);
  }
}

/** Return the currency map. */
TxReader.prototype.getCurrencyMap = function() {
  return this.currencyMap;
}

/** Return the date for the specified row of the log. */
TxReader.prototype.date = function(row) {
  var result = new Date(row[this.dateColumn]);

  if (isNaN(result)) {
    throw new Error("Invalid date in log[" + this.id + "]: " + result);
  }

  return result;
}

/** Set the date for the specified row of the transaction log.
 */
TxReader.prototype.setDate = function(row, date) {
  row[this.dateColumn] = date;
}

/** Return the accounts and symbols affected by the specified row of the
 *  transaction log.  Optionally includes the currency of the symbol if it
 *  can be determined.
 *  Returns a list of the form:
 *  [
 *    { symbol: <symbol>, account: <account name>, currency: <currency>, type: <type> },
 *    ...
 *  ]
 */
TxReader.prototype.symbolMetadata = function(row) {
  throw new Error("Unimplemented: function should be provided by subclasses.");
}

/** Return the list of amounts, or changes in amount, for the specified row of
 *  the transaction log.
 *  Returns a list of the form:
 *  [
 *    { symbol: <symbol>, account: <account name>, amount: <amount>, isDelta: <delta> },
 *    ...
 *  ]
 */
TxReader.prototype.amounts = function(row) {
  throw new Error("Unimplemented: function should be provided by subclasses.");
}

/** Return the list of prices for the specified row of the transaction log.
 *  Returns a list of the form:
 *  [
 *    { symbol: <symbol>, price: <amount>, date: <date>, quoteCurrency: <currency> },
 *    ...
 *  ]
 */
TxReader.prototype.prices = function(row) {
  return [];
}

/** Return the list of standardized tx log rows which represent the specified row.
 *  Returns a list of the form:
 *  [
 *    {  date: <date>, description: <description>, account: <account>, symbol: <symbol>, amount: <amount>, category: <category>, tags: [<tag>, <tag>, ...] },
 *    ...
 *  ]
 */
TxReader.prototype.standardRow = function(row) {
  return [];
}

/** ArchiveReader reads the transaction log used to store archived
 *  asset prices.
 */
function ArchiveReader() {
  this.columns = {
    date: 0,
    price: 1,
    symbol: 2,
    currency: 3
  };

  TxReader.call(this, this.columns.date);
}

ArchiveReader.prototype = Object.create(TxReader.prototype);

Object.defineProperty(ArchiveReader.prototype, 'constructor', { 
    value: ArchiveReader, 
    enumerable: false,
    writable: true });

/** Each row of the archive log represents exactly one symbol. */
ArchiveReader.prototype.symbolMetadata = function(row) {
  return [
    {
      account: "PRICE-ARCHIVE",
      symbol: row[this.columns.symbol],
      currency: row[this.columns.currency],
      type: "ASSET"
    }
  ];
}

/** Archive logs cannot affect asset amounts. */
ArchiveReader.prototype.amounts = function(row) {
  return [];
}

/** Return the list of prices for the specified row of the transaction log.
 *  Returns a list of the form:
 *  [
 *    { symbol: <symbol>, price: <amount>, date: <date>, quoteCurrency: <currency> },
 *    ...
 *  ]
 */
ArchiveReader.prototype.prices = function(row) {
  return [
    {
      symbol: row[this.columns.symbol],
      price: row[this.columns.price],
      date: row[this.columns.date],
      quoteCurrency: row[this.columns.currency]
    }
  ];
}

/** Filters standard log lines which are a negative change in value. */
function ExpensesFilter() {}

ExpensesFilter.prototype.include = function(row) {
  return row.amount < 0;
}
