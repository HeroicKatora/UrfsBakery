/* Setup, load and config angular */
"use strict";
var bakeryModule = angular.module('bakery', []);

bakeryModule.run(['Game', '$rootScope', function(Game, $scope){
	$scope.clicker = clicker;
	$scope.clickerSetup = ClickerSetup;
	$scope.pageTitle = 'example title';
	// Inject the service
	$scope.Bakery = Game;
}]);
