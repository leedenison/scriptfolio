/** A Timeseries is a data structure which can be serialized to,
 *  and deserialized from, a spreadsheet.  It assumes data is organized
 *  into groups of columns; with metadata about each group of columns stored
 *  in header rows at the top of the first column in the group.
 *  
 *  Rows represent the actual timeseries data with the date stored as the
 *  first column in each row.
 * 
 *  Timeseries data is assumed to be non-sparse, ie. a value exists for every
 *  column group for every time interval.  Timeseries currently only support 
 *  intervals of 1 day.
 * 
 *  Metadata rows are assumed to be in the order:
 *    <Column Group Type>
 *    <Metadata 1>
 *    <Metadata 2>
 *    ...
 *    <Key Part 1>
 *    <Key Part 2>
 *    ...
 */

/** Construct a new Timeseries.
 * 
 *  sheet: The name of the sheet that the Timeseries serializes from / to.
 *  metadata: Spec describing the metadata rows stored at the top of each
 *    group of columns in the form { <FIELD_NAME>: <ROW NUMBER>, ... }.
 *  keyspec: Spec describing the key matadata stored at the top of each
 *    group of columns in the form { <KEY_FIELD_NAME>: <ROW NUMBER>, ...}.
 *    The compound key for each column group must be unique in the sheet.
 *  typespec: Spec describing the types of the column groups used in the
 *    Timeseries of the form:
 *      {
 *        <TYPE_NAME>: {
 *          stride: <column group width>,
 *          <COLUMN_NAME>: <column offset>,
 *        },
 *        ...
 *      }
 *  start: start indicates the date corresponding to the first
 *    row of data.
 */

var TYPE_ROW = 0;
var DEFAULT_HEADERS_LENGTH = 1;

function Timeseries(sheet, metadata, keyspec, typespec, start) {
  this.sheet = sheet;
  this.metadata = metadata;
  this.keyspec = keyspec;
  this.typespec = typespec;
  this.startDate = start;
  this.columns = {};
  this.values = [];
  this.sheetColumnMap = {};
  this.serializedLen = 0;

  if (this.startDate !== undefined) {
    this.startDate.setHours(0,0,0,0);  
  }
}

/** Deserialize the specified sheet into a Timeseries object. */
Timeseries.prototype.fromSheet = function(name, metadata, keyspec, typespec) {
  var active_app = SpreadsheetApp.getActiveSpreadsheet();
  
  var sheet = active_app.getSheetByName(name);
  if (sheet == null) {
    throw new Error("Uknown sheet: " + name);
  }

  Timeseries.call(this, sheet, metadata, keyspec, typespec);

  var read = this.readHeadersAndValues(sheet);
  this.startDate = this.startDateFromValues(read.values);
  this.serializedLen = read.rows;
  this.columnGroupsFromHeaders(read.headers);
  this.setValues(read.values);
  return this;
}

/** Deserialize the metadata from the specified sheet into a Timeseries object. */
Timeseries.prototype.metadataFromSheet = function(name, metadata, keyspec, typespec) {
  var active_app = SpreadsheetApp.getActiveSpreadsheet();
  
  var sheet = active_app.getSheetByName(name);
  if (sheet == null) {
    throw new Error("Uknown sheet: " + name);
  }

  Timeseries.call(this, sheet, metadata, keyspec, typespec);

  var read = this.readHeaders(sheet);
  this.startDate = this.startDateFromValues(this.readDateValues(sheet, read.columns));
  this.serializedLen = read.rows;
  this.columnGroupsFromHeaders(read.headers);
  return this;
}

Timeseries.prototype.readHeaders = function(sheet) {
  var lastColumn = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();
  var headers = [];
  var rows = 0;

  for (var i = 0; i < this.headersLen(); i++) {
    headers.push([]);
  }

  if (lastColumn > 0) {
    rows = lastRow - this.headersLen();
    headers = sheet.getRange(1, 1, this.headersLen(), lastColumn).getValues();
  }

  return {headers: headers, rows: rows, columns: lastColumn};
}

Timeseries.prototype.readHeadersAndValues = function (sheet) {
    var read = this.readHeaders(sheet);

    if (read.rows > 0) {
      read.values = sheet.getRange(this.headersLen() + 1, 1, read.rows, read.columns).getValues();
    } else {
      read.values = [];
    }

    return read;
}

Timeseries.prototype.readDateValues = function(sheet, columns) {
  return sheet.getRange(this.headersLen() + 1, 1, 1, 1).getValues();
}

