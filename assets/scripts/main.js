"use strict";

var ClickerVersion = "0.1";

if(typeof JSON !== 'object'){
	alert("No json module found in your browser, no fall back at the moment");
}
if(!Date.now){
	Date.now = function(){
		return new Date().getTime();
	}
}

var masteryurl = 'http://t-tides.net:8000/mastery?playername={0}&region={1}';
var debug_grain = 3;

function dlog(min_grain){
	if(debug_grain > min_grain)
		console.log.apply(console, arguments);
}

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

/*
 * Updates obj1 with obj2 like a dictionary but deep instead of shallow
 */
function update_object(obj1, obj2){
	for(var prop in obj2){
		if((typeof obj1[prop] == typeof {}) && (typeof obj2[prop] == typeof {})){
			update_object(obj1[prop], obj2[prop]);
		}else{
			obj1[prop] = obj2[prop];
		}
	}
}

/*
 * Uses an object as a path storage
 */
function retrieve_object(object, path, create=true){
	return path.reduce(function(ob, id){
		if(create) {
			return ob[id] || (ob[id] = {});
		}else{
		   	return ob && ob[id];
		}
	}, object);
}

/**
 * Store an object in a path storage and returns the object stored
 */
function store_object(object_base, path, data){
	if(!path.length) return false;
	var prop = path[0];
	var rest = path.slice(1);
	if(!rest.length) {
		return object_base[prop] = data;
	}
	if(typeof object_base[prop] !== typeof {})
		object_base[prop] = {};
	return store_object(object_base[prop], rest, data);
}

/**
 * Increments the counter in the object and returns the new value
 */
function increment_count(object_base, path, amount = 1){
	var count = retrieve_object(object_base, path, false) || 0;
	return store_object(object_base, path, count + amount);
}

/*
 * Counts the number of sub objects for which the predicate is fulfilled
 */
function count_object(object_base, fn){
	var count = 0;
	for(var sub in object_base){
		if(fn(sub, object_base[sub]))
			count += 1;
	}
	return count;
}

data.achievement_map = {};
data.item_map = {};
data.upgrade_map = {};
data.items.forEach(function(item){
	store_object(data.item_map, item.identifier, item);
});
data.upgrades.forEach(function(upgrade){
	store_object(data.upgrade_map, upgrade.identifier, upgrade);
});
data.achievements.forEach(function(achievement){
	store_object(data.achievement_map, achievement.identifier, achievement);
});

data.champions.all = ['tank', 'fighter', 'mage', 'marksman', 'assassin', 'support'].reduce(function(list, type){
	return list.concat(data.classes[type].champions);
}, []);
data.champions.byNbr = [];
data.champions.all.forEach(function(champName){
	var champ = data.champions.map[champName];
	data.champions.byNbr[champ.numeric_id] = champ;
});

data.buffs = {'baron':{
	identifier : 'baron',
	name: 'Baron Nashor',
	type: 'hybrid',
	base_hp : 12000,
	base_attack : 100,
	base_magic_res : 40,
	base_armor : 70}
};


var __debug;

