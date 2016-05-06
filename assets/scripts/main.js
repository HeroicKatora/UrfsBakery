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

function ClickerSetup($scope, Menu){
	/* http://javascript.crockford.com/private.html */
	var that = this;
	this.started = false; // Primitive, sorry <.<
	this.save_time;
	this.progression_time;

	var state = {};
	var grace_period = 5000;

	function guardQuit(){
		if(that.save_time === undefined || Date.now() - that.save_time > grace_period ||
			(that.progression_time !== undefined && that.progression_time > that.save_time)){
			return "You may have unsafed progression. Press the save button before quitting to avoid this message";
		}else{
			return undefined;
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
		progress();
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
		}else{
			initState();
			startGame();
		}
	};
	var startConnectServer = function(name, region){
		httpGetAsync(String.format(masteryurl, name, region), function(res){
			state.mastery = JSON.parse(res);
		}, function(error){
			alert('Failed to connect to mastery server (Your mastery data can be refreshed at any time).\nWe are sorry, feel free to send a bug report!')
		});
	};
	var startSavedData = function(){
		if(!load()){
			console.log("Couldn't load game data");
			return false;
		}
		if(!that.started){
			startGame();
		}
		return true;
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
		initState();
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
		that.save_time = new Date().getTime();
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
		var loadResult = loadGameData(localStorage.getItem("urfclicker"));
		if(loadResult){
		   	alert("Couldn't load game data:\n" + loadResult);
			return false;
		}
		that.save_time = Date.now();
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
		initState();
		localStorage.setItem("urfclicker", null);
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
		button_load.addEventListener("click", startSavedData);
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
		if(time_passed > grace_period){
			console.log('Made a jump in time, maybe suspended pc, load of an old save etc.');
			console.log(String.format('Old time {0}, new time {1}', state.last_tick, now_date))
			time_passed = grace_period;
		}
		if(time_passed > 0){
			bake(time_passed);
			fight(time_passed);
		}
		state.last_tick = now_date;
		updateGuiState();
	};
	function manual_bake(){
		console.log("Click")
		state.pastries += 10;
	};
	function bake(time_step){
		var pps = 10;
		state.pastries += Math.round(time_step/1000 * pps);

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
	function progress(){
		that.progression_time = Date.now();
	}
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
 	initState();
	this.state = state;
	this.manual_bake = manual_bake;
	this.buy_function = buyFunction;
	this.end_fight = end_fight;
	this.load = load;
	this.save = save;
	this.canLoad = canLoad;
	this.start_connect_server = startConnectServer;
	this.start_empty = startEmpty;
	this.onDomLoaded = onDomLoaded;
	this.to_display = {
	};
	if(!canLoad() || !startSavedData()){
		console.log('Could not load saved data, maybe this is the first play through');
		startEmpty();
	}
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
