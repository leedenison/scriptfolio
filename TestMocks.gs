var colTestLog = {
  date: 0,
  action: 1,
  symbol: 2,
  quantity: 3,
  amount: 4
};

function DummySheet(values) {
  this.values = values;
}

DummySheet.prototype.getSheetName = function() {
  return "Dummy Sheet";
}

DummySheet.prototype.getRange = function() {
  return this;
}

DummySheet.prototype.getValues = function() {
  return this.values;
}

DummySheet.prototype.getLastRow = function() {
  return this.values.length;
}

DummySheet.prototype.getLastColumn = function() {
  if (this.values.length > 0) {
    return this.values[0].length;
  } else {
    return 0;
  }
}

DummySheet.prototype.getFrozenRows = function() {
  return 0;
}

DummySheet.prototype.getFrozenColumns = function() {
  return 0;
}

function TestReader() {
  TxReader.call(this, colTestLog.date);
}

TestReader.prototype = Object.create(TxReader.prototype);

Object.defineProperty(TestReader.prototype, 'constructor', { 
    value: TestReader, 
    enumerable: false,
    writable: true });

TestReader.prototype.symbolMetadata = function(row) {
  var s = row[colTestLog.symbol];
  var result = [
    { 
      account: this.id,
      symbol: "CASH", 
      currency: "GBP",
      type: "CURRENCY"
    }
  ];

  if (s != "CASH") {
    result.push(
      { 
        account: this.id,
        symbol: s,
        currency: "GBP",
        type: "ASSET"
      }
    );
  }

  return result;
}

TestReader.prototype.amounts = function(row) {
  var result = [];
  var symbol = row[colTestLog.symbol];
  var amount = 0;

  if (symbol != "CASH") {
    amount = row[colTestLog.quantity];
    
    var update = {
        account: this.id,
        symbol: symbol
    };

    if (row[colTestLog.action] == "Initialise") {
      update.isDelta = false;
      update.amount = amount;
    } else {
      update.isDelta = true;
      update.amount = amount;
    }

    result.push(update);
  } 
  
  amount = row[colTestLog.amount];

  var update = {
      account: this.id,
      symbol: "CASH"
  };

  if (row[colTestLog.action] == "Initialise") {
    if (symbol == "CASH") {
      update.isDelta = false;
      update.amount = amount;
      result.push(update);
    }
  } else {
    update.isDelta = true;
    update.amount = amount;
    result.push(update);
  }

  return result;
}

function TestStatusReporter() {}

TestStatusReporter.prototype.clear = function() {}

TestStatusReporter.prototype.setStatus = function() {}
