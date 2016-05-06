import json
import riotapi as rp
from collections import namedtuple, defaultdict


PurchaseElement = namedtuple('Upgrade', 'identifier cost name imghref description info')
PhE = PurchaseElement
ChampUpgrade = namedtuple('ChampUpgrade', 'cost name description skin')
ChU = ChampUpgrade


class ChampReg:
    def __init__(self, upgradereg, name, cost, description, ch_class):
        self.upref = upgradereg
        self.upgrades = []
        self.name = name
        self.description = description
        self.ch_class = ch_class
        self.portrait = 'http://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{name}.png'.format(version = self.upref.ddragonversion, name=name)
        self.upgrade_portrait = 'http://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{name}.png'
        self.skin = 'http://ddragon.leagueoflegends.com/cdn/img/champion/loading/{name}_{ind}.jpg'
        self.upref.register_champion(PurchaseElement(name, cost, name, self.portrait, description, {}), ch_class)

    def register_upgrade(self, champ_upgrade):
        self.upgrades.append(champ_upgrade)

    def __enter__(self):
        return self
    
    def mk_portrait(self, ind):
        return self.upgrade_portrait.format(version = self.upref.ddragonversion, name=self.name, ind=ind)

    def mk_skin(self, ind):
        return self.skin.format(name=self.name, ind=ind, version = self.upref.ddragonversion)

    def __exit__(self, stat, typ, exc):
        self.upgrades.sort(key=lambda t:t.cost)
        for ind, up in enumerate(self.upgrades):
            ref_up = PurchaseElement([self.name, ind], up.cost, up.name, self.mk_portrait(ind), up.description, {'skin': self.mk_skin(up.skin)})
            self.upref.register_upgrade(ref_up)
        
class UpgradeReg:
    def __init__(self, ddragonversion):
        self.ddragonversion = ddragonversion
        self.items = []
        self.upgrades = []
        self.champions = {}
        self.classes = defaultdict(list)

    def write(self, obuf):
        obuf.write('var data = {};\n')
        obuf.write('data.upgrades = \n')
        json.dump(list(map(PhE._asdict, self.upgrades)), obuf)
        obuf.write('\n')
        obuf.write('data.items = \n')
        json.dump(list(map(PhE._asdict, self.items)), obuf)
        obuf.write('\n')
        obuf.write('data.champions = \n')
        json.dump({k : PhE._asdict(e) for k, e in self.champions.items()}, obuf)
        obuf.write('\n')
        for cl, it in self.classes.items():
            obuf.write('data.champions.{key} = '.format(key=cl))
            json.dump(it, obuf)
        obuf.write('\n')

    def register_upgrade(self, element):
        self.upgrades.append(element)

    def register_item(self, element):
        self.items.append(element)

    def register_champion(self, champ_element, ch_class):
        self.champions[champ_element.identifier] = champ_element
        self.classes[ch_class].append(champ_element.identifier)

    def for_champion(self, *args):
        return ChampReg(self, *args)


tank = 'tank'
fighter = 'fighter'
mage = 'mage'
marksman = 'marksman'
assassin = 'assassin'
support = 'support'

if __name__ == "__main__":
    up = UpgradeReg('6.9.1')
    up.register_upgrade(PhE(['start'], 100, 'Everyone start slowly', 'assets/img/bakery.bmp', 'Some informal description', {}))
    with up.for_champion('Pantheon', 100, 'The best baker on summoners rift', fighter) as ch_reg:
        ch_reg.register_upgrade(ChU(140, 'Weat flavoured spear', 'After the fight, his enemies smell like bread. Terrifying.', '0'))
    with open('data.js', 'w') as ofile:
        up.write(ofile)

