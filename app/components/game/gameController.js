var bakeryModule = angular.module('bakery');


bakeryModule
.factory('Game', ['$rootScope', function($scope) {
	// Define a service, we later inject into global scope.
	state = new ClickerSetup($scope);
	state.menuPath = '';
	state.openMenu = function(menu) {
		if(menu == 'champions') {
			this.menuPath = 'app/components/game/championMenu.htm';
		} else if(menu == '') {
			this.menuPath = '';
		} else {
			console.log("missing menu " + menu);
		}
	};
	return state;
}]);
