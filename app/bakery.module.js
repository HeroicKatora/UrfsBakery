/* Setup, load and config angular */
"use strict";
var bakeryModule = angular.module('bakery', []);

bakeryModule.run(['Game', 'Menu', '$rootScope', function(Game, Menu, $scope){
	$scope.pageTitle = 'example title';
	// Inject the service
	$scope.Bakery = Game;
	$scope.Menu = Menu;
}]);
