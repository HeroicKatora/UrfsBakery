/* Setup, load and config angular */
var bakeryModule = angular.module('bakery', []);

bakeryModule.run(['$rootScope', function($scope){
	$scope.clickerSetup = function(){$scope.clicker = new ClickerSetup();};
	$scope.pageTitle = 'example title';
}]);
