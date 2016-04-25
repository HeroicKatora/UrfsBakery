
var clicker = {}
var data = {};
initStaticData();

!function main(clicker){

	var state = null;
	var started = false;

	var initState = function(){
		state = {};
		state.pastries = 0;
		state.champions = {};
		state.champions.amount = [];
		state.champions.level = [];
		state.upgrades = [];
		state.items = [];
		state.match = {};
		state.rank = 0;
	};
	var startEmpty = function(){
		if(started){ 
			return;
		}
		initState();
		startGame();
	};
	var startConnectServer = function(name){
		if(started){
			return;	
		}
		//TODO special server connection
		initState();
		startGame();	
	};
	var loadSavedData = function(){
		if(!load()){
			console.log("Couldn't load game data");
			return;
		}
		if(!started){
			startGame();
		}
	};

/*
* Transition the game start and stop edges
*/
	var startGame = function(){
		if(started){
			return;
		}
		started = true;
		button_fresh.hidden=true;
		button_start_server.hidden=true;
		setTimeout(loop, 1);
	}
	var endGame = function(){
		started = false;
		button_fresh.hidden=null;
		button_start_server.hidden=null;
		state = null;
	};

/*
* Save the game state to be able to restore it
*/
	var save = function(){
		document.cookie = JSON.stringify(state);
		console.log(document.cookie);
	};
	var canLoad = function(){
		return document.cookie != null && document.cookie != "" && JSON.parse(document.cookie) != null;
	};
	var load = function(){
		if(!canLoad()){
			console.log("Couldn't load game data");
			return false;
		}
		loadGameData(document.cookie);
		return true;
	};

	var loadGameData = function(json){
		state = JSON.parse(json);
	};
	var deleteGameData = function(){
		endGame();
		document.cookie = null;
	};

	clicker.debugState = function(){
		console.log(state);
	}

/*
* Setting up the display
*/

	var button_fresh = document.getElementById("fresh");
	var button_delete = document.getElementById("delete");
	var button_start_server = document.getElementById("start_server");
	var button_save = document.getElementById("save");
	var button_load = document.getElementById("load");
	var button_bake = document.getElementById("bake");
	var button_reset = document.getElementById("reset");
	button_fresh.addEventListener("click", startEmpty);
	button_start_server.addEventListener("click", startConnectServer);
	button_load.addEventListener("click", loadSavedData);
	button_delete.addEventListener("click", deleteGameData);
	button_save.addEventListener("click", save);
	button_bake.addEventListener("click", function(){
		if(!started){
			return;
		}
		state.pastries += 10;
	});
	button_reset.addEventListener("click", function(){
		initState();
	});

	if(canLoad()){
		button_load.disabled=null;
		console.log("Found existing game data, readying load screen before creation screen");
	}else{
		button_load.disabled=true;
	}

/*
*
* Game loop stuff from here onwards
*
*/
	var buyFunction = function(ident){
		return function(){
			buy(ident);
		};
	};
	var Champion = 0;
	var Upgrade = 1;
	var Item = 2;
	var buy = function(ident){
		if(ident.type == Champion){

		}else if(ident.type == Upgrade){

		}else if(ident.type == Item){

		}else{
			console.log("Received invalid buy request");
		}
	};
	var mainLoop = function(){
		bake();
		document.getElementById("pastries").innerHTML = "Pastries: "+state.pastries;
	};
	function bake(){
		state.pastries += 1;
	};
	var loop = function(){
		if(!started){
			return;
		}
		setTimeout(function(){
			mainLoop();
			loop();
		}, 100);
	};

}(clicker);

var initStaticData = function(){
	data.items = [];
	data.champsion = [];
};