/// <reference path="tps.js" />

function TestFunction1(name, value) {
    /** Test function description here
     *  
     *  @param {string} name - the name of your configuration
     *  @param {number} value - the new value of the configuration
     */

    alert("function TestFunction1 called" + name + value);
}

function AnotherTestFunction(n) {
    /** Another function that can compute the nth fabonacci number
     *  The fabonacci sequence is: 1, 1, 2, 3, 5, 8, 13, 21, ...
     *  
     *  @param {number} n - the index, started from 0. for example, the 4th number is 5.
     */

    var a = 0;
    var b = 1;
    for (var i = 0; i < n; i++) {
        var c = a + b;
        a = b;
        b = c;
    }

    alert("the number is : " + b);
}


