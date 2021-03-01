/** StatusReporter abstracts the ability to report status to the user. */
function StatusReporter(sheet, currentCell, previousCell) {
  this.sheet = sheet;
  this.currentRange = sheet.getRange(currentCell[0], currentCell[1], 1, 1);
  this.previousRange = sheet.getRange(previousCell[0], previousCell[1], 1, 1);
}

StatusReporter.prototype.setStatus = function(str) {
  this.previousRange.setValue(this.currentRange.getValue());
  this.currentRange.setValue(str);
}

StatusReporter.prototype.clear = function() {
  this.previousRange.setValue("");
  this.currentRange.setValue("");  
}