function ClickerSetup($scope, Menu){
	/* http://javascript.crockford.com/private.html */
	var that = this;
	__debug = this;
	this.started = false; // Primitive, sorry <.<
	this.save_time;
	this.progression_time;

	var state = {};
	var grace_period = 10000;
	var fighter_type = {physical: 'physical', magical: 'magical', hybrid: 'hybrid'};

	function guardQuit(){
		if(that.save_time === undefined || Date.now() - that.save_time > grace_period ||
			(that.progression_time !== undefined && that.progression_time > that.save_time)){
			return "You may have unsafed progression. Press the save button before quitting to avoid this message";
		}else{
			return undefined;
		}
	};
	window.onbeforeunload = guardQuit;

	function guardReset(){
		var req;
		return (req = guardQuit()) && !confirm(req);
	}

	function initState(){
		state.pastries = 0;
		state.max_pastries = 0;
		state.last_tick;
		state.version = ClickerVersion;
		state.mastery = {
			last_refreshed: undefined,
			data: []
		};
		state.champions = {};
		for(var champ in data.champions.map){
			state.champions[champ] = {amount: 0, experience: 0};
		}
		state.upgrades = {}; 
		state.items = {};
		var match = retrieve_object(state, ['match']);
		match.is_in_game = false;
		match.champions = {};
		match.in_fight = {};
		match.lanes = {
			top : 0,
			mid : 0,
			bot : 0,
			base : 0,
		};
		match.lane_hp = {
			top : 0,
			mid : 0,
			bot : 0,
			base : 0,
		};
		match.is_fighting = false;
		match.fight = {
			lane : undefined,
			friendlies : [],
			enemies : [],
			objective : function(){return state.match.fight.enemies[0] || {hp: -1};} 
		};
		match.rewards = undefined;
		state.buffs = {};
		state.achievements = {};
		state.rank = 0;
		state.stats = {};
		progress();
		Menu.openMenu('mastery');
	};
	function initNewMatch(){
		state.match.lanes = {
			top : 0,
			mid : 0,
			bot : 0,
			base : 0
		};
		state.match.is_fighting = false;
		state.match.rewards = undefined;
	};

	var startEmpty = function(){
		if(that.started){ 
			guardReset();
			initState();
		}else{
			initState();
			startGame();
		}
	};
	function refresh_mastery(name, region){
		console.log('Refreshing mastery for '+name+' in region '+region);
		httpGetAsync(String.format(masteryurl, name, region), function(res){
			var update = JSON.parse(res);
			state.mastery.last_refreshed = new Date().getTime();
			state.mastery.data.length = 0; // Clear
			for(var idx in update) {
				state.mastery.data[idx] = update[idx];
			}
			state.summoner = name;
			state.region = region;
			console.log('Refreshed mastery data');
			Menu.addMessage('Refreshed mastery data');
		}, function(error){
			alert('Failed to connect to mastery server (Your mastery data can be refreshed at any time).\nWe are sorry, feel free to send a bug report!')
		});
	};
	var startSavedData = function(){
		if(!load()){
			console.log("Couldn't load game data");
			Menu.addMessage('Loading has failed. Sorry!');
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
	}
	function endGame(){
		that.started = false;
		initState();
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
		console.log("Game saved");
		Menu.addMessage("Saved");
	};
	function canLoad(){
		var stored = localStorage.getItem("urfclicker");
		return stored != null && stored != "" && JSON.parse(stored) != null;
	};
	function load(){
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
		update_object(state, gameData);
		return null;
	};
	var deleteGameData = function(){
		if(!confirm("This will stop the current game and delete all data from disk?\nDo really you want to continue?")){
			return;
		}
		initState();
		localStorage.setItem("urfclicker", null);
	};
	function reset(){
		if(guardReset()) return;
		initState();
	}
	
/*
* Setting up the display
*/

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
	var mainLoop = function(){
		var now_date = Date.now();
		state.last_tick = state.last_tick || now_date - 100;
		var time_passed = now_date - state.last_tick;
		if(time_passed > grace_period){
			console.log('Made a jump in time, maybe suspended pc, load of an old save etc.');
			console.log(String.format('Missed {0} milliseconds', now_date - state.last_tick ));
			Menu.addMessage(String.format('Skipped {0} seconds of game time', ((now_date - state.last_tick)/1000).toFixed(3)));
			time_passed = grace_period;
		}
		if(time_passed > 0){
			bake(time_passed);
			fight(time_passed);
		}
		state.last_tick = now_date;
		updateGuiState();
	};
	function manual_bake(event){
		var amount = 1;

		var marksman_buff = count_sub_upgrades(['class', 'marksman', 'produced']);
		var marksman_count = amount_champion_type('marksman');
		amount *= (1 + 0.5*marksman_count * Math.pow(2, marksman_buff));
		var clicking_amount = count_sub_upgrades(['user', 'clicking']);
		amount += calculate_pps() * 0.05 * clicking_amount;

		increment_count(state.stats, ['manual_bake'], amount);
	
		increment_count(state.stats, ['user', 'clicking'], amount);
		var baked = retrieve_object(state.stats, ['user', 'clicking']);
		if(baked >= 1e0) unlock_achievement(['user', 'clicking', '0']);
		if(baked >= 1e2) unlock_achievement(['user', 'clicking', '1']);
		if(baked >= 1e4) unlock_achievement(['user', 'clicking', '2']);
		if(baked >= 1e6) unlock_achievement(['user', 'clicking', '3']);
		if(baked >= 1e9) unlock_achievement(['user', 'clicking', '4']);
		if(baked >= 1e12) unlock_achievement(['user', 'clicking', '5']);
		if(baked >= 1e15) unlock_achievement(['user', 'clicking', '6']);
		if(baked >= 1e18) unlock_achievement(['user', 'clicking', '7']);
		if(baked >= 1e21) unlock_achievement(['user', 'clicking', '8']);
		if(baked >= 1e24) unlock_achievement(['user', 'clicking', '9']);
		Menu.spawnParticle(event.pageX, event.pageY, 'app/components/game/particleClick.htm', {pastries: amount});
		state.pastries += amount;
	};

	/*
	 * Baking
	 */
	function pps_champion(ident){
		var pps = data.champions.map[ident].base_production;
		pps *= (1 + count_unlock(retrieve_object(state.upgrades, ['champion', ident, 'number'])));
		var champ_amou = amount_champion(ident);
		var champ_match = state.match.champions[ident] || 0;
		var champ_fight = state.match.in_fight[ident] || 0;
		pps *= (champ_amou-champ_match) + (champ_match - champ_fight) * 0.3 + champ_fight * 0.1;
		return pps;
	}

	function add_class_pastries(ch_type, amount){
		var total = increment_count(state.stats, ['class', ch_type, 'produced'], amount);

		if(total >= 1e3) unlock_achievement(['class', ch_type, 'produced', 0]);
		if(total >= 1e6) unlock_achievement(['class', ch_type, 'produced', 1]);
		if(total >= 1e9) unlock_achievement(['class', ch_type, 'produced', 2]);
		if(total >= 1e12) unlock_achievement(['class', ch_type, 'produced', 3]);
	}
	function calculate_pps(){
		var pps = 0;
		for(var champid in data.champions.map){
			var pps_champ = pps_champion(champid);
			pps += pps_champ;
		}
		var support_count = amount_champion_type('support');
		var support_buff = count_sub_upgrades(['class', 'support', 'produced']);

		pps *= (1 + 0.001 * support_count * Math.pow(2, support_buff));
		return pps;
	}

	function bake(time_step){
		var pps = calculate_pps();
		state.pastries += time_step/1000 * pps;

	};

	/*
	 * Fighting
	 */
	function lives_entity(entity){
		return entity.hp > 0;
	}
	function damage_entity_physical(entity, damage){
		damage *= 100/(100+entity.armor);
		entity.hp -= damage;
		return damage;
	}
	function damage_entity_magic(entity, damage){
		damage *= 100/(100+entity.magic_res);
		entity.hp -= damage;
		return damage;
	}
	function damage_split(fighter_t){
		var split = {};
		split[fighter_type.magical] = 0;
		split[fighter_type.hybrid] = 0.5;
		split[fighter_type.physical] = 1;
		return split[fighter_t];
	}
	function damage_of_entity(entity){
		if(!entity) return {physical: 0, magical: 0};
		var damage = entity.attack;
		var ph_p = damage_split(entity.type);
		var mg_p = 1-ph_p;
		return {physical: ph_p * damage, magical: mg_p * damage};
	}
	function fight(time_step){
		//This ignores time step for now
		var match = state.match;
		if(!match.is_fighting){
			var passive_exp = 0.1 * time_step / 1000;

			var fighter_buff = count_sub_upgrades(['class', 'fighter', 'produced']);
			var fighter_bonus = (1 + 0.1 * amount_champion_type('fighter') * Math.pow(2, fighter_buff));
			passive_exp *= state.rank * fighter_bonus;

			var exp_upgrades = count_sub_upgrades(['experience', 'total']);
			passive_exp *= Math.pow(1.5, exp_upgrades);

			for(var champid in state.match.champions){
				if(!state.match.champions) continue;
				add_experience(champid, passive_exp, ' farming in a lane');
			}
			//Farm
		}else{
			if(!match.fight.friendlies.length || match.fight.objective().hp <= 0){
				var push = end_fight(match);
				console.log('Fight is over');
				if(push < 0){
					console.log('You lost');
					Menu.addMessage('You just lost a fight');
				}else{
					console.log('You won');
					Menu.addMessage('You just won a fight');
				}
				if(push >= 7){
					win_match();
				}
			}else{
				var fightspeed = 1/50;
				match.fight.friendlies.forEach(function(champ){
					var target = match.fight.enemies[Math.floor(Math.random()*match.fight.enemies.length)];
					dlog(2, target, 'attacked by', champ);
					var damage_buffs = count_sub_upgrades(['champion', champ.champ_id, 'damage_dealt']);
					var damage_mult = Math.pow(2, damage_buffs);

					var damage = damage_of_entity(champ) ;
					var ph_dmg = damage.physical * fightspeed * damage_mult;
					var mg_dmg = damage.magical * fightspeed * damage_mult;
					var ph_damage_done = damage_entity_physical(target, ph_dmg);
					var mg_damage_done = damage_entity_magic(target, mg_dmg);
					deal_damage(champ.champ_id, ph_damage_done + mg_damage_done);
				});
				match.fight.enemies.forEach(function(enemy){
					var target = match.fight.friendlies[Math.floor(Math.random()*match.fight.friendlies.length)];
					dlog(2, target, 'attacked by', enemy);
					var defense_bufs = count_sub_upgrades(['champion', target.champ_id, 'damage_received']);
					var defense_mult = Math.pow(0.5, defense_bufs);
					var damage = damage_of_entity(enemy);

					var ph_dmg = damage.physical * fightspeed * defense_mult;
					var mg_dmg = damage.magical * fightspeed * defense_mult;
					var ph_damage_received = damage_entity_physical(target, ph_dmg);
					var mg_damage_received = damage_entity_magic(target, mg_dmg);
					received_damage(target.champ_id, ph_damage_received+mg_damage_received);
				});
				match.fight.friendlies = match.fight.friendlies.filter(lives_entity);
				match.fight.enemies = match.fight.enemies.filter(function(enemy){
					if(!lives_entity(enemy)){
						var exp_bonus = enemy.experience;
						match.fight.friendlies.forEach(function(ch){
							var ident = ch.champ_id;
							var exp = exp_bonus / match.fight.friendlies.length;

							var assassin_buff = count_sub_upgrades(['class', 'assassin', 'produced']);
							var assassin_count = amount_champion_type('assassin');
							exp *= (1 + 0.1 * assassin_count * Math.pow(2, assassin_buff));

							var exp_upgrades = count_sub_upgrades(['experience', 'total']);
							exp *= Math.pow(1.5, exp_upgrades);

							add_experience(ident, exp, ' defeating '+enemy.name);
						});
						return false;
					}
					return true;
				});
			}
		}
	};

	function deal_damage(champion, amount){
		var dmg_done = increment_count(state.stats, ['champion', champion, 'damage_dealt'], amount);
		if(dmg_done >= 1e3) unlock_achievement(['champion', champion, 'damage_dealt', 0]);
		if(dmg_done >= 1e6) unlock_achievement(['champion', champion, 'damage_dealt', 1]);
		if(dmg_done >= 1e9) unlock_achievement(['champion', champion, 'damage_dealt', 2]);
		if(dmg_done >= 1e12) unlock_achievement(['champion', champion, 'damage_dealt', 3]);
	}


	function received_damage(champion, amount){
		var dmg_received = increment_count(state.stats, ['champion', champion, 'damage_received'], amount);
		if(dmg_received >= 1e3) unlock_achievemt(['champion', champion, 'damage_received', 0]);
		if(dmg_received >= 1e6) unlock_achievemt(['champion', champion, 'damage_received', 1]);
		if(dmg_received >= 1e9) unlock_achievemt(['champion', champion, 'damage_received', 2]);
		if(dmg_received >= 1e12) unlock_achievemt(['champion', champion, 'damage_received', 3]);
	}

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
	function cost_champion(ident){
		var cost = data.champions.map[ident].base_cost;
		cost = Math.pow(1.15, amount_champion(ident)) * cost;

		var tank_buff = count_sub_upgrades(['class', 'tank', 'produced']);
		var tank_count = amount_champion_type('tank');
		cost *= 1/(1 + 0.1*tank_count * Math.pow(2, tank_buff));
		return cost;
	}

	function cost_upgrade(ident){
		var cost = retrieve_object(data.upgrade_map, ident).base_cost;
		var mage_count = amount_champion_type('mage');

		var mage_buff = count_sub_upgrades(['class', 'tank', 'produced']);
		cost *= 1/(1 + 0.1*mage_count * Math.pow(2, mage_buff));
		return cost;
	}

	function cost_item(ident){
		var cost = retrieve_object(data.item_map, ident).base_cost;
		cost = Math.pow(1.2, amount_item(ident)) * cost;

		var assassin_count = amount_champion_type('assassin');
		cost *= 1/(1 + 0.1*assassin_count);
		return cost;
	}

	function amount_champion(ident){
		return state.champions[ident].amount;
	}
	function match_champion(ident){
		return state.match.champions[ident] || 0;
	}
	function fight_champion(ident){
		return state.match.in_fight[ident] || 0;
	}

	function amount_item(ident){
		return state.items[ident].ident;
	}

	function add_experience(ident, amount, reason){
		var total_farmed = increment_count(state.stats, ['experience', 'total'], amount);
		if(total_farmed >= 1e3) unlock_achievement(['experience', 'total', 0]);
		if(total_farmed >= 1e5) unlock_achievement(['experience', 'total', 1]);
		if(total_farmed >= 1e7) unlock_achievement(['experience', 'total', 2]);
		if(total_farmed >= 1e9) unlock_achievement(['experience', 'total', 3]);
		if(total_farmed >= 1e11) unlock_achievement(['experience', 'total', 4]);

		var level_pre = champion_level(ident);
		state.champions[ident].experience += amount;
		var level_post = champion_level(ident);
		if(level_post > level_pre){
			Menu.addMessage(data.champions.map[ident].name + ' gained level ' + level_post + (reason? (' by ' + reason) : ''));
		}
	}

	function amount_champion_type(type){
		return data.classes[type].champions.reduce(function(counter, champ){return counter+amount_champion(champ);}, 0);
	}
	
	function amount_champion_type_match(type){
		return data.classes[type].champions.reduce(function(counter, champ){return counter+match_champion(champ);}, 0);
	}

	function buy_champion(ident){
		var costs = cost_champion(ident);
		if(costs > state.pastries){
			console.log('Not enough to buy');
			return;
		}
		state.pastries -= costs;
		state.champions[ident].amount = amount_champion(ident) + 1;
		var amount = state.champions[ident].amount;
		if(amount >= 5) unlock_achievement(['champion', ident, 'number', 0]);
		if(amount >= 10) unlock_achievement(['champion', ident, 'number', 1]);
		if(amount >= 25) unlock_achievement(['champion', ident, 'number', 2]);
		if(amount >= 50) unlock_achievement(['champion', ident, 'number', 3]);
		if(amount >= 75) unlock_achievement(['champion', ident, 'number', 4]);
		if(amount >= 100) unlock_achievement(['champion', ident, 'number', 5]);
		if(amount >= 120) unlock_achievement(['champion', ident, 'number', 6]);
		progress();
	};
	function buy_item(ident){
		var costs = cost_item(ident);
		if(costs > state.pastries){
			console.log('Not enough to buy');
			return;
		}
		state.pastries -= costs;
		state.champions[ident].amount = amount_champion(ident) + 1;
		progress();
	}

	function buy_upgrade(ident){
		var costs = cost_upgrade(ident);
		if(costs > state.pastries){
			console.log('Not enough to buy');
			return;
		}
		state.pastries -= costs;
		unlock_upgrade(ident);
		progress();
	}


	function unlock_achievement(ident){
		var achievement_object = retrieve_object(state.achievements, ident, true);
		if(!achievement_object['unlocked']){
			var name = retrieve_object(data.achievement_map, ident).name;
			Menu.addMessage('You have unlocked an achievement:\n'+(name?name:ident));
		}
		achievement_object['unlocked'] = true;
	}
	function has_achievement(ident){
		return (retrieve_object(state.achievements, ident, false) || {unlocked : false}).unlocked;
	}

	function can_unlock_upgrade(ident){
		if(!ident) return false;
		return has_achievement(ident);

		//Short circuit for now as now other logic is reasonable right now
		var category = ident[0];
		if(category == 'champion'){
			return has_achievement(ident);
		}else if(category == 'type'){
			return has_achievement(ident);
		}else if(category == 'bakery'){
		}
	}

	function unlock_upgrade(ident){
		retrieve_object(state.upgrades, ident, true)['unlocked'] = true;
	}
	function has_upgrade(ident){
		return (retrieve_object(state.upgrades, ident, false) || {unlocked : false}).unlocked;
	}

	function count_unlock(obj){
		return count_object(obj, function(_,sub){return sub['unlocked'];});
	}	

	function count_sub_upgrades(ident){
		return count_unlock(retrieve_object(state.upgrades, ident));
	}

	function champion_skin(ident){
		var upg = -1;
		var skin = String.format('http://ddragon.leagueoflegends.com/cdn/img/champion/loading/{0}_0.jpg', ident);
		for(var upgrade in retrieve_object(state.upgrades, ['champion', ident, 'number'])){
			if(upgrade > upg && has_upgrade(['champion', ident, 'number', upgrade])){
				upg = upgrade;
				skin = retrieve_object(data.upgrade_map, ['champion', ident, 'number', upgrade]).skin;
			}
		}
		return skin;
	}
	
/*
 * Fight related stuff
 */
	function can_move_match(ident){
		return !state.match.is_in_game && (state.match.champions[ident] || 0) < amount_champion(ident);
	}
	function move_match(ident){
		if(state.match.is_in_game){
			var error = "You are currently in a game";
			console.log(error);
			return error;
		}
		if(!can_move_match(ident)){
			var error = "You don't have enough champions to move one to a match";
			console.log(error);
			return error;
		}
		increment_count(state.match.champions, [ident], 1);
	}
	function can_move_bake(ident){
		return !state.match.is_in_game && state.match.champions[ident] && state.match.champions[ident] > (state.match.in_fight[ident] || 0);
	}
	function move_bake(ident){
		if(state.match.is_in_game){
			var error = "You are currently in a game";
			console.log(error);
			return error;
		}
		var error = null;
		if(!state.match.champions[ident]){
			error = "This champion does not participate in the match";
		}
		if(state.match.champions[ident] <= (state.match.in_fight[ident] || 0)){
			error = "Your champion is completely busy fighting at the moment";
		}
		if(error){
			console.log(error);
			Menu.addMessage(error);
			return error;
		}
		state.match.champions[ident] -= 1;
	}

	function champion_exp(champ){
		var champion_id = data.champions.map[champ].numeric_id;
		var mastery_exp = (state.mastery.data[champion_id] || {championPoints : 0}).championPoints;
		return mastery_exp + (state.champions[champ].experience || 0);
	};
	function champion_level(id){
		var xp = champion_exp(id);
		if(xp < 1800) return 1;
		if(xp < 6000) return 2;
		if(xp < 12600) return 3;
		if(xp < 21600) return 4;
		if(xp < 33000) return 5;
		if(xp < 46800) return 6;
		return Math.floor(Math.log(xp/46800)/Math.log(1.25)) + 7;
	};

	function exp_for_level(level){
		if(level == 1) return 0;
		if(level == 2) return 1800;
		if(level == 3) return 6000;
		if(level == 4) return 12600;
		if(level == 5) return 21600;
		if(level == 6) return 33000;
		if(level == 7) return 46800;
		return Math.pow(1.25, level - 7) * 46800;
	}
	function mk_champion_hp(id){
		return data.champions.map[id].base_hp;
	};
	function mk_champion_attack(id){
		return data.champions.map[id].base_attack;
	};
	function mk_champion_armor(id){
		return data.champions.map[id].base_armor;
	};
	function mk_champion_mr(id){
		return data.champions.map[id].base_mr;
	}
	var champion_type = {'tank': fighter_type.hybrid,
						'fighter': fighter_type.physical,
						'mage': fighter_type.magical,
						'marksman': fighter_type.physical,
						'assassin': fighter_type.hybrid,
						'support': fighter_type.magical};
	function can_start_fight(match, lane){
		var match = state.match;
		if(!lane || match.is_fighting || (lane == 'base' && (match.lanes.bot < 4 && match.lanes.mid < 4 && match.lanes.top < 4))){
			return false;
		}
		return true;
	}
	function start_fight(lane){
		var match = state.match;
		if(!count_object(match.champions, function(_,c){return c;})){
			Menu.addMessage('You need at least one champion in the match to start a fight. Add one in the menu below.');
			return;
		}
		if(match.is_fighting){
			console.log('There is already a fight happening');
			return;
		}
		if(!can_start_fight(match, lane)){
			var error = String.format('You can\'t attack at {0} yet, clear other objectives first', lane);
			console.log(error);
			Menu.addMessage(error);
			return;
		}
		for(var id in match.champions){
			var num = match.champions[id];
			var level = champion_level(id);
			if(!num) continue;
			var champ = {
				champ_id : id,
				max_hp : 0,
			}
			champ.friendly = true;
			champ.type = champion_type[data.champions.map[id].ch_class];
			var hp = mk_champion_hp(id);
			var att = mk_champion_attack(id);
			var armor =  mk_champion_armor(id);
			var mr =  mk_champion_mr(id);
			var level_bonus = (1 + 0.3 * (level-1) * (level-1));
			var num_bonus = Math.sqrt(num);
			champ.max_hp = champ.hp = hp * level_bonus * num_bonus;
			champ.attack = att * level_bonus * num_bonus;
			champ.armor = armor * level_bonus * num_bonus;
			champ.magic_res = mr * level_bonus * num_bonus;
			champ.icon_href = data.champions.map[id].imghref;
			match.fight.friendlies.push(champ);
			match.in_fight[id] = num;
		}

		function mk_enemy(name_i, type_i, hp_i, attack_i, armor_i, magic_res_i, exp_i, icon_href){
			return {name : name_i,
				type :type_i,
				hp : hp_i,
				max_hp : hp_i,
				attack : attack_i,
				armor : armor_i,
				magic_res : magic_res_i,
				experience: exp_i,
				friendly : false,
				icon_href : icon_href};
		}
		if(lane.startsWith('buff_')){
			var buffname = lane.substring(5);
			var buff = data.buffs[buffname];
			if(!buff) return "Could not find specified buff";
			var base_hp = buff.base_hp;
			var slay_count = retrieve_object(state.stats, ['buffs_slain', buffname], false) || 0;
			var base_attack = buff.base_attack * Math.pow(1.15, slay_count);
			var base_armor = buff.base_armor * Math.pow(1.05, slay_count);
			var base_mr = buff.base_magic_res * Math.pow(1.10, slay_count);
			var base_exp = buff.base_exp * (1 + slay_count/4);
			var objective = mk_enemy(buff.name, buff.type, base_hp, base_attack, base_armor, base_mr, base_exp, buff.imghref);
			match.fight.enemies.push(objective);
		}else{
			var push = match.lanes[lane] + (lane == 'base'?4:0);
			var chance = 0.1 + push * (0.9 / 9);
			var enm_list = Array.apply(null, Array(5)).map(function (_, i) {return i;});
			var tower_base_stats = {
				0: {name: 'Tier 1 tower', hp: 1000, attack: 100, armor: 100, mr: 50, exp: 200},
				1: {name: 'Tier 2 tower', hp: 1500, attack: 100, armor: 100, mr: 50, exp: 200},
				2: {name: 'Inhibitor tower', hp: 2000, attack: 100, armor: 100, mr: 50, exp: 200},
				3: {name: 'Inhibitor', hp: 2000, attack: 0, armor: 100, mr: 50, exp: 200},
				4: {name: 'Base tower 1', hp: 3000, attack: 100, armor: 100, mr: 50, exp: 200},
				5: {name: 'Base tower 2', hp: 3000, attack: 100, armor: 100, mr: 50, exp: 200},
				6: {name: 'Nexus', hp: 4000, attack: 0, armor: 100, mr: 50, exp: 200}
			}
			var push_mul = Math.pow(1.1, push);
			var rank_mul = Math.pow(1.6, state.rank);
			{//Tower
				var towerhref = 'assets/img/tower.png';
				var tower_stat = tower_base_stats[push];
				var tower_name = tower_stat.name;
				var tower_hp = tower_stat.hp * rank_mul *  push_mul; 
				var tower_attack = tower_stat.attack * rank_mul * push_mul;
				var tower_armor = tower_stat.armor * rank_mul * push_mul;
				var tower_mr = tower_stat.mr * rank_mul * push_mul;
				var tower_exp = tower_stat.exp * (1 + push/7) * (1 + state.rank);
				var tower_type = fighter_type.physical;
				var objective = mk_enemy(tower_name, tower_type, tower_hp, tower_attack, tower_armor, tower_mr, tower_exp, towerhref);
				if(match.lane_hp[lane] > 0){
					objective.hp = match.lane_hp[lane];
				}
				match.fight.enemies.push(objective);
			}
			for(var enm_id in enm_list){
				if(Math.random() > chance) continue;
				var rnd_champ = data.champions.all[Math.floor(Math.random() * data.champions.all.length)];
				console.log('Adding enemy champion', rnd_champ);
				var enm_champ = data.champions.map[rnd_champ];
				var enm_name = enm_champ.name;
				var enm_type = champion_type[enm_champ.ch_class];
				var enm_hp = enm_champ.base_hp * rank_mul * push_mul;
				var enm_attack = enm_champ.base_attack * rank_mul * push_mul;
				var enm_armor = enm_champ.base_armor * rank_mul * push_mul;
				var enm_mr = enm_champ.base_mr * rank_mul * push_mul;
				var enm_exp = 100;
				match.fight.enemies.push(mk_enemy(enm_name, enm_type, enm_hp, enm_attack, enm_armor, enm_mr, enm_exp, enm_champ.imghref));
			}
			
		}
		match.fight.lane = lane;
		match.is_fighting = true;
	};
	function end_fight(){
		var match = state.match;
		var wonFight = match.fight.objective().hp <= 0;
		var push = 0;
		var lane = match.fight.lane;
		if(wonFight){
			if(String(lane).startsWith('buff_')){ 
				var buffname = lane.substring(5);
				state.buffs[buffname] = (state.buffs[buffname] || 0) + 1;
				increment_count(state.stats, ['buffs_slain', buffname]);
			}else if(lane != 'base'){
				push = (match.lanes[lane] += 1);
				match.lane_hp[lane] = match.fight.objective().hp;
			}else{
				push = (match.lanes.base += 1) + 4;
				match.lane_hp[lane] = match.fight.objective().hp;
			}
		}

		for(var id in state.match.in_fight){
			match.in_fight[id] = 0;
		}
		match.fight.friendlies.length = 0;
		match.fight.enemies.length = 0;
		match.is_fighting = false;
		if(!wonFight) return -1;
		return push;
	};
	function win_match(){
		state.rank += 1;
		state.match.lanes = {top:0,mid:0,bot:0,base:0};
		var min_pastries = calculate_pps() * 1e2;
		var max_pastries = calculate_pps() * 1e6;
		var pastries = state.pastries * 0.1;
		state.match.rewards = {pastries: Math.max(min_pastries, Math.min(max_pastries, pastries))};
		state.match.is_in_game = false;
		Menu.addMessage('You won a Match, collect your reward now!');
	}
	function cancel_match(){
		if(state.match.is_fighting){
			end_fight();
		}
		state.match.lanes = {top: 0, mid:0, bot:0, base:0};
		state.match.rewards = undefined;
		state.match.is_in_game = false;
		Menu.addMessage('You have forfeited a game, try again when you think you can beat it');
	}

	function collect_rewards(){
		if(!state.match.rewards){
			return;
		}
		state.pastries += state.match.rewards.pastries;
		state.match.rewards = undefined;
	}

	function start_match(){
		if(state.match.rewards){
			return "You still have rewards left to collect";
		}
		state.match.is_in_game = true;
	}
/*
 * Exporting the state
 */
	function display_rank(){
		var league = function(rank){
			if(rank < 5) return "bronze";
			if(rank < 10) return "silver";
			if(rank < 15) return "gold";
			if(rank < 20) return "platin";
			if(rank < 25) return "diamond";
			if(rank < 26) return "master";
			return "challenger";
		}(state.rank);
		var tier = function(tier){
			if(tier == 0) return 'v';
			if(tier == 1) return 'iv';
			if(tier == 2) return 'iii';
			if(tier == 3) return 'ii';
			return 'i';
		}(state.rank % 5);
		if(league == 'challenger')
			return 'assets/img/challenger.png';
		if(league == 'master')
			return 'assets/img/master.png';
		return String.format('assets/img/{0}_{1}.png', league, tier);
	}
	function id(a){return a;}
	function item_disp(item){
		var disp = JSON.parse(JSON.stringify(item));
		disp.display = function(){return true;};
		disp.costs = cost_item.bind(this, item.identifier);
		return disp;
	}
	function achievement_disp(achievement){
		var disp = JSON.parse(JSON.stringify(achievement));
		disp.has_achievement = has_achievement.bind(this, achievement.identifier);
		return disp;
	}
	function upgrade_disp(upgrade){
		var disp = JSON.parse(JSON.stringify(upgrade));
		disp.display = can_unlock_upgrade.bind(this, upgrade.identifier);
		disp.image = function(){return upgrade.imghref;};
		disp.costs = cost_upgrade.bind(this, upgrade.identifier);
		disp.has_upgrade = has_upgrade.bind(this, upgrade.identifier);
		disp.buy_upgrade = buy_upgrade.bind(this, upgrade.identifier);
		return disp;
	}
	function champ_disp(id){
		var disp = JSON.parse(JSON.stringify(data.champions.map[id]));
		disp.display = function(){return true;};
		disp.can_buy = function(){return disp.costs() <= state.pastries};
		disp.champion_skin = champion_skin.bind(this, id);

		disp.amount = amount_champion.bind(this, id);
		disp.amount_match = match_champion.bind(this, id);
		disp.amount_fight = fight_champion.bind(this, id);
		disp.level = champion_level.bind(this, id);
		disp.experience = champion_exp.bind(this, id); 
		disp.earned_experience = function(){return state.champions[id].experience;};
		disp.totalpps = pps_champion.bind(this, id);

		disp.costs = cost_champion.bind(this, id);
		disp.buy = buy_champion.bind(this, id);
		disp.can_move_match = can_move_match.bind(this, id);
		disp.move_match = move_match.bind(this, id);
		disp.can_move_bake = can_move_bake.bind(this, id);
		disp.move_bake = move_bake.bind(this, id);
		return disp;
	}
	function classes_disp(type) {
		return {
			name : type.name,
			descr : type.description,
			icon_href : type.icon_href,
			icon_x : type.icon_x,
			icon_y : type.icon_y,
			champions : type.champions.map(champ_disp),
			amount : amount_champion_type.bind(this, type.identifier),
			amount_match : amount_champion_type_match.bind(this, type.identifier)
		}
	}
	function lanes_disp(){
		var lanes = {'top':{name:'Top lane'}, 
					'mid':{name:'Mid lane'}, 
					'bot':{name:'Bot lane'}, 
					'base':{name:'Base structures'}, 
					'buff_baron':{name:'Baron buff'}};
		for(var lane in lanes){
			lanes[lane].can_fight = can_start_fight.bind(this, lane);
			lanes[lane].start_fight = start_fight.bind(this, lane);
		}
		return lanes;
	}
 	initState();
	this.data = data;
	this.refresh_mastery = refresh_mastery;
	this.state = state;
	this.pastries_per_second = calculate_pps;
	this.manual_bake = manual_bake;

	this.can_start_fight = can_start_fight;
	this.start_fight = start_fight;
	this.end_fight = end_fight;
	this.start_match = start_match;
	this.cancel_match = cancel_match;
	this.collect_rewards = collect_rewards;
	this.show_fight = function(){return state.match.is_fighting;};
	this.show_reward = function(){return state.match.rewards != undefined;};
	this.show_start_match = function(){return !state.match.is_in_game && state.match.rewards == undefined;};
	this.show_start_fight = function(){return state.match.rewards == undefined && state.match.is_in_game && !state.match.is_fighting;};
	this.show_end_fight = function(){return state.match.is_fighting;};
	this.show_cancel_match = function(){return state.match.is_in_game};

	this.load = load;
	this.save = save;
	this.reset = reset;
	this.deleteData = deleteGameData;
	this.canLoad = canLoad;
	this.start_empty = startEmpty;
	this.to_display = {
		upgrades : data.upgrades.map(upgrade_disp),
		items : data.items.map(item_disp),
		classes : {
			tank: classes_disp(data.classes.tank),
			fighter: classes_disp(data.classes.fighter),
			mage: classes_disp(data.classes.mage),
			marksman: classes_disp(data.classes.marksman),
			assassin: classes_disp(data.classes.assassin),
			support: classes_disp(data.classes.support)
		},
		lanes : lanes_disp(),
		achievements : data.achievements.map(achievement_disp)
	};
	this.exp_for_level = exp_for_level;
	this.rank = display_rank;
	if(!canLoad() || !startSavedData()){
		console.log('Could not load saved data, maybe this is the first play through');
		startEmpty();
	}else{
		Menu.addMessage('Loaded saved data automatically');
	}
};

function httpGetAsync(theUrl, callback, error_callback=null)
{
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.onreadystatechange = function() {
        if (xmlHttp.readyState == 4 && xmlHttp.status == 200){
            if(callback !== null) callback(xmlHttp.responseText);
        }else if(xmlHttp.readyState == 4 && error_callback){
        	if(error_callback !== null) error_callback(xmlHttp);
        }
    }
    xmlHttp.open("GET", theUrl, true); // true for asynchronous 
	try{
    	xmlHttp.send(null);
	}catch(err){
		alert('To work correctly, you need to allow access to t-tides.net. This is where the actual data is fetched, since as we hosted the website on github we need some dynamic system.');
	}
}
