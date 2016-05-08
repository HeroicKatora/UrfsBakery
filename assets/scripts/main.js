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

function store_object(object_base, path, data){
	if(!path.length) return false;
	var prop = path[0];
	var rest = path.slice(1);
	if(!rest.length) {
		return object_base[prop] = data;
	}
	if(typeof object_base[prop] !== 'Object')
		object_base[prop] = {};
	store_object(object_base[prop], rest, data);
}

function increment_count(object_base, path, amount = 1){
	var count = retrieve_object(object_base, path, false) || 0;
	store_object(object_base, path, count + amount);
}
function count_object(object_base, fn){
	var count = 0;
	for(var sub in object_base){
		if(fn(sub))
			count += 1;
	}
	return count;
}

data.item_map = data.upgrade_map = {};
data.items.forEach(function(item){
	store_object(data.item_map, item.identifier, item);
});
data.upgrades.forEach(function(upgrade){
	store_object(data.upgrade_map, upgrade.identifier, upgrade);
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
		match.is_fighting = false;
		match.fight = {
			lane : undefined,
			friendlies : [],
			enemies : [],
			objective : undefined 
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
		var marksman_count = amount_champion_type('marksman');
		amount *= (1 + 0.5*marksman_count);
		increment_count(state.stats, ['manual_bake'], amount);
	
		Menu.spawnParticle(event.pageX, event.pageY, 'app/components/game/particleClick.htm');
		state.pastries += amount;
	};

	/*
	 * Baking
	 */
	function pps_champion(ident){
		var pps = data.champions.map[ident].base_production;
		var champ_amou = amount_champion(ident);
		var champ_match = state.match.champions[ident] || 0;
		var champ_fight = state.match.in_fight[ident] || 0;
		pps *= (champ_amou-champ_match) + (champ_match - champ_fight) * 0.3 + champ_fight * 0.1;
		return pps;
	}

	function calculate_pps(){
		var pps = 0;
		for(var champid in data.champions.map){
			var pps_champ = pps_champion(champid);
			pps += pps_champ;
		}
		var support_count = amount_champion_type('support');
		pps *= (1 + 0.001 * support_count);
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
	}
	function damage_entity_magic(entity, damage){
		damage *= 100/(100+entity.magic_res);
		entity.hp -= damage;
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
			//Farm
		}else{
			if(!match.fight.friendlies.length || match.fight.objective.hp <= 0){
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
				var fightspeed = 1/100;
				match.fight.friendlies.forEach(function(champ){
					var target = match.fight.enemies[Math.floor(Math.random()*match.fight.enemies.length)];
					dlog(2, target, 'attacked by', champ);
					var damage = damage_of_entity(champ) ;
					var ph_dmg = damage.physical * fightspeed;
					var mg_dmg = damage.magical * fightspeed;
					damage_entity_physical(target, ph_dmg);
					damage_entity_magic(target, mg_dmg);
				});
				match.fight.enemies.forEach(function(enemy){
					var target = match.fight.friendlies[Math.floor(Math.random()*match.fight.friendlies.length)];
					dlog(2, target, 'attacked by', enemy);
					var damage = damage_of_entity(enemy) ;
					var ph_dmg = damage.physical * fightspeed;
					var mg_dmg = damage.magical * fightspeed;
					damage_entity_physical(target, ph_dmg);
					damage_entity_magic(target, mg_dmg);
				});
				match.fight.friendlies = match.fight.friendlies.filter(lives_entity);
				match.fight.enemies = match.fight.enemies.filter(function(enemy){
					if(!lives_entity(enemy)){
						var exp_bonus = enemy.experience;
						match.fight.friendlies.forEach(function(ch){
							var ident = ch.champ_id;
							var exp = exp_bonus / match.fight.friendlies.length;
							var fighter_count = amount_champion_type('fighter');
							exp *= (1 + 0.1 * fighter_count);
							state.champions[ident].experience += exp;
						});
						return false;
					}
					return true;
				});
			}
		}
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
	function cost_champion(ident){
		var cost = data.champions.map[ident].base_cost;
		cost = Math.pow(1.15, amount_champion(ident)) * cost;
		var tank_count = amount_champion_type('tank');
		cost *= 1/(1 + 0.1*tank_count);
		return cost;
	}

	function cost_upgrade(ident){
		var cost = retrieve_object(data.upgrade_map, ident).base_cost;
		var mage_count = amount_champion_type('mage');
		cost *= 1/(1 + 0.1*mage_count);
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

	function amount_champion_type(type){
		return data.classes[type].champions.reduce(function(counter, champ){return counter+amount_champion(champ);}, 0);
	}

	function buy_champion(ident){
		var costs = cost_champion(ident);
		if(costs > state.pastries){
			console.log('Not enough to buy');
			return;
		}
		state.pastries -= costs;
		state.champions[ident].amount = amount_champion(ident) + 1;
		progress();
	};
	function buy_item(ident){
		var cost = cost_item(ident);
		if(costs > state.pastries){
			console.log('Not enough to buy');
			return;
		}
		state.pastries -= costs;
		state.champions[ident].amount = amount_champion(ident) + 1;
		progress();
	}

	function unlock_achievement(ident){
		retrieve_object(state.achievements, ident, true)['unlocked'] = true;
	}
	function has_achievement(ident){
		return (retrieve_object(state.achievements, ident, false) || {unlocked : false}).unlocked;
	}

	function can_unlock_upgrade(ident){
		if(!ident) return false;
		var category = ident[0];
		if(category == 'champion'){
		}else if(category == 'type'){
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
		return count_object(obj, function(sub){return sub['unlocked'];});
	}	

	function champion_skin(ident){
		var upg = -1;
		var skin = String.format('http://ddragon.leagueoflegends.com/cdn/img/champion/loading/{0}_0.jpg', ident);
		for(var upgrade in retrieve_object(state.upgrades, ['champion', ident])){
			if(upgrade > upg && has_upgrade(['champion', ident, upgrade])){
				upg = upgrade;
				skin = retrieve_object(state.upgrades, ['champion', ident, upgrade]).skin;
			}
		}
		return skin;
	}
	
/*
 * Fight related stuff
 */
	function move_match(ident){
		if((state.match.champions[ident] || 0) >= amount_champion(ident)){
			var error = "You don't have enough champions to move one to a match";
			console.log(error);
			return error;
		}
		increment_count(state.match.champions, [ident], 1);
	}
	function move_bake(ident){
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
		return (state.mastery[champion_id] || 0) + (state.champions[champ].experience || 0);
	};
	function champion_level(id){
		var xp = champion_exp(id);
		if(xp < 1800) return 1;
		if(xp < 6000) return 2;
		if(xp < 12600) return 3;
		if(xp < 21600) return 4;
		if(xp < 33000) return 5;
		if(xp < 46800) return 6;
		return Math.floor(Math.log(xp/46800)/Math.log(1.25))
	};
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
			match.fight.friendlies.push(champ);
			match.in_fight[id] = num;
		}

		function mk_enemy(name_i, type_i, hp_i, attack_i, armor_i, magic_res_i, exp_i){
			return {name : name_i,
				type :type_i,
				hp : hp_i,
				max_hp : hp_i,
				attack : attack_i,
				armor : armor_i,
				magic_res : magic_res_i,
				experience: exp_i,
				friendly : false};
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
			match.fight.objective = mk_enemy(buff.name, buff.type, base_hp, base_attack, base_armor, base_mr, base_exp);
			match.fight.enemies.push(match.objective);
		}else{
			var push = match.lanes[lane] + (lane == 'base'?4:0);
			var chance = 0.1 + push * (0.9 / 9);
			var enm_list = Array.apply(null, Array(5)).map(function (_, i) {return i;});
			for(var enm_id in enm_list){
				if(Math.random() > chance) continue;
				var rnd_champ = data.champions.all[Math.floor(Math.random() * data.champions.all.length)];
				console.log('Adding enemy champion', rnd_champ);
				var enm_champ = data.champions.map[rnd_champ];
				var enm_name = enm_champ.name;
				var enm_type = champion_type[enm_champ.ch_class];
				var enm_hp = enm_champ.base_hp;
				var enm_attack = enm_champ.base_attack;
				var enm_armor = enm_champ.base_armor;
				var enm_mr = enm_champ.base_mr;
				var enm_exp = 100;
				match.fight.enemies.push(mk_enemy(enm_name, enm_type, enm_hp, enm_attack, enm_armor, enm_mr, enm_exp));
			}
			var tower_base_stats = {
				0: {name: 'Tier 1 tower', hp: 1000, attack: 100, armor: 100, mr: 50, exp: 200},
				1: {name: 'Tier 2 tower', hp: 1500, attack: 100, armor: 100, mr: 50, exp: 200},
				2: {name: 'Inhibitor tower', hp: 2000, attack: 100, armor: 100, mr: 50, exp: 200},
				3: {name: 'Inhibitor', hp: 2000, attack: 0, armor: 100, mr: 50, exp: 200},
				4: {name: 'Base tower 1', hp: 3000, attack: 100, armor: 100, mr: 50, exp: 200},
				5: {name: 'Base tower 2', hp: 3000, attack: 100, armor: 100, mr: 50, exp: 200},
				6: {name: 'Nexus', hp: 4000, attack: 0, armor: 100, mr: 50, exp: 200}
			}
			{//Tower
				var tower_stat = tower_base_stats[push];
				var tower_name = tower_stat.name;
				var tower_hp = tower_stat.hp;
				var tower_attack = tower_stat.attack;
				var tower_armor = tower_stat.armor;
				var tower_mr = tower_stat.mr;
				var tower_exp = tower_stat.exp;
				var tower_type = fighter_type.physical;
				match.fight.objective = mk_enemy(tower_name, tower_type, tower_hp, tower_attack, tower_armor, tower_mr, tower_exp);
				match.fight.enemies.push(match.fight.objective);
			}
			
		}
		match.fight.lane = lane;
		match.is_fighting = true;
	};
	function end_fight(){
		var match = state.match;
		var wonFight = match.fight.objective.hp <= 0;
		var push = 0;
		var lane = match.fight.lane;
		if(wonFight){
			if(String(lane).startsWith('buff_')){ 
				var buffname = lane.substring(5);
				state.buffs[buffname] = (state.buffs[buffname] || 0) + 1;
				increment_count(state.stats, ['buffs_slain', buffname]);
			}else if(lane != 'base'){
				push = (match.lanes[fight.lane] += 1);
			}else{
				push = (match.lanes.base += 1) + 4;
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
		state.match.rewards = {pastries: 10000};
		state.match.is_in_game = false;
		Menu.addMessage('You won a Match, collect your reward now!');
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
	function id(a){return a;}
	function item_disp(item){
		var disp = JSON.parse(JSON.stringify(item));
		disp.display = function(){return true;};
		disp.costs = cost_item.bind(this, item.identifier);
		return disp;
	}
	function upgrade_disp(upgrade){
		var disp = JSON.parse(JSON.stringify(upgrade));
		disp.display = can_unlock_upgrade.bind(this, upgrade.identifier);
		disp.costs = cost_upgrade.bind(this, upgrade.identifier);
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
		disp.totalpps = pps_champion.bind(this, id);

		disp.costs = cost_champion.bind(this, id);
		disp.buy = buy_champion.bind(this, id);
		disp.move_match = move_match.bind(this, id);
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
			amount : amount_champion_type.bind(this, type)
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
	this.collect_rewards = collect_rewards;
	this.show_fight = function(){return state.match.is_fighting;};
	this.show_reward = function(){return state.match.rewards != undefined;};
	this.show_start_match = function(){return !state.match.is_in_game && state.match.rewards == undefined;};
	this.show_start_fight = function(){return state.match.rewards == undefined && state.match.is_in_game && !state.match.is_fighting;};
	this.show_end_fight = function(){return state.match.is_fighting;};

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
		lanes : lanes_disp()
	};
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
