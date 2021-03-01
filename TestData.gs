var testDataPrices = {
  headers: [
    ["", "PRICE", "PRICE", "PRICE"],
    ["", "GBX", "GBP", "USD"],
    ["", "AVAILABLE", "AVAILABLE", "AVAILABLE"],
    ["Date", "SYM1", "SYM2", "SYM3"]
  ],
  values: [
    [new Date("2019/01/01"), 10000, 200, 300],
    [new Date("2019/01/02"), 10100, 220, 330],
    [new Date("2019/01/03"), 9900, 180, 270]
  ]
};

var testDataAltPrices = {
  headers: [
    ["", "PRICE", "PRICE", "PRICE"],
    ["", "GBX", "GBP", "USD"],
    ["", "AVAILABLE", "AVAILABLE", "NOT_AVAILABLE"],
    ["Date", "SYM4", "SYM5", "SYM6"]
  ],
  values: [
    [new Date("2019/01/01"), 11000, 400, 500],
    [new Date("2019/01/02"), 11100, 420, 530],
    [new Date("2019/01/03"), 10900, 380, 470]
  ]
};

var testDataSparsePrices = {
  headers: [
    ["PRICE", "", "PRICE", "", "PRICE", ""],
    ["GBX", "", "GBP", "", "USD", ""],
    ["AVAILABLE", "", "AVAILABLE", "", "AVAILABLE", ""],
    ["SYM1", "", "SYM2", "", "SYM3", ""]
  ],
  values: [
    [new Date("2019/01/01"), 10000, new Date("2019/01/01"), 200, new Date("2019/01/02"), 300],
    [new Date("2019/01/02"), 10100, new Date("2019/01/04"), 220, new Date("2019/01/03"), 330],
    [new Date("2019/01/03"), 9900, new Date("2019/01/05"), 180, new Date("2019/01/05"), 270]
  ]
};

var testDataSparsePricesWithEmptyColumns = {
  headers: [
    ["PRICE", "", "PRICE", "", "PRICE", "", "PRICE", ""],
    ["GBX", "", "GBP", "", "USD", "", "USD", ""],
    ["AVAILABLE", "", "AVAILABLE", "", "AVAILABLE", "", "AVAILABLE", ""],
    ["SYM1", "", "SYM2", "", "SYM3", "", "SYM4", ""]
  ],
  values: [
    [new Date("2019/01/01"), 10000, new Date("2019/01/01"), 200, "", "", new Date("2019/01/02"), 300],
    [new Date("2019/01/02"), 10100, new Date("2019/01/04"), 220, "", "", new Date("2019/01/03"), 330],
    [new Date("2019/01/03"), 9900, new Date("2019/01/05"), 180, "", "", new Date("2019/01/05"), 270]
  ]
};

var testDataAssets = {
  headers: [
    ["", "CURRENCY", "ASSET", "ASSET"],
    ["", "GBP", "GBX", "USD"],
    ["", "ACC1", "ACC1", "ACC2"],
    ["Date", "CASH", "SYM1", "SYM2"]
  ],
  values: [
    [new Date("2019/01/01"), 10000, 200, 300],
    [new Date("2019/01/02"), 10100, 220, 330],
    [new Date("2019/01/03"), 9900, 180, 270]
  ]
};

var testDataAltAssets = {
  headers: [
    ["", "CURRENCY", "ASSET", "ASSET"],
    ["", "GBP", "GBX", "USD"],
    ["", "ACC3", "ACC3", "ACC4"],
    ["Date", "CASH", "SYM1", "SYM2"]
  ],
  values: [
    [new Date("2019/01/01"), 11000, 400, 500],
    [new Date("2019/01/02"), 11100, 420, 530],
    [new Date("2019/01/03"), 10900, 380, 470]
  ]
};

var testDataTxLog = [
  [new Date("2019/01/04"), "Initialise", "SYM1", 500, 0],
  [new Date("2019/01/04"), "Buy", "SYM1", 500, -300],
  [new Date("2019/01/04"), "Sell", "SYM2", 100, 200],
  [new Date("2019/01/04"), "Sell", "SYM3", 100, 300]
];

var testDataCurrencyMap = {
  "SYM1": "GBX",
  "SYM2": "GBP",
  "SYM3": "USD",
  "SYM4": "GBX",
  "SYM5": "GBP",
  "SYM6": "USD",
  "SYM7": "GBP",
  "SYM8": "GBP",
  "SYM9": "USD",
  "SYM10": "GBP",
  "SYM11": "GBP",
  "SYM12": "GBP",
  "SYM13": "GBP",
  "SYM14": "GBP",
  "SYM15": "GBP",
  "SYM16": "GBP"
};

function testDataSymbols(num) {
  var result = [];

  for (var i = 1; i <= num; i++) {
    result.push("SYM" + i);
  }

  return result;
}

function testDataChunkJobs() {
  var start1 = new Date("2019/01/01");
  var end1 = new Date("2019/01/04");
  var start2 = new Date("2019/01/05");
  var end2 = new Date("2019/01/08");

  var chunkJobs = [
    new PriceFetcherJob(["SYM1", "SYM2", "SYM3"], start1, end1),
    new PriceFetcherJob(["SYM4", "SYM5", "SYM6"], start1, end1),
    new PriceFetcherJob(["SYM7", "SYM8", "SYM9"], start1, end1),
    new PriceFetcherJob(["SYM1", "SYM2", "SYM3"], start2, end2),
    new PriceFetcherJob(["SYM4", "SYM5", "SYM6"], start2, end2),
    new PriceFetcherJob(["SYM7", "SYM8", "SYM9"], start2, end2)
  ];

  // Foreach chunk job
  for (var i = 0; i < chunkJobs.length; i++) {
    // Add symbols to successful symbols
    for (var j = 0; j < 3; j++) {
      var symbol = chunkJobs[i].symbols.all[j];
      chunkJobs[i].symbols.update(symbol, true);
    }

    // Foreach row of each chunk
    for (var j = 0; j < 4; j++) {
      if (chunkJobs[i].values.length <= j) {
        chunkJobs[i].values.push([]);
      }

      // Foreach symbol in each chunk
      for (var k = 0; k < 3; k++) {
        // Foreach column of each symbol in each chunk
        for (var l = 0; l < QUERY_STRIDE; l++) {
          chunkJobs[i].values[j][k * QUERY_STRIDE + l] = i * 100 + j * 10 + k * QUERY_STRIDE + l + 1;
        }
      }
    }
  }

  return chunkJobs;
}


