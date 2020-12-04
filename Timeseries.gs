/** A Timeseries is a data structure which can be serialized to,
 *  and deserialized from, a spreadsheet.  It assumes data is organized
 *  into groups of columns; with metadata about each group of columns stored
 *  in header rows at the top of the first column in the group.
 *  
 *  Rows represent the actual timeseries data with the date stored as the
 *  first column in each row (when using "ROW" format).
 * 
 *  Timeseries can also use "COLUMN" date spec which stores a separate date
 *  with each group of columns.  This is useful for sparse data when column
 *  group does not have data for every date in the range.
 *
 *  Timeseries currently only support intervals of 1 day.
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

/** Construct a new timeseries.
 * 
 *  sheet: The name of the sheet that the Timeseries serializes from / to.
 *  metadata: Spec describing the metadata rows stored at the top of each
 *    group of columns in the form { <FIELD_NAME>: <ROW NUMBER>, ... }.
 *  keyspec: Spec describing the key matadata stored at the top of each
 *    group of columns in the form { <KEY_FIELD_NAME>: <ROW NUMBER>, ...}.
 *    The compound key for each column group must be unique in the sheet.
 *  datespec: Spec describing how dates are represented in the sheet. 
 *    Either "ROW" indicating that a single date is stored for each row,
 *    or "COLUMN" indicating that a date column is stored along with each
 *    group of columns.
 *  typespec: Spec describing the types of the column groups used in the
 *    Timeseries of the form:
 *      {
 *        <TYPE_NAME>: {
 *          stride: <column group width>,
 *          <COLUMN_NAME>: <column offset>,
 *        },
 *        ...
 *      }
 *  columns: Data for each column group in the form:
 *      {
 *        <KEY_VALUE>: {
 *          metadata: { <FIELD_NAME>: <FIELD_VALUE>, ... },
 *          type: <column group type>,
 *          column: <zero based column group index>,
 *        },
 *        ...
 *      }
 *  values: Data stored in the Timeseries.
 *  start_date: start_date indicates the date corresponding to the first
 *    row of data.
 */

var TYPE_ROW = 0;
var DEFAULT_HEADERS_LENGTH = 1;

function Timeseries(sheet, metadata, keyspec, datespec, typespec, columns, values, start_date) {
  this.sheet = sheet;
  this.metadata = metadata;
  this.keyspec = keyspec;
  this.datespec = datespec;
  this.typespec = typespec;
  this.columns = columns;
  this.values = values;
  this.start_date = start_date;
}

/** Deserialize the specified sheet into a Timeseries object. */
Timeseries.prototype.fromSheet = function(name, metadata, keyspec, datespec, typespec) {
  var active_app = SpreadsheetApp.getActiveSpreadsheet();
  
  var sheet = active_app.getSheetByName(name);
  var headers = sheet.getRange(1, 1, this.headersLen(), sheet.getLastColumn()).getValues();
  var values = sheet.getRange(this.headersLen() + 1, 1, sheet.getLastRow() - this.headersLen(), sheet.getLastColumn()).getValues(); 
    
  this.sheet = name;
  this.metadata = metadata;
  this.keyspec = keyspec;
  this.datespec = datespec;
  this.typespec = typespec;
  
  this.columnGroupsFromHeaders(headers);
  this.startDateFromValues(values);
  
  var trimmed = values;
  if (datespec == "ROW") {
    trimmed = [];
    for (var i = 0; i < values.length; i++) {
      var row = [];
      for (var j = 1; j < values[i].length; j++) {
        row.push(values[i][j]);
      }
      trimmed.push(row);
    }   
  }
  this.values = trimmed;
  
  return this;
}

/** Returns all of the column group keys defined in the Timeseries. */
Timeseries.prototype.keys = function() {
  return Object.keys(this.columns);
}

/** Returns the width in columns of the Timeseries. */
Timeseries.prototype.width = function() {
  var result = (this.datespec == "ROW" ? 1 : 0);
  var dateOffset = (this.datespec == "ROW" ? 0 : 1);
  
  var keys = this.keys();
  for (var i = 0; i < keys.length; i++) {
    var type = this.type(keys[i]);
    result += this.stride(type) + dateOffset;
  }
  
  return result;
}

