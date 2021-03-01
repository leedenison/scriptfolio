// @ts-nocheck
/** A SparseTimeseries is a data structure which can be serialized to,
 *  and deserialized from, a spreadsheet.  It assumes data is organized
 *  into groups of columns; with metadata about each group of columns stored
 *  in header rows at the top of the first column in the group.
 *  
 *  Rows represent the actual timeseries data with the date stored as the
 *  first column in each column group.  Each column group can contain
 *  data for non-contiguous time intervals independently of other column
 *  groups in the timeseries.
 * 
 *  Metadata format for the column group is identical to Timeseries data.
 */

/** Construct a new SpareTimeseries.
 * 
 *  sheet: The name of the sheet that the SparseTimeseries serializes from / to.
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

function SparseTimeseries(sheet, metadata, keyspec, typespec, start) {
  Timeseries.call(this, sheet, metadata, keyspec, typespec, start);
}

SparseTimeseries.prototype = Object.create(Timeseries.prototype);

Object.defineProperty(SparseTimeseries.prototype, 'constructor', { 
    value: SparseTimeseries, 
    enumerable: false,
    writable: true });

SparseTimeseries.prototype.setValues = function(values) {
  this.values = values;
}

SparseTimeseries.prototype.readDateValues = function(sheet, columns) {
  return sheet.getRange(this.headersLen() + 1, 1, 1, columns).getValues();
}

/** Returns the width in columns of the SparseTimeseries. */
SparseTimeseries.prototype.width = function() {
  // Add one date column for each column group key.
  return Timeseries.prototype.width.call(this) + this.keys().length;
}

/** Returns the serialized offset for the column groups. */
SparseTimeseries.prototype.serializedColumnOffset = function() {
  return 0;
}

/** Returns the width of a column group. */
SparseTimeseries.prototype.columnWidth = function(key) {
  return Timeseries.prototype.columnWidth.call(this, key) + 1;
}

/** Returns the column index for the specified column within the column group
 *  corresponding to key.
 */
SparseTimeseries.prototype.column = function(key, column) {
  var result = 0;
  
  if (column === undefined || column == "date") {
    result = Timeseries.prototype.column.call(this, key);
  } else {
    result = Timeseries.prototype.column.call(this, key, column) + 1;
  }

  return result;
}

/** Returns the data for the specified row, column group and column. */
SparseTimeseries.prototype.get = function(row, key, column) {
  var result = Timeseries.prototype.get.call(this, row, key, column);

  if (column === undefined || column == "date") {
    if (result == "") {
      return result;
    } else {
      result = new Date(result);
      result.setHours(0,0,0,0);
      return result;
    }
  } else {
    return result;
  }
}

/** Row date is undefined for a SparseTimeseries. */
SparseTimeseries.prototype.getRowDate = function(row) {
  throw new Error("failed to access row date on SparseTimeseries");
}

/** Converts the SparseTimeseries to a non-sparse Timeseries. */
SparseTimeseries.prototype.materializeValues = function(start, end) {
  var result = [];
  var counters = {};
  
  // Initialise row counters to 0
  var keys = this.keys();
  for (var i = 0; i < keys.length; i++) {
    counters[keys[i]] = 0;
  }
    
  // For each day in the range
  end.setHours(0,0,0,0);
  start.setHours(0,0,0,0);
  for (var d = new Date(start); d.getTime() < end.getTime(); d.setDate(d.getDate() + 1)) {
    var row = [];

    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var type = this.type(key);
      
      // Check if the current day is greater than the next value
      // available for the column group
      while (counters[key] + 1 < this.length()) {
        var sparseDate = this.get(counters[key] + 1, key, "date");
        if (sparseDate === undefined || sparseDate == "" || d.getTime() <= sparseDate.getTime()) {
          break;
        }
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
  
  return result;
}

/** Merge is not supported for SparseTimeseries. */
SparseTimeseries.prototype.merge = function(...cs) {
  throw new Error("merge not supported for SparseTimeseries");
}

/** Inserts values to a column group in a SpareTimeseries */
SparseTimeseries.prototype.insertAtDate = function(key, date, values) {
  var column = this.column(key);
  var type = this.type(key);
  var stride = this.stride(type);
  var lastRow = this.length() - 1;
  var insertValues = [date];

  if (values.length != stride) {
    throw new Error("Attempted to insert incorrect number of values at date: expected " + stride + " values, found: " + values.length + " values");
  }

  for (var i = 0; i < values.length; i++) {
    insertValues.push(values[i]);
  }
  
  if (lastRow < 0) {
    // Timeseries currently contains no values.
    // Create a row and add the values to it.
    this.appendEmptyRow();
    this.insertAtRow(key, 0, insertValues);
  } else {
    var insertRow = this.findRowForDate(key, date);
    
    if (insertRow < 0) {
      // All rows in the Timeseries are filled for the column group key and
      // they are all before the supplied date.
      // Create a row and add the values to it.
      this.appendEmptyRow();
      this.insertAtRow(key, lastRow + 1, insertValues);
    } else {
      // The row to insert at exists within the Timeseries.
      var rowDate = this.get(insertRow, key, "date");
    
      if (rowDate == "") {
        // The insertion row is blank.
        // Insert the values.
        this.insertAtRow(key, insertRow, insertValues);
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
        this.insertAtRow(key, insertRow, insertValues);
      } else if (rowDate.getTime() == date.getTime()) {
        // The Timeseries contains values for the supplied date
        this.insertAtRow(key, insertRow, insertValues);
      } else {
        // Searching the Timeseries returned a date before the supplied date.
        // This should not happen and likely means that the dates weren't sorted.
        throw new Error("Found row["+insertRow+"] with date (" + rowDate + ") before " +
            "insertion date (" + date + ").  Are the dates correctly sorted?");
      }
    }
  }
}

/** Finds the first row containing a date after the supplied date, or the first
 *  empty row for the given column group.  Assumes the dates are sorted.
 */
SparseTimeseries.prototype.findRowForDate = function(key, date) {
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

/** getDateRange is not supported for SparseTimeseries. */
SparseTimeseries.prototype.getDateRange = function() {
  throw new Error("failed to get date range for SparseTimeseries.");
}

/** Serializes the SparseTimeseries to a specified sheet. */
SparseTimeseries.prototype.toSheet = function(name) {
  var active_app = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = active_app.getSheetByName(name);
  
  var headers = this.writeHeaders();
  if (headers.length == 0 || headers[0].length == 0) {
    throw new Error("failed to serialize SparseTimeseries["+this.sheet+"]: no headers were generated");
  }
  
  if (this.values.length == 0 || this.values[0].length == 0) {
      throw new Error("failed to serialize SparseTimeseries["+this.sheet+"]: no values found");
  }  
    
  sheet.getRange(1, 1, headers.length, headers[0].length).setValues(headers);
  sheet.getRange(headers.length + 1, 1, this.values.length, this.values[0].length).setValues(this.values);
}

/** Serializes headers to a two dimensional array. */
SparseTimeseries.prototype.writeHeaders = function() {  
  return this.writeColumnGroupHeaders();
}

/** Find the first date in a set of values. 
 *  Assumes rows are in date order.
 */
SparseTimeseries.prototype.startDateFromValues = function(values) {
  var result;
  
  for (var i = 0; i < values.length; i++) {
    if (values[i].length > 0) {
      var value = new Date(values[i][0]);
      if (result === undefined || result > value) {
        result = value;
      }
    } 
  }
  
  return result;
}

