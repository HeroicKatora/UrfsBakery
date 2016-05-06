/* Setup, load and config angular */
"use strict";
var bakeryModule = angular.module('bakery', []);

bakeryModule.run(['Game', 'Menu', '$rootScope', function(Game, Menu, $scope){
	$scope.pageTitle = 'example title';
	// Inject the service
	$scope.Bakery = Game;
	$scope.Menu = Menu;
	$scope.mastery_region = data.regions.find(function(reg_el){return reg_el.id == $scope.Bakery.state.region}) || data.regions[0];
	$scope.mastery_name = $scope.Bakery.state.summoner || "";
}]);