Timeseries.prototype.fromHeadersAndValues = function(headers, values) {
  this.startDate = this.startDateFromValues(values);
  this.serializedLen = values.length;
  this.columnGroupsFromHeaders(headers);
  this.setValues(values);
  return this;
}

Timeseries.prototype.setValues = function(values) {
  var trimmed = [];
  for (var i = 0; i < values.length; i++) {
    var row = [];
    for (var j = 1; j < values[i].length; j++) {
      row.push(values[i][j]);
    }
    trimmed.push(row);
  }   
  this.values = trimmed;
}

/** Returns all of the column group keys defined in the Timeseries. */
Timeseries.prototype.keys = function() {
  return Object.keys(this.columns);
}

Timeseries.prototype.start = function() {
  return new Date(this.startDate);
}

Timeseries.prototype.setStart = function(start) {
  this.startDate = new Date(start);
  this.startDate.setHours(0,0,0,0);
}

Timeseries.prototype.end = function() {
  if (this.startDate !== undefined) {
    var end = new Date(this.startDate);
    end.setDate(end.getDate() + this.values.length);
    return end;
  } else {
    return undefined;
  }
}

/** Returns the width in columns of the Timeseries.
 *  Ignores the date column.
 */
Timeseries.prototype.width = function() {
  // Ignore the date column
  var result = 0;
  
  var keys = this.keys();
  for (var i = 0; i < keys.length; i++) {
    var type = this.type(keys[i]);
    result += this.stride(type);
  }
  
  return result;
}

/** Returns the serialized offset for the column groups. */
Timeseries.prototype.serializedColumnOffset = function() {
  return 1;
}

/** Adds a column group to this Timeseries. */
Timeseries.prototype.addColumnGroup = function(key, type, metadata) {  
  var idx = this.width();
  
  this.columns[key] = {
    type: type,
    metadata: metadata,
    column: idx
  };

  this.initColumnValues(this.columnWidth(key));
}

/** Merges a column group into this Timeseries. */
Timeseries.prototype.copyColumnGroup = function(key, c) {
  var metadata = {};
  var mIds = Object.keys(c.metadata);
  for (var i = 0; i < mIds.length; i++) {
    metadata[mIds[i]] = c.metadata[mIds[i]];
  }

  this.addColumnGroup(key, c.type, metadata);
}

/** Adds the specified number of columns to the values of this 
 *  Timeseries. 
 */
Timeseries.prototype.initColumnValues = function(width) {  
  if (this.values.length > 0) {
    for (var i = 0; i < this.values.length; i++) {
      for (var j = 0; j < width; j++) {
        this.values[i].push("");
      }
    }
  }
}

/** Generates a compound key for the specified key parts.
 *  Assumes the supplied key parts are ordered according to the row
 *  order in keyspec.
 */
Timeseries.prototype.keyOf = function(parts) {
  return parts.join("_");
}

/** Returns the key part for kId for the column group corresponding to
 *  key.
 */
Timeseries.prototype.getKeyPart = function(key, kId) {
  if (!(key in this.columns)) {
    throw new Error("failed to retrieve key part["+kId+"] for unknown column group: " + key);
  }
  
  var parts = key.split("_");
  var kIdx = this.keyspec[kId];
  
  if (kIdx === undefined) {
    throw new Error("failed to retrieve key part["+kId+"]: unknown key part: key["+key+"]");
  }
  
  if (kIdx >= parts.length) {
    throw new Error("failed to retrieve key part["+kId+"] for malformed key: " + key);
  }
  
  return parts[kIdx];
}

/** Returns true if a column group exists with the specified key, false otherwise. */
Timeseries.prototype.hasKey = function(...parts) {
  return this.keyOf(parts) in this.columns;
}

/** Returns the index of the column group with the specified key. */
Timeseries.prototype.indexOfKey = function(...parts) {
  return Object.keys(this.columns).indexOf(this.keyOf(parts));
}

/** Returns the type metadata for the column group corresponding to key. */
Timeseries.prototype.type = function(key) {
  if (!(key in this.columns)) {
    throw new Error("failed to retrieve type for unknown column group: " + key);
  }
  return this.columns[key].type;
}

/** Returns the metadata for mId for the column group corresponding to
 *  key.
 */
Timeseries.prototype.getMetadata = function(key, mId) {
  if (!(key in this.columns)) {
    throw new Error("failed to retrieve metadata["+mId+"] for unknown column group: " + key);
  }
  return this.columns[key].metadata[mId];
}

/** Returns a map of the key for each column group to the specified 
 *  metadata.
 */
