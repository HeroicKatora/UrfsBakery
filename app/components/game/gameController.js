"use strict";
var bakeryModule = angular.module('bakery');

bakeryModule
.factory('Menu', [function() {
	var mapping = {
		'champions' : 'app/components/game/championMenu.htm',
		'mastery' : 'app/components/game/masteryMenu.htm',
		'options' : 'app/components/game/optionsMenu.htm',
		'' : '',
	}
	return {
		menuPath: '',
		openMenu: function(menu) {
			if(mapping.hasOwnProperty(menu)) {
				this.menuPath = mapping[menu]; 			
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
