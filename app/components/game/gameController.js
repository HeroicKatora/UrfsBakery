"use strict";
var bakeryModule = angular.module('bakery');

bakeryModule
.factory('Menu', [function() {
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
.factory('Game', ['$rootScope', 'Menu', function($scope, Menu) {
	// Define a service, we later inject into global scope.
	return  new ClickerSetup($scope, Menu);
}]);
