const assert = require('assert');
const functions = require('../Functions.js');

describe('Functions module', function () {
  it('exports the correct array', function () {
    assert.deepStrictEqual(functions, ['foo','bar',3]);
  });
});
