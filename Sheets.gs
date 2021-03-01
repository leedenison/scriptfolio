function getSheetValues(sheet) {
  if (sheet.getLastRow() - sheet.getFrozenRows() > 0 && sheet.getLastColumn() - sheet.getFrozenColumns() > 0) {
    return sheet.getRange(
        sheet.getFrozenRows() + 1,
        sheet.getFrozenColumns() + 1,
        sheet.getLastRow() - sheet.getFrozenRows(),
        sheet.getLastColumn() - sheet.getFrozenColumns()).getValues();
  } else {
    return [];
  }
}

function getSheetHeaders(sheet) {
  if (sheet.getFrozenRows() > 0 && sheet.getLastColumn() - sheet.getFrozenColumns() > 0) {
    return sheet.getRange(
        1,
        sheet.getFrozenColumns() + 1,
        sheet.getFrozenRows(),
        sheet.getLastColumn() - sheet.getFrozenColumns()).getValues();
  } else {
    return [];
  }
}

function clearSheet(sheet) {
  if (sheet.getLastRow() - sheet.getFrozenRows() > 0 && sheet.getLastColumn() - sheet.getFrozenColumns() > 0) {
    sheet.getRange(
      sheet.getFrozenRows() + 1,
      sheet.getFrozenColumns() + 1,
      sheet.getLastRow() - sheet.getFrozenRows(),
      sheet.getLastColumn() - sheet.getFrozenColumns()).clear();
  }
}

