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
    up.register_upgrade(PhE(['start'], 100, 'Everyone start slowly', 'assets/img/bakery.bmp', 'Some informal description', {}))

#Items -----------------------------------------------
    up.register_item(up.itemFromId(1055, 120, 'A very basic item for everyday use'), ItU(20, 10, 5, 5))

#Champions -------------------------------------------
#Upgrade arguments are sub-identifier, index, cost, name, description, info
    # Tanks
    with up.for_champion('Taric', 200, 0.2, 'Have you seen his frosting? Outrageous!', tank, 400, 50, 30, 50) as ch_reg:
        pass
    with up.for_champion('DrMundo', 2300, 1.5, 'A bit of that crazy potion... oops too much', tank, 400, 50, 30, 50) as ch_reg:
        pass
    with up.for_champion('Poppy', 25000, 12, 'Can\'t miss the Yordle', tank, 400, 50, 30, 50) as ch_reg:
        pass
    with up.for_champion('Gnar', 200000, 80, '"Ceega .. Caaga .. cookies"?', tank, 400, 50, 30, 50) as ch_reg:
        pass
    with up.for_champion('Rammus', 1800000, 550, 'Ok', tank, 400, 50, 30, 50) as ch_reg:
        pass
    with up.for_champion('TahmKench', 10000000, 4000, 'His taste just makes him more qualified', tank, 400, 50, 30, 50) as ch_reg:
        pass
    # Fighters
    with up.for_champion('Pantheon', 100, 0.15, 'The best baker on summoners rift', fighter, 400, 60, 20, 40) as ch_reg:
        ch_reg.register_upgrade(ChU(['number'], 0, 140, 'Weat flavoured spear', 'After the fight, his enemies smell like bread. Terrifying.', '1'))
    with up.for_champion('Fizz', 1000, 1, 'Fishcakes. Not my favorite flavour.', fighter, 400, 60, 20, 40) as ch_reg:
        pass
    with up.for_champion('Jax', 9001, 10, 'Who wants a piece of the cake?', fighter, 380, 63, 27, 33) as ch_reg:
        pass
    with up.for_champion('Fiora', 80085, 77, 'Gratious even when she spills the milk', fighter, 400, 60, 20, 40) as ch_reg:
        pass
    # Mages
    with up.for_champion('Gragas', 150, 0.2, 'His booze-infused cookies are the best!', mage, 400, 50, 30, 50) as ch_reg:
        pass
    with up.for_champion('Veigar', 2000, 2.1, 'His "evil-cupcakes" are delicious', mage, 400, 50, 30, 50) as ch_reg:
        pass
    with up.for_champion('Ziggs', 8048, 8, 'Warning: Don\'t eat his rum truffles', mage, 400, 50, 30, 50) as ch_reg:
        pass
    with up.for_champion('Yorick', 100000, 69, 'That champion exists?', mage, 400, 50, 30, 50) as ch_reg:
        pass
    with up.for_champion('AurelionSol', 1000001, 666, 'Starforger? More like star baker.', mage, 400, 50, 30, 50) as ch_reg:
        pass
    # Marksman
    with up.for_champion('Kalista', 120, 0.17, 'She\'s surprisingly good in the kitchen', marksman, 330, 65, 30, 30) as ch_reg:
        pass
    with up.for_champion('Draven', 1300, 1.35, 'Draven', marksman, 330, 65, 30, 30) as ch_reg:
        pass
    with up.for_champion('Jhin', 15000, 10.4, 'Born an artist', marksman, 330, 65, 30, 30) as ch_reg:
        pass
    with up.for_champion('Teemo', 666999, 0.1, 'Shhh, you didn\'t see him. Maybe he stays away', marksman, 330, 65, 30, 30) as ch_reg:
        pass
    # Assassin
    with up.for_champion('MasterYi', 99, 0.1, 'Wuju style - helpful in every situation', assassin, 320, 70, 30, 30):
        pass
    with up.for_champion('Tryndamere', 777, 0.8, '"Argh... my arm is tired from all the stirring"', assassin, 320, 70, 30, 30):
        pass
    with up.for_champion('Shaco', 6000, 9, 'His specialty: Suddenly bursting pies', assassin, 320, 70, 30, 30):
        pass
    with up.for_champion('Ekko', 98989, 89, '"Aaand try again... why is it always so fluid?"', assassin, 320, 70, 30, 30):
        pass
    # Support
    with up.for_champion('Alistar', 50, 0.05, 'I wonder where he gets his milk from', support, 400, 50, 30, 50) as ch_reg:
        pass
    with up.for_champion('Braum', 1000, 1, '"I will show you how to bake delicious pancakes"', support, 400, 50, 30, 50) as ch_reg:
        pass
    with up.for_champion('Lulu', 17872, 12, 'One word: Cupcakes!', support, 350, 40, 30, 30) as ch_reg:
        pass
    with up.for_champion('Sona', 135535, 90, 'Harmony with your kitchen utensils', support, 400, 50, 30, 50) as ch_reg:
        pass

#Achievements ----------------------------------------
    up.register_achievement(Ach(['user','clicking','0'], 'The beginning', '', 'Everyone bakes their first cupcake sometime', {}))

    with open(args.filename, 'w') as ofile:
        up.write(ofile)
        ofile.write('data.regions = ')
        json.dump(regions, ofile)
        ofile.write('\n')

