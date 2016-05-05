/* Setup, load and config angular */
"use strict";
var bakeryModule = angular.module('bakery', []);

bakeryModule.run(['Game', '$rootScope', function(Game, $scope){
	$scope.clickerSetup = function(){$scope.clicker = new ClickerSetup();};
	$scope.pageTitle = 'example title';
	// Inject the service
	$scope.Bakery = Game;
}]);
