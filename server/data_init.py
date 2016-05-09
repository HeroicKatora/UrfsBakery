import json
from collections import namedtuple, defaultdict
from argparse import ArgumentParser
import urllib3, certifi

Achievement = namedtuple('Achievement', 'identifier name imghref description info')
Ach = Achievement
PurchaseElement = namedtuple('Upgrade', 'identifier base_cost name imghref description info')
PhE = PurchaseElement
ChampUpgrade = namedtuple('ChampUpgrade', 'identifier index base_cost name description skin')
ChU = ChampUpgrade
ItemUpgrade = namedtuple('ItemUpgrade', 'base_hp base_attack base_armor base_mr')
ItU = ItemUpgrade

regions = [{'id' :'br','name' : 'Brazil'},
{'id' :'eune','name' : 'Europe North/East'},
{'id' :'euw','name' : 'Europe West'},
{'id' :'jp','name' : 'Japan'},
{'id' :'kr','name' : 'Korea'},
{'id' :'lan','name' : 'Latin America North'},
{'id' :'las','name' : 'Latin America South'},
{'id' :'na','name' : 'North America'},
{'id' :'oce','name' : 'Oceania'},
{'id' :'ru','name' : 'Russia'},
{'id' :'tr','name' : 'Turkey'}]

class ChampReg:
    def __init__(self, upgradereg, name, cost, base_production, description, ch_class, hp, attack, armor, mr):
        self.upref = upgradereg
        self.upgrades = []
        self.name = name
        self.description = description
        self.ch_class = ch_class
        self.base_production = base_production
        self.portrait = 'http://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{name}.png'.format(version = self.upref.ddragonversion, name=name)
        self.upgrade_portrait = 'http://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{name}.png'
        self.skin = 'http://ddragon.leagueoflegends.com/cdn/img/champion/loading/{name}_{ind}.jpg'
        screenname = upgradereg.champion_map[name]['name']
        extra_info = {'base_production': base_production, 'ch_class': ch_class, 'numeric_id': upgradereg.champion_map[name]['key'],
                    'base_hp' : hp, 'base_attack' : attack, 'base_armor' : armor, 'base_mr' : mr};
        self.upref.register_champion(PurchaseElement(name, cost, screenname, self.portrait, description, extra_info), ch_class)

    def register_upgrade(self, champ_upgrade):
        self.upgrades.append(champ_upgrade)

    def __enter__(self):
        return self
    
    def mk_portrait(self, ind):
        return self.upgrade_portrait.format(version = self.upref.ddragonversion, name=self.name, ind=ind)

    def mk_skin(self, ind):
        return self.skin.format(name=self.name, ind=ind, version = self.upref.ddragonversion)

    def __exit__(self, stat, typ, exc):
        self.upgrades.sort(key=lambda t:t.base_cost)
        for up in self.upgrades:
            ref_up = PurchaseElement(['champion', self.name]+up.identifier+[up.index], up.base_cost, up.name, self.mk_portrait(up.index), up.description, {'skin': self.mk_skin(up.skin)})
            self.upref.register_upgrade(ref_up)


tank = 'tank'
fighter = 'fighter'
mage = 'mage'
marksman = 'marksman'
assassin = 'assassin'
support = 'support'


class ClassReg:
    def __init__(self, name, longname, description, icon_href, icon_x, icon_y):
        self.identifier = name
        self.name = longname
        self.descr = description
        self.icon_href = icon_href
        self.icon_x = icon_x
        self.icon_y = icon_y
        self.champions = []

    def write(self, obuf):
        json.dump({'name': self.name, 'description': self.descr,
            'icon_href' : self.icon_href, 'icon_x': self.icon_x,
            'icon_y': self.icon_y, 'champions': self.champions, 'identifier' : self.identifier}, obuf)

    def add_champion(self, champion):
        self.champions.append(champion.identifier)

       
