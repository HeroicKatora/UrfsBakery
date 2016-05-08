"use strict";
var bakeryModule = angular.module('bakery');

bakeryModule
.factory('Menu', ['$timeout', function($timeout) {
	var mapping = {
		'champions' : 'app/components/game/championMenu.htm',
		'mastery' : 'app/components/game/masteryMenu.htm',
		'options' : 'app/components/game/optionsMenu.htm',
		'match' : 'app/components/game/matchMenu.htm',
		'' : '',
	}
	return {
		messages: [],
		addMessage: function(message) {
			this.messages.push(message);
			var messages = this.messages;
			$timeout(function() {
				messages.shift();
			}, 15000);
		},
		menuPath: '',
		openMenu: function(menu) {
			if(mapping.hasOwnProperty(menu)) {
				this.menuPath = mapping[menu]; 			
			} else {
				console.log("missing menu " + menu);
				this.menuPath = '';
			}
		}
	};
}])
.factory('Game', ['$rootScope', 'Menu', function($scope, Menu) {
	// Define a service, we later inject into global scope.
	return  new ClickerSetup($scope, Menu);
}]);
