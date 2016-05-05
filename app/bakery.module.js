/* Setup, load and config angular */
"use strict";
var bakeryModule = angular.module('bakery', []);

bakeryModule
.factory('Game', ['$rootScope', function($scope) {
	// Define a service, we later inject into global scope.
	return {
		menuPath: '',
		openMenu: function(menu) {
			if(menu == 'champions') {
				this.menuPath = 'app/components/game/championMenu.htm';
			} else if(menu == '') {
				this.menuPath = '';
			} else {
				console.log("missing menu " + menu);
			}
		}
	};
}])
.run(['Game', '$rootScope', function(Game, $scope){
	$scope.clicker = clicker;
	$scope.clickerSetup = ClickerSetup;
	$scope.pageTitle = 'example title';
	// Inject the service
	$scope.Bakery = Game;
}]);