class UpgradeReg:
    def __init__(self, ddragonversion):
        self.ddragonversion = ddragonversion
        self.http = urllib3.PoolManager()
        champ_req = self.http.request('GET', 'http://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json'.format(version=self.ddragonversion))
        item_req = self.http.request('GET', 'http://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/item.json'.format(version=self.ddragonversion))
        self.champion_map = json.loads(champ_req.data.decode('utf-8'))['data']
        self.item_map = json.loads(item_req.data.decode('utf-8'))['data']
        self.items = []
        self.upgrades = []
        self.achievements = []
        self.champions = {}
        self.classes = {}

    def write(self, obuf):
        obuf.write('var data = {};\n')
        obuf.write('data.upgrades = ')
        json.dump(list(map(self.as_dict, self.upgrades)), obuf)
        obuf.write(';\n')
        obuf.write('data.items = ')
        json.dump(list(map(self.as_dict, self.items)), obuf)
        obuf.write(';\n')
        obuf.write('data.champions = {};\n')
        obuf.write('data.champions.map = ')
        json.dump({k : self.as_dict(e) for k, e in self.champions.items()}, obuf)
        obuf.write(';\n')
        obuf.write('data.classes = {};\n')
        for cl, it in self.classes.items():
            obuf.write('data.classes.{key} = '.format(key=cl))
            it.write(obuf)
            obuf.write(';\n')
        obuf.write('data.achievements = ')
        json.dump(list(map(self.as_dict, self.achievements)), obuf)
        obuf.write(';\n')

    def as_dict(self, element):
        d = PhE._asdict(element)
        d.update(element.info)
        d.pop('info')
        return d

    def itemFromId(self, itemId, cost, description):
        id_as = str(itemId)
        imghref = 'https://ddragon.leagueoflegends.com/cdn/{version}/img/item/{itemId}.png'.format(version=self.ddragonversion, itemId=itemId);
        return PhE([id_as], cost, self.item_map[id_as]['name'], imghref, description, {})

    def register_class(self, classreg):
        self.classes[classreg.identifier] = classreg

    def register_upgrade(self, element):
        self.upgrades.append(element)

    def register_item(self, element, itemdto):
        element.info.update(itemdto._asdict())
        self.items.append(element)

    def register_champion(self, champ_element, ch_class):
        self.champions[champ_element.identifier] = champ_element
        self.classes[ch_class].add_champion(champ_element)

    def register_achievement(self, element):
        self.achievements.append(element)

    def for_champion(self, *args):
        return ChampReg(self, *args)

if __name__ == "__main__":
    argparser = ArgumentParser()
    argparser.add_argument('-f', default='./data.js', action='store', dest='filename')
    args = argparser.parse_known_args()[0]

    up = UpgradeReg('6.9.1')
#Classes ---------------------------------------------
    up.register_class(ClassReg(tank, 'Tank', 'Employing more tanks will decrease the cost of other champions (due to their attractiveness, e.g. Taric)', '//ddragon.leagueoflegends.com/cdn/6.9.1/img/sprite/profileicon0.png', 18*48, 7*48))
    up.register_class(ClassReg(fighter, 'Fighter', 'More fighters will earn you more exp obtained in farming', '//ddragon.leagueoflegends.com/cdn/6.9.1/img/sprite/profileicon0.png', 18*48, 3*48))
    up.register_class(ClassReg(mage, 'Mage', 'Mages magically minimize upgrade costs to mysterious levels', '//ddragon.leagueoflegends.com/cdn/6.9.1/img/sprite/profileicon0.png', 18*48, 4*48))
    up.register_class(ClassReg(marksman, 'Marksman', 'More AD, more right click power. Earn more pastries by clicking yourself', '//ddragon.leagueoflegends.com/cdn/6.9.1/img/sprite/profileicon0.png', 18*48, 5*48))
    up.register_class(ClassReg(assassin, 'Assassin', 'You need damage? Kill more enemies? Employing more assassins increases your experience reward', '//ddragon.leagueoflegends.com/cdn/6.9.1/img/sprite/profileicon0.png', 18*48, 2*48))
    up.register_class(ClassReg(support, 'Support', 'Supports carry everone. They adda a little bonus to all your production', '//ddragon.leagueoflegends.com/cdn/6.9.1/img/sprite/profileicon0.png', 18*48, 6*48))

#Upgrades --------------------------------------------

#Items -----------------------------------------------
    up.register_item(up.itemFromId(1055, 120, 'A very basic item for everyday use'), ItU(20, 10, 5, 5))

