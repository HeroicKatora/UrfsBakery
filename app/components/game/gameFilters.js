"use strict";
var bakeryModule = angular.module('bakery');

bakeryModule.filter('prettyNumber', function() {
	var scales = {
		2 : 'Million',
		3 : 'Billion',
		4 : 'Trillion',
		5 : 'Quadrillion'
	}
	return function (number){
		if(Math.abs(number) < 1e3) return number.toFixed();
		if(Math.abs(number) < 1e6) {
			var lastPart = ("000" + (number % 1000).toFixed()).substr(-3);
			return Math.floor(number / 1000).toFixed() + ',' + lastPart;
		}
		var negative = number < 0;
		number = Math.abs(number);
		var scale = Math.floor(Math.log(number) / Math.log(10)  / 3);
		var scaleText = scales[scale];
		if(scaleText == undefined){
			scale = 6;
			scaleText = 'Bazillion';
		}
		var power = Math.pow(10, 3 * scale);
		return (negative ? '-' : '') + String((number/power).toFixed(3)) + ' ' + scaleText;
	}
})
