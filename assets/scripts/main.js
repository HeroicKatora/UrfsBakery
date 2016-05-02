"use strict";

var clicker = {};
var data = {};

initStaticData();
if(typeof JSON !== 'object'){
	alert("No json module found in your browser, no fall back at the moment");
}

function initStaticData(){
	data.items = [];
	data.champions = [];
	data.champions.tank = [];
	data.champions.fighter = [];
	data.champions.mage = [];
	data.champions.marksman = [];
	data.champions.assassin = [];
	data.champions.support = [];
};

masteryurl = 'localhost:8001/mastery?playername={0}&region={1}';

//https://stackoverflow.com/questions/610406/javascript-equivalent-to-printf-string-format/4673436#4673436
if (!String.format) {
  String.format = function(format) {
    var args = Array.prototype.slice.call(arguments, 1);
    return format.replace(/{(\d+)}/g, function(match, number) { 
      return typeof args[number] != 'undefined'
        ? args[number] 
        : match
      ;
    });
  };
}

function ClickerSetup(){

	var state = clicker.state = {};
	var started = false;
	var save_time;
	var progression_time;

	clicker.guardQuit = function(){
		var dont_check = void 0;
		if(save_time !== void 0 && new Date().getTime() - save_time < 10000 &&
			progression_time !== void 0 && progression_time > save_time){
			return "You may have unsafed progression. Press the save button before quitting to avoid this message";
		}else{
			return dont_check;
		}
	};
	window.onbeforeunload = clicker.guardQuit;

	function initState(){
		state.pastries = 0;
		state.mastery = {};
		state.champions = {
			amount : [],
			experience : []
		};
		state.upgrades = [];
		state.items = [];
		state.match = {
			is_in_game : false,
			champions : [],
			lanes : {
				top : 0,
				mid : 0,
				bot : 0,
				base : 0,
			},
			is_fighting : false,
			fight : {
				friendlies : [],
				enemies : [],
				exp : 0.0,
				objective : null
			},
			rewards : null
		};
		state.rank = 0;
	};
	function initNewMatch(){
		state.match.lanes = {
			top : 0,
			mid : 0,
			bot : 0,
			base : 0
		};
		state.match.is_fighting = false;
		state.match.rewards = null;
	};

	var startEmpty = function(){
		if(started){ 
			return;
		}
		initState();
		startGame();
		save();
	};
	var startConnectServer = function(name, region){
		if(started){
			return;	
		}
		httpGetAsync(String.format(masteryurl, name, region), function(){
			initState();
			startGame();	
		}, function(){
			alert('Failed to connect to mastery server. Do you want to start without mastery data instead (can be refreshed at any time)?')
		});
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
	function startGame(){
		if(started){
			return;
		}
		started = true;
		setTimeout(loop, 1);
		updateGuiState();
	}
	function endGame(){
		started = false;
		clicker.state = state = {};
		updateGuiState();
	};

	/*
	* Save the game state to be able to restore it
	*/
	var save = function(){
		if(!started){
			console.log("No game in progress to save");
			return;
		}
		save_time = new Date().getTime();
		localStorage.setItem("urfclicker", JSON.stringify(state));
		updateGuiState();
		console.log("Game saved");
	};
	function canLoad(){
		var stored = localStorage.getItem("urfclicker");
		return stored != null && stored != "" && JSON.parse(stored) != null;
	};
	var load = function(){
		if(!canLoad()){
			console.log("Couldn't load game data");
			return false;
		}
		loadGameData(localStorage.getItem("urfclicker"));
		updateGuiState();
		return true;
	};

	var loadGameData = function(json){
		clicker.state = state = JSON.parse(json);
	};
	var deleteGameData = function(){
		if(!confirm("This will stop the current game and delete all data from disk?\nDo really you want to continue?")){
			return;
		}
		endGame();
		localStorage.setItem("urfclicker", null);
		updateGuiState();
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
	button_bake.addEventListener("click", handle_click);
	button_reset.addEventListener("click", function(){
		initState();
		updateGuiState();
	});

	updateGuiState();
	if(canLoad()){
		console.log("Found existing game data, readying load screen before creation screen");
	}

	function updateGuiState(){
		function att(par){return par?true:null};
		button_load.disabled = att(!canLoad());
		button_fresh.hidden = att(started);
		button_start_server.hidden = att(started);
		button_delete.disabled = att(null==localStorage.getItem("urfclicker"));
		button_save.disabled = att(!started);
	};
	/*
	*
	* Game loop stuff from here onwards
	*
	*/
	var handle_click = function(){
		if(!started){
			return;
		}
		state.pastries += 10;
	}

	var buyFunction = function(ident){
		return function(){
			buy(ident);
		};
	};
	var Champion = 0;
	var Upgrade = 1;
	var Item = 2;
	var buy = function(ident){
		progression_time = new Date().getTime();
		if(ident.type == Champion){

		}else if(ident.type == Upgrade){

		}else if(ident.type == Item){

		}else{
			console.log("Received invalid buy request");
			//TODO awards the cheater? achievement
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
		setTimeout(function(){
			if(!started){
				return;
			}
			mainLoop();
			loop();
		}, 100);
	};


	function champion_exp(id){
		return (state.mastery[String(id)] || 0) + (state.champions.experience[id] || 0);
	};
	function champion_level(id){
		xp = champion_exp(id);
		return Math.floor(Math.log(4, xp + 1))
	};
	function champion_hp(amount, id){

	};
	function champion_att(amount, id){

	};
	function champion_def(amount, id){

	};
	function startFight(){
		state.match.champions.forEach(function(num, id){
			champ = {
				id : id,
				max_hp : 0,
			}
			champ.max_hp = champ.hp = champion_hp(num, id);
			state.match.fight.friendlies.push(champ);
		});
		state.match.is_fighting = true;
	};
	function endFight(){

		state.match.is_fighting = false;
	};
};

function httpGetAsync(theUrl, callback, error_callback=null)
{
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.onreadystatechange = function() {
        if (xmlHttp.readyState == 4 && xmlHttp.status == 200){
            if(callback !== null) callback(xmlHttp.responseText);
        }else if(error_callback){
        	if(error_callback !== null) error_callback(xmlHttp);
        }
    }
    xmlHttp.open("GET", theUrl, true); // true for asynchronous 
    xmlHttp.send(null);
}