Timeseries.prototype.metadataMap = function(mId) {
  var result = {};
  var keys = this.keys();

  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    result[key] = this.getMetadata(key, mId);
  }

  return result;
}

/** Returns the number of rows in the Timeseries. */
Timeseries.prototype.length = function() {
  return this.values.length;
}

/** Returns the serialized length of the Timeseries,
 *  as determined when the Timeseries was most recently
 *  read or written.
 */
Timeseries.prototype.serializedLength = function() {
  return this.serializedLen;
}

/** Returns the number of rows in the Timeseries headers. */
Timeseries.prototype.headersLen = function() {
  return DEFAULT_HEADERS_LENGTH + Object.keys(this.metadata).length + Object.keys(this.keyspec).length;
}

/** Returns the width of a column group. */
Timeseries.prototype.columnWidth = function(key) {
  return this.stride(this.type(key));
}

/** Returns the stride size of the column group. */
Timeseries.prototype.stride = function(type) {
  return this.validType(type).stride;
}

/** Returns the typespec data for type if it is a valid type.
 *  Otherwise an error is thrown.
 */
Timeseries.prototype.validType = function(type) {
  if (!(type in this.typespec)) {
    throw new Error("Invalid type: " + type);
  }
  
  return this.typespec[type];
}

/** Returns the column index for the specified column within the column group
 *  corresponding to key.
 *
 *  Note: Column group index ignores the initial date column when serialized.
 *    Add one to account for the date column, if using this to calculate the
 *    column index for the sheet.
 */
Timeseries.prototype.column = function(key, column) {
  if (!(key in this.columns)) {
    throw new Error("failed to retrieve column index for unknown column group: " + key);
  }
  
  var type = this.columns[key].type;
  var result = this.columns[key].column;

  if (column !== undefined) {
    result += this.validType(type)[column];
  }
  
  return result;
}

/** Returns the data for the specified row, column group and column. */
Timeseries.prototype.get = function(row, key, column) {
  if (this.values[row] == "undefined") {
    throw new Error("failed to retrieve data for undefined row: " + row);
  }
  return this.values[row][this.column(key, column)];
}

/** Returns the row date for the specified row. */
Timeseries.prototype.getRowDate = function(row) {  
  var result = new Date(this.start());
  result.setDate(result.getDate() + row);

  return result;
}

/** Returns the sheet column identifier for the specified column. 
 *  Assumes the specified column is zero based.
 */
Timeseries.prototype.sheetColumn = function(key, column) { 
  var sheetCol = this.column(key, column) + 1;
  return this.sheetColumnOrdinal(sheetCol);
}

/** Returns a map of key to sheet and column identifier. */
Timeseries.prototype.getSheetColumnMap = function() {
  if (Object.keys(this.sheetColumnMap).length == 0) {
    var keys = this.keys();
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var type = this.type(key);
      var typeColumns = Object.keys(this.validType(type));
      var typeColumnMap = {};

      for (var j = 0; j < typeColumns.length; j++) {
        typeColumnMap[typeColumns[j]] = "'" + this.sheet.getSheetName() + "'!" + this.sheetColumn(key, typeColumns[j]);
      }

      this.sheetColumnMap[key] = typeColumnMap;
    }
  }

  return this.sheetColumnMap;
}

/** Returns the sheet column identifier for the specified column ordinal. */
Timeseries.prototype.sheetColumnOrdinal = function(ord) {  
  var first = Math.floor(ord / 26);
  var second = ord % 26;
  var result = "";
  
  if (first > 0) {
    result = result + String.fromCharCode(64 + first);
  }
  
  result = result + String.fromCharCode(65 + second);
  
  return result;
}

/** Checks that the supplied Timeseries contains the same column keys
 *  as this Timeseries and that the column indices match.
 */
Timeseries.prototype.validateColumnEqual = function (ts) {
  var keysA = this.keys();
  var keysB = ts.keys();
  if (keysA.length != keysB.length) {
    throw new Error("Timeseries contain a different number of columns");
  }

  for (var i = 0; i < keysA.length; i++) {
    var keyA = keysA[i];

    if (!ts.hasKey(keyA)) {
      throw new Error("Timeseries does not contain key: " + keyA);
    }

    if (ts.column(keyA) != this.column(keyA)) {
      throw new Error("Column indices differ for key: " + keyA);
    }
  }
}

/** Validate that the supplied Timeseries covers a time period
 *  that begins the day after the current Timeseries period ends.
 */
