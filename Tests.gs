function runAllTests() {
  var tests = [
    testEmptyPortfolioHasKey,
    testReadPriceData,
    testPriceMerge,
    testPortfolioMerge,
    testSparsePriceToPrice,
    testSparsePriceFindRowForDate,
    testSparsePriceToPriceLateDateRange,
    testTxLogSymbolMetadata,
    testTxLogToPortfolio,
    testTxLogToPortfolioLateDateRange,
    testPriceFetcherJob,
    testPriceFetcherCreateChunkJobs,
    testPriceFetcherGeneratePriceFormulas,
    testPriceFetcherMergeChunkJobs,
    testPriceFetcherToSparsePrice,
    testLogSetNewSymbolSet
  ];
  runTests(tests);
}

function runOneTest() {
  var test = testTxLogToPortfolio;
  runTests([test]);
}

function testEmptyPortfolioHasKey(t) {
  var empty = new Portfolio();

  t.assert(!empty.hasKey("key"), "empty Portfolio claims to contain key \"key\"");
}

function testReadPriceData(t) {
  var price = new Price().fromHeadersAndValues(testDataPrices.headers, testDataPrices.values);

  t.assert(price.keys().length == 3, "failed to create column groups from headers");
  t.assert(price.currency("SYM1") == "GBX", "failed to set currency correctly from headers");
  t.assert(price.fetchStatus("SYM1") == "AVAILABLE", "failed to set fetch status correctly from headers");
  t.assert(price.values.length == 3 && price.values[0].length == 3, "failed to read values");
}

function testPriceMerge(t) {
  var price = new Price().fromHeadersAndValues(testDataPrices.headers, testDataPrices.values);
  var altPrice = new Price().fromHeadersAndValues(testDataAltPrices.headers, testDataAltPrices.values);
  
  price.merge(altPrice);
  t.assert(price.keys().length == 6, "failed to merge column groups");
  t.assert(price.values.length == 3 && price.values[0].length == 6, "failed to merge values");
}

function testPortfolioMerge(t) {
  var p = new Portfolio().fromHeadersAndValues(testDataAssets.headers, testDataAssets.values);
  var altP = new Portfolio().fromHeadersAndValues(testDataAltAssets.headers, testDataAltAssets.values);
  
  p.merge(altP);
  t.assert(p.keys().length == 6, "failed to merge column groups");
  t.assert(p.values.length == 3 && p.values[0].length == 6, "failed to merge values");
}

function testSparsePriceToPrice(t) {
  var sparse = new SparsePrice().fromHeadersAndValues(testDataSparsePrices.headers, testDataSparsePrices.values);
  var price = sparse.toPrice(new Date("2019/01/01"), new Date("2019/01/06"));
  
  t.assert(price.keys().length == 3, "failed to convert price headers to non-sparse data");
  t.assert(price.values.length == 5, "failed to convert price values to non-sparse data");
}

function testSparsePriceToPriceLateDateRange(t) {
  var sparse = new SparsePrice().fromHeadersAndValues(testDataSparsePrices.headers, testDataSparsePrices.values);
  var price = sparse.toPrice(new Date("2019/02/01"), new Date("2019/02/06"));
  
  t.assert(price.keys().length == 3, "failed to convert price headers to non-sparse data");
  t.assert(price.values.length == 5, "failed to convert price values to non-sparse data");
}

function testSparsePriceFindRowForDate(t) {
  var sparse = new SparsePrice().fromHeadersAndValues(testDataSparsePricesWithEmptyColumns.headers, testDataSparsePricesWithEmptyColumns.values);
  var row = sparse.findRowForDate("SYM3", new Date("2019/01/06"));
  
  t.assert(row == 0, "failed to find row for date in empty column");
}

function testTxLogSymbolMetadata(t) {
  var l = new TxLog(new DummySheet(testDataTxLog), new TestReader("TEST-ACC"));

  t.assert(Object.keys(l.symbolMap).length == 4, "failed to generate symbol metadata");
  t.assert(l.symbolMap["SYM1"].accounts.length == 1, "failed to generate account metadata");
}

