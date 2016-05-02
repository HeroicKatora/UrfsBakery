/* Setup, load and config angular */
var bakeryModule = angular.module('bakery', []);

bakeryModule.run(['$rootScope', function($scope){
	$scope.clicker = clicker;
	$scope.clickerSetup = ClickerSetup;
	$scope.pageTitle = 'example title';
}]);