Timeseries.prototype.validateAdjacent = function(ts) {
    var appendDate = this.end();

    if (ts.start().getTime() != appendDate.getTime()) {
      throw new Error("Timeseries time period is not adjacent");
    }
}

/** Merges the supplied Timeseries into the current one.
 *  Assumes all supplied Timeseries use common metadata, keyspec and typespec.
 */
Timeseries.prototype.merge = function(...cs) {
  for (var i = 0; i < cs.length; i++) {
    if (this.length() == 0) {
      // Merging into an empty timeseries
      this.startDate = new Date(cs[i].start());
      for (var j = 0; j < cs[i].length(); j++) {
        this.values.push([]);
      }
    } else {
      // Merging into an existing timeseries
      if (cs[i].startDate.getTime() != this.startDate.getTime()) {
        throw new Error("failed to merge Timeseries with different start dates.");
      }
      
      if (cs[i].values.length != this.values.length) {
        throw new Error("failed to merge Timeseries with different end dates: " + cs[i].values.length + ", " + this.values.length);
      }
    }
    
    var keys = cs[i].keys();
    for (var j = 0; j < keys.length; j++) {
      var key = keys[j];
      
      if (!(key in this.columns)) {
        this.copyColumnGroup(key, cs[i].columns[key]);
      }
    }
    
    var mergedKeys = cs[i].keys();
    for (var j = 0; j < mergedKeys.length; j++) {
      for (var k = 0; k < this.values.length; k++) {
        var key = mergedKeys[j];
        var stride = this.columnWidth(key);
        var dest = this.column(key);
        var src = cs[i].column(key);

        for (var l = 0; l < stride; l++) {
          this.values[k][dest + l] = cs[i].values[k][src + l];
        }
      }
    }   
  }
}

/** Appends the values of a Timeseries to the current one.
 *  Assumes all supplied Timeseries use common metadata, keyspec and typespec.
 *  Assumes that the date range of the supplied timeseries are adjacent to the
 *  this Timeseries and that they are provided in date range order.
 */
Timeseries.prototype.append = function(...ts) {
  for (var i = 0; i < ts.length; i++) {
    this.validateColumnEqual(ts[i]);
    this.validateAdjacent(ts[i]);

    for (var j = 0; j < ts[i].values.length; j++) {
      var row = [];

      for (var k = 0; k < ts[i].values[j].length; k++) {
        row.push(ts[i].values[j][k]);
      }

      this.values.push(row);
    }
  }
}

/** Compares to dates and returns -1 if the first supplied date is less than the
 *  second supplied date, 0 if they are equal or 1 if the first is greater.
 *
 *  For the purposes of comparison, empty string is considered greater than any
 *  date.
 */
Timeseries.prototype.compareDates = function(first, second) {
  if (first == "" && second == "") {
    return 0;
  } else if (first == "") {
    return 1;
  } else if (second == "") {
    return -1;
  } else if (!(first instanceof Date)) {
    throw new Error("First operand is not a date: " + first);
  } else if (!(second instanceof Date)) {
    throw new Error("Second operand is not a date: " + second);
  } else {
    return (first.getTime()>second.getTime())-(first.getTime()<second.getTime());
  }
}

/** Appends an empty row to the values for this Timeseries. */
Timeseries.prototype.appendEmptyRow = function() {
  var row = [];

  for (var i = 0; i < this.width(); i++) {
    row.push("");
  }
  
  this.values.push(row);
}

/** Inserts the supplied values for the specified column group at the specified row. 
 */
Timeseries.prototype.insertAtRow = function(key, row, values) {
  if (this.length() <= row) {
    throw new Error("failed to insert at row ["+row+"]: length is: "+this.length());
  }
  
  var column = this.column(key);
  
  for (var i = 0; i < values.length; i++) {
    this.values[row][column + i] = values[i];
  }
}

/** Materialize dates into a single column two dimensional array. */
Timeseries.prototype.getDateRange = function() {
  var result = [];
  
  for (var i = 0; i < this.values.length; i++) {
    var d = new Date(this.startDate)
    d.setDate(d.getDate() + i);
    result.push([d]);
  }
  
  return result;
}

