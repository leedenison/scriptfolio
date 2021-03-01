function runTests(tests) {
  for (var i = 0; i < tests.length; i++) {
    var t = new Tester(tests[i].name);

    try {
      tests[i](t);
    }
    catch (error) {
      t.pushFail(String(error), error)
    }

    Logger.log(t.toString());
  }
}

function Tester(name) {
  this.name = name;
  this.failures = [];
}

Tester.prototype.assert = function(b, fail) {
  if (!b) {
    this.pushFail(fail);
  }
}

Tester.prototype.pushFail = function(msg, error) {
    this.failures.push({
      msg: msg,
      err: error
    });
}

Tester.prototype.failed = function() {
  return this.failures.length > 0;
}

Tester.prototype.toString = function() {
  var result = this.name + ": ";

  if (this.failed()) {
    result += "FAILED\n";

    for (var i = 0; i < this.failures.length; i++) {
      result += "\t" + this.failures[i].msg + "\n";

      if (this.failures[i].err !== undefined) {
        result += "Stack trace: \n";
        result += this.failures[i].err.stack;
      }
    }
  }
  else {
    result += "PASSED\n";
  }

  return result;
}