#Champions -------------------------------------------
#Upgrade arguments are sub-identifier, index, cost, name, description, info
    # Tanks
    with up.for_champion('Taric', 200, 0.2, 'Have you seen his frosting? Outrageous!', tank, 400, 50, 30, 50) as ch_reg:
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Hammer time', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Hammer time II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Hammer time III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Crystal energy', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Crystal energy II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Crystal energy III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'Radiance', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'Radiance II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'Radiance III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'Radiance IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'Violent V-neck IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'Violent V-neck IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'Violent V-neck IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Rubies are for vigor', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Rubies are for vigor II', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 2, 10000000, 'Rubies are for vigor III', 'Halves damage received', '1'))
    with up.for_champion('DrMundo', 2300, 1.5, 'A bit of that crazy potion... oops too much', tank, 400, 50, 30, 50) as ch_reg:
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Iron muscles', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Iron muscles II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Iron muscles III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Raisin injection', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Raisin injection II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Raisin injection III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'Whipped cream topping', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'Whipped cream topping II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'Whipped cream topping III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'Whipped cream topping IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'Big Hulk IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'Big Hulk IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'Big Hulk IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Legendary regeneration', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Legendary regeneration II', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 2, 10000000, 'Legendary regeneration III', 'Halves damage received', '1'))
    with up.for_champion('Poppy', 25000, 12, 'Can\'t miss the Yordle', tank, 400, 50, 30, 50) as ch_reg:
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Demcias cooking recipes', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Demcias cooking recipes II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Demcias cooking recipes III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Frugal diplomacy', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Frugal diplomacy II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Frugal diplomacy III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'Search for Greatness', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'Search for Greatness II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'Search for Greatness III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'Search for Greatness IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'Hammer of Justice IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'Hammer of Justice IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'Hammer of Justice IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Unbreakable', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Unbreakable II', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 2, 10000000, 'Unbreakable III', 'Halves damage received', '1'))
    with up.for_champion('Gnar', 200000, 80, '"Ceega .. Caaga .. cookies"?', tank, 400, 50, 30, 50) as ch_reg:
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Jungle knowledge', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Jungle knowledge II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Jungle knowledge III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Yordle charm', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Yordle charm II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Yordle charm III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'Kitchen toss', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'Kitchen toss II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'Kitchen toss III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'Kitchen toss IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'Boulder smash IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'Boulder smash IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'Boulder smash IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Rage form', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Rage form II', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 2, 10000000, 'Rage form III', 'Halves damage received', '1'))
    with up.for_champion('Rammus', 1800000, 550, 'Ok', tank, 400, 50, 30, 50) as ch_reg:
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Ok', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Ok II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Ok III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Still Ok', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Still Ok II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Still Ok III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'More Ok than ever before', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'More Ok than ever before II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'More Ok than ever before III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'More Ok than ever before IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'You OK? IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'You OK? IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'You OK? IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'OK!', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'OK! II', 'Halves damage received', '1'))
        pass
    with up.for_champion('TahmKench', 10000000, 4000, 'His taste just makes him more qualified', tank, 400, 50, 30, 50) as ch_reg:
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Tasty', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Tasty II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Tasty III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Belly fluids', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Belly fluids II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Belly fluids III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'Abyssal cookies', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'Abyssal cookies II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'Abyssal cookies III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'Abyssal cookies IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'Devour IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'Devour IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'Devour IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Thick skin', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Thick skin II', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 2, 10000000, 'Thick skin III', 'Halves damage received', '1'))
    # Fighters
    with up.for_champion('Pantheon', 100, 0.15, 'The best baker on summoners rift', fighter, 400, 60, 20, 40) as ch_reg:
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Wheat flavoured spear', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Wheat flavoured spear II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Wheat flavoured spear III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Spatula spear', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Spatula spear II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Spatula spear III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'Grand bread fall', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'Grand bread fall II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'Grand bread fall III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'Grand bread fall IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'Heartseeker strike IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'Heartseeker strike IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'Heartseeker strike IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Aegis of the Legion', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Aegis of the Legion II', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 2, 10000000, 'Aegis of the Legion III', 'Halves damage received', '1'))
    with up.for_champion('Fizz', 1000, 1, 'Fishcakes. Not my favorite flavour.', fighter, 400, 60, 20, 40) as ch_reg:
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Nautic fauna and flora', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Nautic fauna and flora II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Nautic fauna and flora III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Trident hop', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Trident hop II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Trident hop III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'Friends with the fishes', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'Friends with the fishes II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'Friends with the fishes III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'Friends with the fishes IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'Slippery, slip, slip IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'Slippery, slip, slip IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'Slippery, slip, slip IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Hard to catch', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Hard to catch II', 'Halves damage received', '1'))
    with up.for_champion('Jax', 9001, 10, 'Who wants a piece of the cake?', fighter, 380, 63, 27, 33) as ch_reg:
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Lantern post', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Lantern post II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Lantern post III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Better wheat', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Better wheat II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Better wheat III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'Six-flavoured strike', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'Six-flavoured strike II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'Six-flavoured strike III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'Six-flavoured strike IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'Chunk, Chunk, Choonk IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'Chunk, Chunk, Choonk IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'Chunk, Chunk, Choonk IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Untoucheable', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Untoucheable II', 'Halves damage received', '1'))
    with up.for_champion('Fiora', 80085, 77, 'Gratious even when she spills the milk', fighter, 400, 60, 20, 40) as ch_reg:
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'It\'s all skill', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'It\'s all skill II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'It\'s all skill III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Leaping to resuce', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Leaping to resuce II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Leaping to resuce III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'The Grand Duelist', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'The Grand Duelist II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'The Grand Duelist III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'The Grand Duelist IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'Coup de Grace IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'Coup de Grace IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'Coup de Grace IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Parry', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Parry II', 'Halves damage received', '1'))
    # Mages
    with up.for_champion('Gragas', 150, 0.2, 'His booze-infused cookies are the best!', mage, 400, 50, 30, 50) as ch_reg:
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Drinking habits', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Drinking habits II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Drinking habits III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Well rested', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Well rested II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Well rested III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'At least a century old', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'At least a century old II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'At least a century old III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'At least a century old IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'Go to sleep, will you IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'Go to sleep, will you IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'Go to sleep, will you IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Now pushing around', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Now pushing around II', 'Halves damage received', '1'))
    with up.for_champion('Veigar', 2000, 2.1, 'His "evil-cupcakes" are delicious', mage, 400, 50, 30, 50) as ch_reg:
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Flavour meteor', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Flavour meteor II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Flavour meteor III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Baking-Boss Veigar', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Baking-Boss Veigar II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Baking-Boss Veigar III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'Sensational horizon', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'Sensational horizon II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'Sensational horizon III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'Sensational horizon IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'The cruel side IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'The cruel side IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'The cruel side IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Trapped', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Trapped II', 'Halves damage received', '1'))
    with up.for_champion('Ziggs', 8048, 8, 'Warning: Don\'t eat his rum truffles', mage, 400, 50, 30, 50) as ch_reg:
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Explody ingredients', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Explody ingredients II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Explody ingredients III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Egg tossing efficiency', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Egg tossing efficiency II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Egg tossing efficiency III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'Big final Booom', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'Big final Booom II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'Big final Booom III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'Big final Booom IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'Add in small pieces IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'Add in small pieces IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'Add in small pieces IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Winter candy bribe', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Winter candy bribe II', 'Halves damage received', '1'))
    with up.for_champion('Yorick', 100000, 69, 'That champion exists?', mage, 400, 50, 30, 50) as ch_reg:
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Undead hunger', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Undead hunger II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Undead hunger III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Shovel training', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Shovel training II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Shovel training III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'Pastry infinity', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'Pastry infinity II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'Pastry infinity III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'Pastry infinity IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'Godlike IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'Godlike IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'Godlike IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Sacrificial pact', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Sacrificial pact II', 'Halves damage received', '1'))
    with up.for_champion('AurelionSol', 1000001, 666, 'Starforger? More like star baker.', mage, 400, 50, 30, 50) as ch_reg:
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Pure sunlight', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Pure sunlight II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Pure sunlight III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Pure Moonlight', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Pure Moonlight II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Pure Moonlight III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'Pure Aether', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'Pure Aether II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'Pure Aether III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'Pure Aether IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'Tiny stars IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'Tiny stars IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'Tiny stars IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Sunfire', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Sunfire II', 'Halves damage received', '1'))
    # Marksman
    with up.for_champion('Kalista', 120, 0.17, 'She\'s surprisingly good in the kitchen', marksman, 330, 65, 30, 30) as ch_reg:
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Piercing spears', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Piercing spears II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Piercing spears III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Vengeance', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Vengeance II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Vengeance III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'Soul binding', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'Soul binding II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'Soul binding III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'Soul binding IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'Rip them out IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'Rip them out IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'Rip them out IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Backhops', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Backhops II', 'Halves damage received', '1'))
    with up.for_champion('Draven', 1300, 1.35, 'Draven', marksman, 330, 65, 30, 30) as ch_reg:
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Spinning blades', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Spinning blades II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Spinning blades III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Stand aside', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Stand aside II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Stand aside III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'Earned adoration', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'Earned adoration II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'Earned adoration III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'Earned adoration IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'Crits and Chill IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'Crits and Chill IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'Crits and Chill IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Look at me, I\'m the boss now', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Look at me, I\'m the boss now II', 'Halves damage received', '1'))
    with up.for_champion('Jhin', 15000, 10.4, 'Born an artist', marksman, 330, 65, 30, 30) as ch_reg:
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Consecutive hits', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Consecutive hits II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Consecutive hits III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Blooming art', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Blooming art II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Blooming art III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'Perfect painting', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'Perfect painting II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'Perfect painting III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'Perfect painting IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'Psychopathy IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'Psychopathy IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'Psychopathy IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Most sublime beauty', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Most sublime beauty II', 'Halves damage received', '1'))
    with up.for_champion('Teemo', 666999, 0.1, 'Shhh, you didn\'t see him. Maybe he stays away', marksman, 330, 65, 30, 30) as ch_reg:
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Delicious poison', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Delicious poison II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Delicious poison III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'This will stick', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'This will stick II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'This will stick III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'Poison shroud', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'Poison shroud II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'Poison shroud III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'Poison shroud IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'Devilish grin IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'Devilish grin IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'Devilish grin IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Stealth mission', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Stealth mission II', 'Halves damage received', '1'))
    # Assassin
    with up.for_champion('MasterYi', 99, 0.1, 'Wuju style - helpful in every situation', assassin, 320, 70, 30, 30):
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Pure bake', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Pure bake II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Pure bake III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Regeneration', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Regeneration II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Regeneration III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'Highlander secrets', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'Highlander secrets II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'Highlander secrets III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'Highlander secrets IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'Double the strikes IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'Double the strikes IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'Double the strikes IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Meditation', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Meditation II', 'Halves damage received', '1'))
    with up.for_champion('Tryndamere', 777, 0.8, '"Argh... my arm is tired from all the stirring"', assassin, 320, 70, 30, 30):
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Snowball', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Snowball II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Snowball III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Spin the cupcake', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Spin the cupcake II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Spin the cupcake III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'Undying hunger', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'Undying hunger II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'Undying hunger III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'Undying hunger IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'Execution IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'Execution IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'Execution IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Emergency rage', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Emergency rage II', 'Halves damage received', '1'))
    with up.for_champion('Shaco', 6000, 9, 'His specialty: Suddenly bursting pies', assassin, 320, 70, 30, 30):
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Backstab', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Backstab II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Backstab III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Clone works', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Clone works II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Clone works III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'Pancake in the box', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'Pancake in the box II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'Pancake in the box III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'Pancake in the box IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'Poision shiv IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'Poision shiv IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'Poision shiv IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Shadow step', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Shadow step II', 'Halves damage received', '1'))
    with up.for_champion('Ekko', 98989, 89, '"Aaand try again... why is it always so fluid?"', assassin, 320, 70, 30, 30):
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Hextech crafting', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Hextech crafting II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Hextech crafting III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Undo button', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Undo button II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Undo button III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'Perfect message of love', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'Perfect message of love II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'Perfect message of love III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'Perfect message of love IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'Timey Whimey IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'Timey Whimey IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'Timey Whimey IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Sunfire', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Sunfire II', 'Halves damage received', '1'))
    # Support
    with up.for_champion('Alistar', 50, 0.05, 'I wonder where he gets his milk from', support, 400, 50, 30, 50) as ch_reg:
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Pure sunlight', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Pure sunlight II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Pure sunlight III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Pure Moonlight', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Pure Moonlight II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Pure Moonlight III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'Pure Aether', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'Pure Aether II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'Pure Aether III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'Pure Aether IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'Tiny stars IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'Tiny stars IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'Tiny stars IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Sunfire', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Sunfire II', 'Halves damage received', '1'))
    with up.for_champion('Braum', 1000, 1, '"I will show you how to bake delicious pancakes"', support, 400, 50, 30, 50) as ch_reg:
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Pure sunlight', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Pure sunlight II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Pure sunlight III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Pure Moonlight', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Pure Moonlight II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Pure Moonlight III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'Pure Aether', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'Pure Aether II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'Pure Aether III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'Pure Aether IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'Tiny stars IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'Tiny stars IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'Tiny stars IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Sunfire', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Sunfire II', 'Halves damage received', '1'))
    with up.for_champion('Lulu', 17872, 12, 'One word: Cupcakes!', support, 350, 40, 30, 30) as ch_reg:
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Pure sunlight', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Pure sunlight II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Pure sunlight III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Pure Moonlight', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Pure Moonlight II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Pure Moonlight III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'Pure Aether', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'Pure Aether II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'Pure Aether III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'Pure Aether IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'Tiny stars IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'Tiny stars IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'Tiny stars IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Sunfire', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Sunfire II', 'Halves damage received', '1'))
    with up.for_champion('Sona', 135535, 90, 'Harmony with your kitchen utensils', support, 400, 50, 30, 50) as ch_reg:
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Pure sunlight', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 1, 800, 'Pure sunlight II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 2, 4000, 'Pure sunlight III', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 3, 20000, 'Pure Moonlight', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 4, 100000, 'Pure Moonlight II', 'Doubles base production', '0'))
        ch_reg.register_upgrade(ChU(['number'], 5, 1000000, 'Pure Moonlight III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 6, 10000000, 'Pure Aether', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 7, 100000000, 'Pure Aether II', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 8, 1000000000, 'Pure Aether III', 'Doubles base production', '1'))
        ch_reg.register_upgrade(ChU(['number'], 9, 10000000000, 'Pure Aether IV', 'Doubles base production', '1'))

        ch_reg.register_upgrade(ChU(['damage_dealt'], 0, 1000, 'Tiny stars IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 1, 100000, 'Tiny stars IV', 'Doubles damage dealt', '1'))
        ch_reg.register_upgrade(ChU(['damage_dealt'], 2, 10000000, 'Tiny stars IV', 'Doubles damage dealt', '1'))

        ch_reg.register_upgrade(ChU(['damage_received'], 0, 1000, 'Sunfire', 'Halves damage received', '1'))
        ch_reg.register_upgrade(ChU(['damage_received'], 1, 100000, 'Sunfire II', 'Halves damage received', '1'))

#Achievements ----------------------------------------
    up.register_achievement(Ach(['user','clicking','0'], 'The beginning', '', 'Everyone bakes their first cupcake sometime', {}))

    up.register_upgrade(PhE(['user', 'clicking', 0], 10**3, 'Clicking I', '', '', {}))
    up.register_upgrade(PhE(['user', 'clicking', 1], 10**5, 'Clicking II', '', '', {}))
    up.register_upgrade(PhE(['user', 'clicking', 2], 10**7, 'Clicking III', '', '', {}))
    up.register_upgrade(PhE(['user', 'clicking', 3], 10**9, 'Clicking IV', '', '', {}))
    up.register_upgrade(PhE(['user', 'clicking', 4], 10**11, 'Clicking V', '', '', {}))
    up.register_upgrade(PhE(['user', 'clicking', 5], 10**13, 'Clicking VI', '', '', {}))
    up.register_upgrade(PhE(['user', 'clicking', 6], 10**15, 'Clicking VII', '', '', {}))
    up.register_upgrade(PhE(['user', 'clicking', 7], 10**17, 'Clicking VIII', '', '', {}))
    up.register_upgrade(PhE(['user', 'clicking', 8], 10**19, 'Clicking IX', '', '', {}))
    up.register_upgrade(PhE(['user', 'clicking', 9], 10**21, 'Clicking X', '', '', {}))

    up.register_upgrade(PhE(['experience', 'total', 0], 20**3, 'Passive experience gain I', '', '', {}))
    up.register_upgrade(PhE(['experience', 'total', 1], 20**5, 'Passive experience gain II', '', '', {}))
    up.register_upgrade(PhE(['experience', 'total', 2], 20**7, 'Passive experience gain III', '', '', {}))
    up.register_upgrade(PhE(['experience', 'total', 3], 20**9, 'Passive experience gain IV', '', '', {}))

    for clazz in (tank, marksman, support, mage, fighter, assassin):
        up.register_upgrade(PhE(['class', clazz, 'produced', 0], 10**4, 'Increases class bonus to twice the amount', '', '', {}))
        up.register_upgrade(PhE(['class', clazz, 'produced', 1], 10**6, 'Increases class bonus to twice the amount', '', '', {}))
        up.register_upgrade(PhE(['class', clazz, 'produced', 2], 10**8, 'Increases class bonus to twice the amount', '', '', {}))
        up.register_upgrade(PhE(['class', clazz, 'produced', 3], 10**10, 'Increases class bonus to twice the amount', '', '', {}))

    with open(args.filename, 'w') as ofile:
        up.write(ofile)
        ofile.write('data.regions = ')
        json.dump(regions, ofile)
        ofile.write('\n')

