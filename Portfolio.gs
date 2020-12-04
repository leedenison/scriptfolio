var METADATA = {
  currency: 0
};

var KEYSPEC = {
  account: 0,
  symbol: 1
};

var TYPES = {
  CURRENCY: {
    stride: 1,
    amount: 0
  },
  UNITARY_ASSET: {
    stride: 1,
    amount: 0
  },
  ASSET: { 
    stride: 2,
    price: 0,
    amount: 1
  },
  PRICE: { 
    stride: 1,
    price: 0
  },
  FX: {
    stride: 1,
    price: 0
  }
};

function excludeAccounts(accounts) {
  return {
    accounts: accounts,
    excluded: function(c, row, key) {
      return accounts.indexOf(c.account(key)) >= 0;
    }
  };
}

function sumAtoms(...fs) {
  var result = "";
  var count = 0;
  
  for (var i = 0; i < fs.length; i++) {
    if (fs[i].length > 0) {
      if (count == 0) {
        result = result + "=";
      } else {
        result = result + "+";
      }
      
      result = result + fs[i].join("+");
      count++;
    }
  }
  
  if (result == "") {
    result = "=0";
  }
  
  return result;
}

function Portfolio(sheet, datespec, start_date) {
  Timeseries.call(this, sheet, METADATA, KEYSPEC, datespec, TYPES, {}, [], start_date);
}

Portfolio.prototype = Object.create(Timeseries.prototype);

Object.defineProperty(Portfolio.prototype, 'constructor', { 
    value: Portfolio, 
    enumerable: false,
    writable: true });

Portfolio.prototype.fromSheet = function(sheet, datespec = "ROW") {
  return Timeseries.prototype.fromSheet.call(this, sheet, METADATA, KEYSPEC, datespec, TYPES); 
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

Portfolio.prototype.addColumnGroup = function(account, symbol, type, currency, idx) {
  Timeseries.prototype.addColumnGroup.call(this, this.keyOf([account, symbol]), type, { currency: currency }, idx);
}

Portfolio.prototype.filterGBPValue = function(row, account, type, currency, fx, filter) {
  var formula = [];
  var keys = this.keys();
  
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    
    if (account != "" && account != this.account(key)) {
      continue;
    }
    
    if (type != "" && type != this.type(key)) {
      continue;
    }
    
    if (currency != "" && currency != this.currency(key)) {
      continue;
    }
    
    if (filter !== undefined && filter.excluded(this, row, key)) {
      continue;
    }
    
    var f = "'" + this.sheet + "'!" + this.sheetColumn(key, "amount") + (row + this.headersLen() + 1);
    
    if (this.type(key) == "ASSET") {
      f += "*'" + this.sheet + "'!" + this.sheetColumn(key, "price") + (row + this.headersLen() + 1);
    }
    
    f += fx.convertToGBP(this.currency(key), row);
    formula.push(f);
  }
  
  return formula;
}

Portfolio.prototype.filterLiveGBPValue = function(row, account, type, currency, prices, fx, filter) {
  var formula = [];
  var keys = this.keys();
  
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    
    if (account != "" && account != this.account(key)) {
      continue;
    }
    
    if (type != "" && type != this.type(key)) {
      continue;
    }
    
    if (currency != "" && currency != this.currency(key)) {
      continue;
    }
    
    if (filter !== undefined && filter.excluded(this, row, key)) {
      continue;
    }
    
    var f = "'" + this.sheet + "'!" + this.sheetColumn(key, "amount") + (row + this.headersLen() + 1);
    
    if (this.type(key) == "ASSET") {
      var price_key = prices.keyOf(["NONE", this.symbol(key)]);
      f += "*'" + prices.sheet + "'!" + prices.sheetColumn(price_key, "price") + (prices.headersLen() + 1);
    }
    
    f += fx.convertToLiveGBP(this.currency(key));
    formula.push(f);
  }
  
  return formula;
}


Portfolio.prototype.convertToGBP = function(currency, row) {
  if (currency == "GBP") {
    return "";
  } else if (currency == "USD") {
    var usdgbp_key = this.keyOf(["HISTORIC", "CURRENCY:"+currency+"GBP"]);
    return "*'" + this.sheet + "'!" + this.sheetColumn(usdgbp_key, "price") + (row + this.headersLen() + 1);
  } else if (currency == "GBX") {
    return "*0.01";
  }
}

Portfolio.prototype.convertToLiveGBP = function(currency) {
  if (currency == "GBP") {
    return "";
  } else if (currency == "USD") {
    var usdgbp_key = this.keyOf(["LIVE", "CURRENCY:"+currency+"GBP"]);
    return "*'" + this.sheet + "'!" + this.sheetColumn(usdgbp_key, "price") + (this.headersLen() + 1);
  } else if (currency == "GBX") {
    return "*0.01";
  }
}
