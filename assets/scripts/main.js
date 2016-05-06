"use strict";

var data = {};
var ClickerVersion = "0.1";

initStaticData();
if(typeof JSON !== 'object'){
	alert("No json module found in your browser, no fall back at the moment");
}
if(!Date.now){
	Date.now = function(){
		return new Date().getTime();
	}
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

var masteryurl = 'localhost:8001/mastery?playername={0}&region={1}';

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

function ClickerSetup($scope){
	/* http://javascript.crockford.com/private.html */
	var that = this;
	this.started = false; // Primitive, sorry <.<

	var state = {};
	var save_time;
	var progression_time;

	function guardQuit(){
		var dont_check = void 0;
		if(save_time !== void 0 && new Date().getTime() - save_time < 10000 &&
			progression_time !== void 0 && progression_time > save_time){
			return "You may have unsafed progression. Press the save button before quitting to avoid this message";
		}else{
			return dont_check;
		}
	};
	window.onbeforeunload = guardQuit;

	function initState(){
		state.pastries = 0;
		state.max_pastries = 0;
		state.last_tick;
		state.version = ClickerVersion;
		state.mastery = {};
		state.champions = {};
		for(var champ in data.champions){
			state.champions[champ] = {amount: 0, experience: 0};
		}
		state.upgrades = {}; 
		state.items = {};
		state.match = {
			is_in_game : false,
			champions : {},
			in_fight : {},
			lanes : {
				top : 0,
				mid : 0,
				bot : 0,
				base : 0,
			},
			is_fighting : false,
			fight : {
				lane : null,
				friendlies : [],
				enemies : [],
				objective : null
			},
			rewards : null
		};
		state.achievements = {};
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
		if(that.started){ 
			return;
		}
		initState();
		startGame();
		save();
	};
	var startConnectServer = function(name, region){
		if(that.started){
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
		if(!that.started){
			startGame();
		}
	};

	/*
	* Transition the game start and stop edges
	*/
	function startGame(){
		if(that.started){
			return;
		}
		that.started = true;
		setTimeout(loop, 1);
		updateGuiState();
	}
	function endGame(){
		that.started = false;
		state = {};
		updateGuiState();
	};

	/*
	* Save the game state to be able to restore it
	*/
	var save = function(){
		if(!that.started){
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
			console.log("There is no game data to load");
			return false;
		}
		var loadResult = loadGameData(localStorage.getItem("urfclicker")) || function(){
			angular.element(document.body).scope().$digest();
			return null;
		}();
		if(loadResult){
		   	alert("Couldn't load game data:\n" + loadResult);
			return false;
		}
		
		return true;
	};

	var loadGameData = function(json){
		var gameData = JSON.parse(json);
		if(gameData.version != ClickerVersion){
			return "Mismatching versions, unfortunately there is not conversion possible";
		}
		for(var att in gameData){
			state[att] = gameData[att];
		}
		return null;
	};
	var deleteGameData = function(){
		if(!confirm("This will stop the current game and delete all data from disk?\nDo really you want to continue?")){
			return;
		}
		endGame();
		localStorage.setItem("urfclicker", null);
		updateGuiState();
	};
	
/*
* Setting up the display
*/
	function onDomLoaded() {
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
	}

	if(canLoad()){
		console.log("Found existing game data, readying load screen before creation screen");
	}

	function updateGuiState(){
		$scope.$apply(); // Notify angular of possible model changes
	};
/*
*
* Game loop stuff from here onwards
*
*/
	//Logs that some kind of progress took place for the sake of saving and close warning
	function progress(){
		progression_time = new Date().getTime();
	}
	var handle_click = function(){
		if(!that.started){
			return;
		}
		state.pastries += 10;
	}

	var buyFunction = function(ident){
		return function(){
			buy(ident);
		};
	};
	var mainLoop = function(){
		var now_date = Date.now();
		state.last_tick = state.last_tick || now_date - 100;
		var time_passed = now_date - state.last_tick;
		if(time_passed > 0){
			bake(time_passed);
			fight(time_passed);
		}
		state.last_tick = now_date;
		updateGuiState();
	};
	function manual_bake(){
		state.pastries += 10;
	};
	function bake(time_step){
		state.pastries += 1;
	};
	function fight(time_step){
		//This ignores time step for now


	};
	var loop = function(){
		var handle = setInterval(function(){
			if(!that.started){
				clearInterval(handle);
				return;
			}
			mainLoop();
		}, 100);
	};
/*
 * Achievements, items, upgrades, champions, unlockables
 */
	var Champion = 0;
	var Upgrade = 1;
	var Item = 2;
	var buy = function(ident){
		progress();
		if(ident.type == Champion){

		}else if(ident.type == Upgrade){

		}else if(ident.type == Item){

		}else{
			console.log("Received invalid buy request");
			//TODO awards the cheater? achievement
		}
	};

	function unlock_achievement(ident){
		ident.reduce(function(ob, id){
			return ob[id] || (ob[id] = {});
		}, state.achievements);
	}
	
/*
 * Fight related stuff
 */
	function mk_champion_exp(champ){
		champion_id = data.champions[champ].id;
		return (state.mastery[champion_id] || 0) + (state.champions[champ].experience || 0);
	};
	function champion_level(id){
		xp = champion_exp(id);
		return Math.floor(Math.log(4, xp + 1))
	};
	function mk_champion_hp(amount, id, level){
		return 100 + data.champions[id].id;
	};
	function mk_champion_attack(amount, id, level){
		return 100 + data.champions[id].id;
	};
	function mk_champion_defense(amount, id, level){
		return 100 + data.champions[id].id;
	};
	function start_fight(lane, match){
		for(var id in match.champions){
			num = match.champions[id];
			level = champion_level(id);
			if(!num) continue;
			champ = {
				id : id,
				max_hp : 0,
			}
			champ.max_hp = champ.hp = mk_champion_hp(num, id, level);
			champ.attack = mk_champion_attack(num, id, level);
			champ.defense = mk_champion_defense(num, id, level);
			match.fight.friendlies.push(champ);
			match.in_fight[id] = num;
		}
		for(var en_i = 0;en_i < match.lanes[lane] + 2;en_i +=1 ){
		}
		match.fight.lane = lane;
		match.is_fighting = true;
	};
	function end_fight(match){
		wonFight = match.fight.objective.hp <= 0;
		if(wonFight){
			match.lanes[fight.lane] += 1;
		}

		for(var id in state.match.in_fight){
			match.in_fight[id] = 0;
		}
		match.fight.friendlies.length = 0;
		match.fight.enemies.length = 0;
		match.is_fighting = false;
	};
/*
 * Exporting the state
 */
	this.state = state;
	this.manual_bake = manual_bake;
	this.buy_function = buyFunction;
	this.cancel_fight = function(){end_fight(state.match);};
	this.load = load;
	this.save = save;
	this.canLoad = canLoad;
	this.start_connect_server = startConnectServer;
	this.start_empty = startEmpty;
	this.onDomLoaded = onDomLoaded;
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
