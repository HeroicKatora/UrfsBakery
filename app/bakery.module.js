/* Setup, load and config angular */
"use strict";
var bakeryModule = angular.module('bakery', ['ngAnimate']);

bakeryModule.run(['Game', 'Menu', '$rootScope', function(Game, Menu, $scope){
	$scope.pageTitle = 'Urf\'s Bakery';
	// Inject the service
	$scope.Bakery = Game;
	$scope.Menu = Menu;
	$scope.mastery_region = data.regions.find(function(reg_el){return reg_el.id == $scope.Bakery.state.region}) || data.regions[0];
	$scope.mastery_name = $scope.Bakery.state.summoner || "";
}]);