/** Serializes the Timeseries to a specified sheet. */
Timeseries.prototype.toSheet = function(name) {
  var sheet = this.sheet;

  if (name !== undefined) {
    var active_app = SpreadsheetApp.getActiveSpreadsheet();
    sheet = active_app.getSheetByName(name);
    this.sheet = sheet;
  }

  sheet.clear();

  var d = this.getDateRange();

  var headers = this.writeHeaders();
  if (headers.length == 0 || headers[0].length == 0) {
    throw new Error("failed to serialize Timeseries["+this.sheet+"]: no headers were generated");
  }
  
  sheet.getRange(1, 1, headers.length, headers[0].length).setValues(headers);

  if (this.values.length > 0 && this.values[0].length > 0) {
    sheet.getRange(headers.length + 1, 1, d.length, 1).setValues(d);
    sheet.getRange(headers.length + 1, 2 /* Date offset */, this.values.length, this.values[0].length).setValues(this.values);
  }

  this.serializedLen = this.values.length;  
}

/** Serializes headers to a two dimensional array. */
Timeseries.prototype.writeHeaders = function() { 
  var result = this.writeColumnGroupHeaders();
  var headersLen =  this.headersLen(); 

  for (var i = 0; i < headersLen; i++) {
    if (i == headersLen - 1) {
      result[i].unshift("Date");
    } else {
      result[i].unshift("");
    }
  }

  return result;
}

/** Serializes headers to a two dimensional array. */
Timeseries.prototype.writeColumnGroupHeaders = function() {  
  var result = [];
  
  var metadataRows = Object.keys(this.metadata);
  var keyRows = Object.keys(this.keyspec);
  var headersLen =  this.headersLen(); 
  for (var i = 0; i < headersLen; i++) {
    result.push([]);
  }

  var keys = this.keys();
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var type = this.type(key);
    
    // Write the column group type row
    result[0].push(type);
    
    // Add any padding columns needed by the column group type
    for (var j = 0; j < this.columnWidth(key) - 1; j++) {
      result[0].push("");
    }
  }
    
  // Write all the metadata rows
  for (var i = 0; i < metadataRows.length; i++) {
    var mId = metadataRows[i];
    var row = this.metadata[mId] + 1;
    
    for (var j = 0; j < keys.length; j++) {
      var key = keys[j];
      var type = this.type(key);
      result[row].push(this.getMetadata(key, mId));
      
      // Add any padding columns needed by the column group type
      for (var k = 0; k < this.columnWidth(key) - 1; k++) {
        result[row].push("");
      }
    }
  }
    
  // Write all the key part rows
  for (var i = 0; i < keyRows.length; i++) {
    var kId = keyRows[i];
    var row = this.keyspec[kId] + metadataRows.length + 1;
    
    for (var j = 0; j < keys.length; j++) {
      var key = keys[j];
      var type = this.type(key);
      result[row].push(this.getKeyPart(key, kId));
            
      // Add any padding columns needed by the column group type
      for (var k = 0; k < this.columnWidth(key) - 1; k++) {
        result[row].push("");
      }
    }
  }
  
  return result;
}
 
/** Deserialize the column group data from the supplied headers. */
Timeseries.prototype.columnGroupsFromHeaders = function(headers) {
  this.columns = {};
  
  var metadataKeys = Object.keys(this.metadata);
  var keyParts = Object.keys(this.keyspec);
  if (headers.length < metadataKeys.length + keyParts.length + DEFAULT_HEADERS_LENGTH) {
    throw new Error("Too few header rows["+headers.length+"] for the specified metadata and keys.");
  }

  for (var i = this.serializedColumnOffset(); i < headers[TYPE_ROW].length;) {
    var column = {};
    var valuesIdx = i - this.serializedColumnOffset();
    
    if (headers[TYPE_ROW][i] == "") {
      i++;
      continue;
    }
    
    column.type = headers[TYPE_ROW][i];
    column.column = valuesIdx;
    column.metadata = {};
   
    for (var j = 0; j < metadataKeys.length; j++) {
      var metadataKey = metadataKeys[j];
      var metadataRow = this.metadata[metadataKey] + 1;
      column.metadata[metadataKey] = headers[metadataRow][i];
    }
    
    var compositeKey = [];
    for (var j = 0; j < keyParts.length; j++) {
      var keyPart = keyParts[j];
      var keyPartRow = this.keyspec[keyPart] + metadataKeys.length + DEFAULT_HEADERS_LENGTH;
      compositeKey.push(headers[keyPartRow][i]);
    }
    var key = this.keyOf(compositeKey);
    this.columns[key] = column;
    
    i = i + this.columnWidth(key);
  }
}

/** Find the first date in a set of values. 
 *  Assumes rows are in date order.
 */
Timeseries.prototype.startDateFromValues = function(values) {
  var result;
  
  if (values.length > 0 && values[0].length > 0) {
    result = new Date(values[0][0]);
  }

  return result;
}