/** Adds a column group to this Timeseries. */
Timeseries.prototype.addColumnGroup = function(key, type, metadata) {  
  var dateOffset = (this.datespec == "ROW" ? 0 : 1);
  var idx = this.width();
  
  this.columns[key] = {
    type: type,
    metadata: metadata,
    column: idx
  };
  
  if (this.values.length > 0) {
    for (var i = 0; i < this.values.length; i++) {
      for (var j = 0; j < this.stride(type) + dateOffset; j++) {
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

/** Returns the number of rows in the Timeseries. */
Timeseries.prototype.length = function() {
  return this.values.length;
}

/** Returns the number of rows in the Timeseries headers. */
Timeseries.prototype.headersLen = function() {
  return 1 + Object.keys(this.metadata).length + Object.keys(this.keyspec).length;
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
 *  Note: Column group index ignores the initial date column if using
 *    the "ROW" datespec.  Add one to account for the date column, if using
 *    this to calculate the column index for the sheet.
 */
Timeseries.prototype.column = function(key, column) {
  var dateOffset = 0;
  if (this.datespec == "COLUMN") {
    dateOffset = 1;
  }
  
  if (!(key in this.columns)) {
    throw new Error("failed to retrieve column index for unknown column group: " + key);
  }
  
  if (column === undefined || column == "date") {
    if (column == "date" && this.datespec == "ROW") {
      throw new Error("failed to access date field on ROW date instance");
    }
    
    return this.columns[key].column;
  }
  
  var type = this.columns[key].type;
  return this.columns[key].column + this.validType(type)[column] + dateOffset;
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
  if (this.datespec == "COLUMN") {
    throw new Error("failed to access row date on COLUMN date instance");
  }
  
  var result = new Date(this.start_date);
  result.setDate(result.getDate() + row);
  
  return result;
}

/** Returns the sheet column identifier for the specified column. */
Timeseries.prototype.sheetColumn = function(key, column) {
  var result = "";
  var offset = 0;
  
  if (this.datespec == "ROW") {
    offset = 1;
  }
  
  var sheetCol = this.column(key, column) + offset;
  
  var first = Math.floor(sheetCol / 26);
  var second = sheetCol % 26;
  
  if (first > 0) {
    result = result + String.fromCharCode(64 + first);
  }
  
  result = result + String.fromCharCode(65 + second);
  
  return result;
}

Timeseries.prototype.sanitizeDate = function(date) {
  return new Date(date).setHours(0,0,0,0);
}

/** Converts the Timeseries to the ROW date spec. */
Timeseries.prototype.toRowSpec = function(start_date, end_date) {
  if (this.datespec == "ROW") {
    throw new Error("failed to convert Timeseries already in ROW format");
  }
  
  var result = [];
  var counters = {};
  
  // Initialise row counters to 0
  var keys = this.keys();
  for (var i = 0; i < keys.length; i++) {
    counters[keys[i]] = 0;
  }
    
  // For each day in the range
  var end = new Date(end_date);
  for (var d = new Date(start_date); d < end; d.setDate(d.getDate() + 1)) {
    var row = [];

    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var type = this.type(key);
      
      // Check if the current day is greater than the next value
      // available for the column group
      while (counters[key] + 1 < this.length() &&
             d >= this.sanitizeDate(this.get(counters[key] + 1, key, "date"))) {
        // Increment the row counter for the column group
        counters[key]++;
      }
      
      // Append the current column group values to the row
      var column = this.columns[key].column;
      for (var j = 0; j < this.validType(type).stride; j++) {
        row.push(this.values[counters[key]][column + j + 1]);
      }
    }
    
    result.push(row);
  }
  
  this.values = result;
  this.start_date = start_date;
  this.datespec = "ROW";
}

/** Merges the supplied Timeseries into the current one.
 *  Assumes all supplied Timeseries are in ROW format and use common
 *. metadata, keyspec and typespec.
 */
Timeseries.prototype.merge = function(...cs) {
  if (this.datespec != "ROW") {
    throw new Error("failed to merge Timeseries not in ROW format");
  }
  
  for (var i = 0; i < cs.length; i++) {
    if (cs[i].datespec != "ROW") {
      throw new Error("failed to merge Timeseries not in ROW format");
    }
    
    if (cs[i].start_date != this.start_date) {
      throw new Error("failed to merge Timeseries with different start dates.");
    }
    
    if (cs[i].values.length != this.values.length) {
      throw new Error("failed to merge Timeseries with different end dates.");
    }
    
    var keys = cs[i].keys();
    for (var j = 0; j < keys.length; j++) {
      var key = keys[j];
      
      if (key in this.columns) {
        throw new Error("failed to merge Timeseries that contains duplicate key: " + key);
      }
      
      this.columns[key] = cs[i].columns[key];
    }
    
    for (var j = 0; j < this.values.length; j++) {
      for (var k = 0; k < cs[i].values[j].length; k++) {
        this.values[j].push(cs[i].values[j][k]);
      }
    }
  }
}

/** Inserts values to a column group in a sparse COLUMN spec Timeseries.
 *  
 *  ROW spec Timeseries are not supported since it does not make sense to append
 *  a single column group in a fully materialized Timeseries.
 */
Timeseries.prototype.insertAtDate = function(key, date, values) {
  var column = this.column(key);
  var type = this.type(key);
  var stride = this.stride(type);
  var lastRow = this.length() - 1;
  
  if (lastRow < 0) {
    // Timeseries currently contains no values.
    // Create a row and add the values to it.
    this.appendEmptyRow();
    this.insertAtRow(key, 0, values, date);
  } else {
    var insertRow = this.findRowForDate(key, date);
    
    if (insertRow < 0) {
      // All rows in the Timeseries are filled for the column group key and
      // they are all before the supplied date.
      // Create a row and add the values to it.
      this.appendEmptyRow();
      this.insertAtRow(key, lastRow + 1, values, date);
    } else {
      // The row to insert at exists within the Timeseries.
      var rowDate = this.get(insertRow, key, "date");
    
      if (rowDate == "") {
        // The insertion row is blank.
        // Insert the values.
        this.insertAtRow(key, insertRow, values, date);
      } else if (rowDate.getTime() > date.getTime()) {
        // The Timeseries contains dates after the supplied date.
        // Move all greater dates to make space for the inserted data.
        var lastDate = this.get(lastRow, key, "date");
        
        if (lastDate != "") {
          // This column group extends to the limit of the Timeseries.
          // Create a row to shuffle data into.
          this.appendEmptyRow();
          lastRow++;
        }
        
        // Copy each row from the previous row in the range lastRow to 
        // insertRow.
        for (var i = lastRow; i > insertRow; i--) {
          for (var j = 0; j < stride + 1; j++) {
            this.values[i][column + j] = this.values[i - 1][column + j];
          }
        }
        
        // Insert the new row.
        this.insertAtRow(key, insertRow, values, date);
      } else if (rowDate.getTime() == date.getTime()) {
        // The Timeseries contains values for the supplied date
        this.insertAtRow(key, insertRow, values, date);
      } else {
        // Searching the Timeseries returned a date before the supplied date.
        // This should not happen and likely means that the dates weren't sorted.
        throw new Error("Found row["+insertRow+"] with date before insertion date.  Are the dates correctly sorted?");
      }
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
  } else {
    return (first.getTime()>second.getTime())-(first.getTime()<second.getTime());
  }
}

/** Finds the first row containing a date after the supplied date, or the first
 *  empty row for the given column group.  Assumes the Timeseries is in sparse 
 *  COLUMN spec format.  Assumes the dates are sorted.
 */
Timeseries.prototype.findRowForDate = function(key, date) {
  if (this.datespec != "COLUMN") {
    throw new Error("Unimplemented: findRowForDate not implemented for ROW spec Timeseries.");
  }
  
  var startIdx = 0;
  var endIdx = this.length() - 1;
  var column = this.column(key);
  
  while(startIdx <= endIdx) {
    var middleIdx = Math.floor((startIdx + endIdx) / 2);
    
    if((middleIdx == 0 || this.compareDates(date, this.values[middleIdx - 1][column])) > 0 &&
       this.compareDates(date, this.values[middleIdx][column]) <= 0) {
      return middleIdx;
    }
    
    if(this.compareDates(date, this.values[middleIdx][column]) > 0) {
      startIdx = middleIdx + 1;
      continue;
    }
    
    if(this.compareDates(date, this.values[middleIdx - 1][column]) <= 0) {
      endIdx = middleIdx - 1;
      continue;
    }
  }
  
  return -1
}  

/** Appends an empty row to the values for this Timeseries. */
Timeseries.prototype.appendEmptyRow = function() {
  var keys = this.keys();
  var row = [];
  
  if (this.datespec == "ROW") {
    row.push("");
  }
  
  for (var i = 0; i < keys.length; i++) {
    var stride = this.stride(this.type(keys[i]));
    
    if (this.datespec == "COLUMN") {
      row.push("");
    }
    
    for (var j = 0; j < stride; j++) {
      row.push("");
    }
  }
  
  this.values.push(row);
}

/** Inserts the supplied values for the specified column group at the specified row. 
 *  
 *  date will be prepended to the values if using a sparse COLUMN spec timeseries,
 *    otherwise it will be ignored.
 */
Timeseries.prototype.insertAtRow = function(key, row, values, date) {
  if (this.length() <= row) {
    throw new Error("failed to insert at row ["+row+"]: length is: "+this.length());
  }
  
  var column = this.column(key);
  
  if (this.datespec == "COLUMN") {
    this.values[row][column] = date;
    column++;
  }
  
  for (var i = 0; i < values.length; i++) {
    this.values[row][column + i] = values[i];
  }
}

/** Materialize dates into a single column two dimensional array. */
Timeseries.prototype.getDateRange = function() {
  var result = [];
  
  if (this.datespec != "ROW") {
    throw new Error("failed to get date range for Timeseries not in ROW format.");
  }
  
  for (var i = 0; i < this.values.length; i++) {
    var d = new Date(this.start_date)
    d.setDate(d.getDate() + i);
    result.push([d]);
  }
  
  return result;
}

/** Serializes the Timeseries to a specified sheet. */
Timeseries.prototype.toSheet = function(name) {
  var active_app = SpreadsheetApp.getActiveSpreadsheet();
  
  var sheet = active_app.getSheetByName(name);

  var headers = this.writeHeaders();
  
  if (headers.length == 0 || headers[0].length == 0) {
    throw new Error("failed to serialize Timeseries["+this.sheet+"]: no headers were generated");
  }
  
  if (this.values.length == 0 || this.values[0].length == 0) {
      throw new Error("failed to serialize Timeseries["+this.sheet+"]: no values found");
  }  
    
  sheet.getRange(1, 1, headers.length, headers[0].length).setValues(headers);
  
  var dateOffset = 0;
  if (this.datespec == "ROW") {
    var d = this.getDateRange();
    sheet.getRange(headers.length + 1, 1, d.length, 1).setValues(d);
    dateOffset = 1;
  }
  
  sheet.getRange(headers.length + 1, 1 + dateOffset, this.values.length, this.values[0].length).setValues(this.values);
}

/** Serializes headers to a two dimensional array. */
Timeseries.prototype.writeHeaders = function() {  
  var result = [];
  
  var metadataRows = Object.keys(this.metadata);
  var keyRows = Object.keys(this.keyspec);
  var headersLen = metadataRows.length + keyRows.length + 1;  
  for (var i = 0; i < headersLen; i++) {
    result.push([]);
  }
  
  var dateStride = 1;
  if (this.datespec == "ROW") {
    for (var i = 0; i < headersLen; i++) {
      if (i == headersLen - 1) {
        result[i].push("Date");
      } else {
        result[i].push("");
      }
    }
    
    dateStride = 0;
  }
  
  var keys = this.keys();
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var type = this.type(key);
    
    // Write the column group type row
    result[0].push(type);
    
    // Add any padding columns needed by the column group type
    for (var j = 0; j < this.validType(type).stride + dateStride - 1; j++) {
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
      for (var k = 0; k < this.validType(type).stride + dateStride - 1; k++) {
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
      for (var k = 0; k < this.validType(type).stride + dateStride - 1; k++) {
        result[row].push("");
      }
    }
  }
  
  return result;
}
 
/** Deserialize the column group data from the supplied headers. */
Timeseries.prototype.columnGroupsFromHeaders = function(headers) {
  var columns = {};
  
  var metadataKeys = Object.keys(this.metadata);
  var keyParts = Object.keys(this.keyspec);
  if (headers.length < metadataKeys.length + keyParts.length + 1) {
    throw new Error("Too few header rows["+headers.length+"] for the specified metadata and keys.");
  }
  
  var dateOffset = 0;
  if (this.datespec == "ROW") {
    dateOffset = 1;
  }
  
  for (var i = dateOffset; i < headers[TYPE_ROW].length;) {
    var column = {};
    var valuesIdx = i - dateOffset;
    
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
      var keyPartRow = this.keyspec[keyPart] + metadataKeys.length + 1;
      compositeKey.push(headers[keyPartRow][i]);
    }
    columns[this.keyOf(compositeKey)] = column;
    
    i = i + this.validType(column.type).stride;
    
    if (this.datespec == "COLUMN") {
      i++;
    }
  }
  
  this.columns = columns;
}

/** Find the first date in a set of values. 
 *  Assumes rows are in date order.
 */
Timeseries.prototype.startDateFromValues = function(values) {
  var result;
  
  if (this.datespec == "ROW") {
    if (values.length > 0 && values[0].length > 0) {
      result = new Date(values[0][0]);
    }
  } else {
    for (var i = 0; i < values.length; i++) {
      if (values[i].length > 0) {
        var value = new Date(values[i][0]);
        if (result === undefined || result > value) {
          result = value;
        }
      } 
    }
  }
  
  this.start_date = result;
}