function testTxLogToPortfolio(t) {
  var l = new TxLog(new DummySheet(testDataTxLog), new TestReader("TEST-ACC"));
  var p = l.toPortfolio(new Date("2019/01/01"), new Date("2019/01/05"), testDataCurrencyMap);

  t.assert(p.keys().length == 4, "failed to create column groups");
  t.assert(p.length() == 4, "failed to create portfolio values");
}

function testTxLogToPortfolioLateDateRange(t) {
  var l = new TxLog(new DummySheet(testDataTxLog), new TestReader("TEST-ACC"));
  var p = l.toPortfolio(new Date("2019/02/01"), new Date("2019/02/05"), testDataCurrencyMap);

  t.assert(p.keys().length == 4, "failed to create column groups");
  t.assert(p.length() == 4, "failed to create portfolio values");
}

function testPriceFetcherCreateChunkJobs(t) {
  var fetchJob = new PriceFetcherJob(testDataSymbols(16), new Date("2019/01/01"), new Date("2020/12/31"));
  var fetcher = new PriceFetcher();

  var chunkJobs = fetcher.createChunkJobs(fetchJob);

  t.assert(chunkJobs.length == 4, "failed to create chunk jobs");
}

function testPriceFetcherGeneratePriceFormulas(t) {
  var fetchJob = new PriceFetcherJob(testDataSymbols(3), new Date("2019/01/01"), new Date("2019/12/31"), ["SYM2"]);
  var fetcher = new PriceFetcher();

  var formulas = fetcher.generatePriceFormulas(fetchJob);

  t.assert(formulas.length == 6, "failed to create formulas");

  if (formulas.length == 6) {
    t.assert(formulas[2] == "", "failed to skip specified symbol: " + formulas[2]);
  }
}

function testPriceFetcherToSparsePrice(t) {
  var fetchJob = new PriceFetcherJob(testDataSymbols(4), new Date("2019/01/01"), new Date("2019/01/06"));
  fetchJob.values = [
    [new Date("2019/01/01"), 10000, new Date("2019/01/01"), 200, "", "", new Date("2019/01/02"), 300],
    [new Date("2019/01/02"), 10100, new Date("2019/01/04"), 220, "", "", new Date("2019/01/03"), 330],
    [new Date("2019/01/03"), 9900, new Date("2019/01/05"), 180, "", "", new Date("2019/01/05"), 270]
  ];
  var sparsePrice = fetchJob.toSparsePrice();

  t.assert(sparsePrice.values.length == 3, "failed to create sparse price");
}

function testPriceFetcherJob(t) {
  var fetchJob = new PriceFetcherJob(testDataSymbols(3), new Date("2019/01/01"), new Date("2019/12/31"), ["SYM2"]);

  t.assert(!fetchJob.symbols.shouldAttemptFetch("SYM2"), "failed to create PriceFetcherJob");
}

function testPriceFetcherMergeChunkJobs(t) {
  var chunkJobs = testDataChunkJobs();
  var fetchJob = new PriceFetcherJob(testDataSymbols(9), new Date("2019/01/01"), new Date("2019/01/08"));
  var fetcher = new PriceFetcher(undefined, undefined, fetchJob);

  var job = fetcher.mergeChunkJobs(chunkJobs);

  t.assert(job.values.length == 8 && job.values[0].length == 18, "failed to generate merged job");
}

function testLogSetNewSymbolSet(t) {
  var l = new TxLog(new DummySheet(testDataTxLog), new TestReader("TEST-ACC"));
  var logSet = new TxLogSet([l], new DummySheet(), new Price(), new TestStatusReporter());

  var newSymbolSet = logSet.newSymbolSet();

  t.assert(Object.keys(newSymbolSet).length == 3, "failed to generate new symbol set");
}
