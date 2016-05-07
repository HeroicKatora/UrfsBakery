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
		if(typeof obj1[prop] == 'Object' && typeof obj2[prop] == 'Object'){
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

data.item_map = data.upgrade_map = {};
data.items.forEach(function(item){
	store_object(data.item_map, item.identifier, item);
});
data.upgrades.forEach(function(upgrade){
	store_object(data.upgrade_map, upgrade.identifier, upgrade);
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


function ClickerSetup($scope, Menu){
	/* http://javascript.crockford.com/private.html */
	var that = this;
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
		state.mastery = {};
		state.champions = {};
		for(var champ in data.champions.map){
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
		state.match.rewards = null;
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
			state.mastery = JSON.parse(res);
			state.summoner = name;
			state.region = region;
			console.log('Refreshed mastery data');
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
		updateGuiState();
	};
	function reset(){
		if(guardReset()) return;
		initState();
		updateGuiState();
	}
	
/*
* Setting up the display
*/
	function onDomLoaded() {
		var button_fresh = document.getElementById("fresh");
		var button_delete = document.getElementById("delete");
		var button_start_server = document.getElementById("start_server");
		var button_save = document.getElementById("save");
		var button_load = document.getElementById("load");
		var button_reset = document.getElementById("reset");
		button_fresh.addEventListener("click", startEmpty);
		button_load.addEventListener("click", startSavedData);
		button_delete.addEventListener("click", deleteGameData);
		button_save.addEventListener("click", save);
		button_reset.addEventListener("click", reset);
	}

	if(canLoad()){
		console.log("Found existing game data, readying load screen before creation screen");
	}

	function updateGuiState(){
		$scope.$apply(); // Notify angular of possible model changes
	};

	var scaleEnd = {
		2 : 'Million',
		3 : 'Billion',
		4 : 'Quadrillion'
	}
	function format_number(number){
		if(number < 1e6) return number.toFixed(2);
		var scale = Math.floor(Math.log(number) / Math.log(10)  / 3);
		var scaleText = scaleEnd[scale];
		if(scaleText == undefined){
			scale = 4;
			scaleText = scaleEnd[4];
		}
		return String((number/Math.pow(10, 3 * scale)).toFixed(3)) + ' '+scaleText;
	}
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
			console.log(String.format('Missed {0} seconds', now_date - state.last_tick ))
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
		var amount = 1;
		var support_count = amount_champion_type('support');
		amount *= (1 + 0.5*support_count);
		state.pastries += amount;
	};

	/*
	 * Baking
	 */
	function pps_champion(ident){
		var pps = data.champions.map[ident].base_production;
		return pps;
	}

	function calculate_pps(){
		var pps = 0;
		for(var champid in data.champions.map){
			var pps_champ = pps_champion(champid);
			var champ_amou = amount_champion(champid);
			var champ_match = state.match.champions[champid] || 0;
			var champ_fight = state.match.in_fight[champid] || 0;
			pps_champ *= (champ_amou-champ_match) + (champ_match - champ_fight) * 0.3 + champ_fight * 0.1;
			pps += pps_champ;
		}
		return pps;
	}

	function bake(time_step){
		var pps = calculate_pps();
		state.pastries += Math.round(time_step/1000 * pps);

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
			for(var champ in match.fight.friendlies){
				var target = match.fight.enemies[Math.floor(Math.random()*match.fight.enemies.length)];
				var damage = damage_of_entity(champ);
				var ph_dmg = damage.physical;
				var mg_dmg = damage.magical;
				damage_entity_physical(target, ph_dmg);
				damage_entity_magic(target, mg_dmg);
			}
			for(var enemy in match.fight.enemies){
				var target = match.fight.friendlies[Math.floor(Math.random()*match.fight.friendlies.length)];
				var damage = damage_of_entity(champ);
				var ph_dmg = damage.physical;
				var mg_dmg = damage.magical;
				damage_entity_physical(target, ph_dmg);
				damage_entity_magic(target, mg_dmg);
			}
			match.fight.friendlies = match.fight.friendlies.filter(lives_entity);
			match.fight.enemies = match.fight.enemies.filter(function(enemy){
				if(!lives_entity(enemy)){
					var exp_bonus = enemy.experience;
					match.fight.friendlies.forEach(function(ch){
						var ident = ch.champ_id;
						state.champions[ident].experience += exp_bonus / match.fight.friendlies.length;
					});
					return false;
				}
				return true;
			});
			if(!match.fight.friendlies.length || match.fight.objective.hp <= 0){
				var push = end_fight(match);
				if(push >= 7){
					win_match();
				}
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
		return cost;
	}

	function cost_item(ident){
		var cost = retrieve_object(data.item_map, ident).base_cost;
		cost = Math.pow(1.2, amount_item(ident)) * cost;
		return cost;
	}

	function amount_champion(ident){
		return state.champions[ident].amount;
	}

	function amount_item(ident){
		return state.items[ident].ident;
	}

	function amount_champion_type(type){
		return data.champions[type].reduce(function(a,b){return a+b;}, 0);
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

	function unlock_upgrade(ident){
		retrieve_object(state.upgrades, ident, true)['unlocked'] = true;
	}
	function has_achievement(ident){
		return (retrieve_object(state.upgrades, ident, false) || {unlocked : false}).unlocked;
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
		state.match.champions[ident] += 1;
	}
	function move_bake(ident){
		var error = null;
		if(!state.match.champions[ident]){
			error = "You don't have this champion in a match";
		}
		if(state.match.champions[ident] <= (state.match.in_fight[ident] || 0)){
			error = "You champion is completely busy fighting at the moment";
		}
		if(error){
			console.log(error);
			return error;
		}
		state.match.champions[ident] -= 1;
	}

	function mk_champion_exp(champ){
		champion_id = data.champions.map[champ].id;
		return (state.mastery[champion_id] || 0) + (state.champions[champ].experience || 0);
	};
	function champion_level(id){
		xp = champion_exp(id);
		return Math.floor(Math.log(4, xp + 1))
	};
	function mk_champion_hp(amount, id, level){
		return 100 + data.champions.map[id].id;
	};
	function mk_champion_attack(amount, id, level){
		return 100 + data.champions.map[id].id;
	};
	function mk_champion_defense(amount, id, level){
		return 100 + data.champions.map[id].id;
	};
	function mk_champion_mr(amount, id, level){
		return 100;
	};
	var champion_type = {'tank': fighter_type.hybrid,
						'fighter': fighter_type.physical,
						'mage': fighter_type.magical,
						'marksman': fighter_type.physical,
						'assassin': fighter_type.hybrid,
						'support': fighter_type.magical};
	function can_start_fight(match, lane){
		if(match.is_fighting || (lane == 'base' && (match.lanes.bot < 4 && match.lanes.mid < 4 && match.lanes.top < 4))){
			return false;
		}
		return true;
	}
	function start_fight(match, lane){
		if(match.is_fighting){
			console.log('There is already a fight happening');
		}
		if(!can_start_fight(match, lane)){
			console.log(String.format('You can\'t attack at {0} yet, clear other objectives first', lane));
		}
		for(var id in match.champions){
			num = match.champions[id];
			level = champion_level(id);
			if(!num) continue;
			champ = {
				champ_id : id,
				max_hp : 0,
			}
			champ.friendly = true;
			champ.type = champion_type[data.champions.map[id].ch_class];
			champ.max_hp = champ.hp = mk_champion_hp(num, id, level);
			champ.attack = mk_champion_attack(num, id, level);
			champ.armor = mk_champion_defense(num, id, level);
			champ.magic_res = mk_champion_mr(num, id, level);
			match.fight.friendlies.push(champ);
			match.in_fight[id] = num;
		}

		function mk_enemy(name, type, hp, attack, armor, magic_res, exp){
			return {name : name,
				type :type,
				hp : hp,
				max_hp : hp,
				attack : attack,
				armor : armor,
				magic_res : magic_res,
				experience: exp,
				friendly : false};
		}
		if(lane.startWith('buff_')){
			var buffname = lane.substring(5);
			var buff = data.buffs[buffname];
			var base_hp = buff.base_hp;
			var slay_count = retrieve_object(state.stats, ['buffs_slain', buffname], false) || 0;
			var base_attack = buff.base_attack * Math.pow(1.15, slay_count);
			var base_armor = buff.base_armor * Math.pow(1.05, slay_count);
			var base_mr = buff.base_magic_res * Math.pow(1.10, slay_count);
			var base_exp = buff.base_exp * (1 + slay_count/4);
			match.objective = mk_enemy(buff.name, buff.type, base_hp, base_attack, base_armor, base_magic_res, base_exp);
			match.enemies.push(match.objective);
		}else{
			var push = match.lanes[lane] + (lane == 'base'?4:0);
			var chance = 0.5 + push * (0.5 / 9);
			var enm_list = Array.apply(null, Array(5)).map(function (_, i) {return i;});
			for(var enm_id in enm_list){
				//<TODO>;
			}
		}
		match.fight.lane = lane;
		match.is_fighting = true;
	};
	function end_fight(match){
		var wonFight = match.fight.objective.hp <= 0;
		var push = 0;
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
		return push;
	};
	function win_match(){
		state.rank += 1;
		state.match.lanes = {top:0,mid:0,bot:0,base:0};
		state.match.rewards = {pastries: 10000};
		state.match.is_in_game = false;
	}

	function collect_rewards(){
		if(!state.match.rewards){
			return;
		}
		state.pastries += state.match.rewards.pastries;
		state.match.rewards = null;
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
	function champ_disp(id){
		var disp = JSON.parse(JSON.stringify(data.champions.map[id]));
		disp.display = function(){return true;};
		disp.amount = amount_champion.bind(this, id);
		disp.costs = cost_champion.bind(this, id);
		disp.buy = buy_champion.bind(this, id);
		disp.move_match = move_match.bind(this, id);
		disp.move_bake = move_bake.bind(this, id);
		return disp;
	}
 	initState();
	this.data = data;
	this.refresh_mastery = refresh_mastery;
	this.state = state;
	this.pastries_per_second = calculate_pps;
	this.manual_bake = manual_bake;

	this.can_start_fight = can_start_fight.bind(this, state.match);
	this.start_fight = start_fight.bind(this, state.match);
	this.end_fight = end_fight.bind(this, state.match);
	this.start_match = start_match;
	this.collect_rewards = collect_rewards;

	this.load = load;
	this.save = save;
	this.canLoad = canLoad;
	this.start_empty = startEmpty;
	this.onDomLoaded = onDomLoaded;
	this.to_display = {
		upgrades : data.upgrades.map(id),
		items : data.items.map(id),
		tank: data.champions.tank.map(champ_disp),
		fighter: data.champions.fighter.map(champ_disp),
		mage: data.champions.mage.map(champ_disp),
		marksman: data.champions.marksman.map(champ_disp),
		assassin: data.champions.assassin.map(champ_disp),
		support: data.champions.support.map(champ_disp)
	};
	this.format = format_number;
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
        }else if(xmlHttp.readyState == 4 && error_callback){
        	if(error_callback !== null) error_callback(xmlHttp);
        }
    }
    xmlHttp.open("GET", theUrl, true); // true for asynchronous 
	try{
    	xmlHttp.send(null);
	}catch(err){
		alert('To work correctly, you need to allow access to t-tides.net. This is were the actual data is fetched, since as we hosted the website on github we need some dynamic system.');
	}
}
