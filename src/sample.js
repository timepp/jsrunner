function TestFunction1(name, value) {
    /** Test function description here
     *  
     *  @param {string} name - the name of your configuration
     *  @param {number} value - the new value of the configuration
     */

    alert("function TestFunction1 called" + name + value);
}

function getMaxFabonacci() {
    return "1022";
}

function Fabonacci(n) {
    /** Compute the nth fabonacci number
     *  The fabonacci sequence is: 1, 1, 2, 3, 5, 8, 13, 21, ...
     *
     *  Currently the largest known number is {@call getMaxFabonacci}.
     *  See {@link http://www.baidu.com baidu} for more details.
     *  
     *  @param {number} n - the index, started from 1. for example, the 4th number is 3.
     */

    var a = 0;
    var b = 1;
    for (var i = 1; i < n; i++) {
        var c = a + b;
        a = b;
        b = c;
    }

    tps.log.Debug("the " + n + "th fabonacci number is : " + b);
}
