from http.server import BaseHTTPRequestHandler, HTTPServer
from sys import argv
import riotapi as rp
import json
import sqlite3
from itertools import chain
from urllib.parse import urlparse
from collections import namedtuple


MasteryData = namedtuple('MasteryData', 'championId championPoints championLevel highestGrade')
region_ref = 'region'
player_ref = 'playername'
class NameRequest(BaseHTTPRequestHandler):

    def do_GET(self):
        _,_,path,_,query,_ = urlparse(self.path)
        self.log_message('query: %s', str(query))
        query_parts = query.split('&')
        query = dict()
        for part in query_parts:
            if part.find('=') < 0:
                continue
            key, val = part.split('=', 2)
            query[key] = val
        player, region = query.get(player_ref, None), query.get(region_ref, None)
        wellformed = (path == '/mastery') and (region in rp.regions)
        wellformed &= region_ref in query and player_ref in query
        try:
            assert(wellformed)
            player = player.lower()
            masterydata = get_mastery(region, player)
            data = json.dumps(masterydata)
        except AssertionError:
            self.send_error(400)
        except Exception:
            data = None
            self.send_error(403)
        else:
            self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET')
        self.send_header('Content-Type', 'text/json')
        self.end_headers()
        if not wellformed:
            clientip, clientport = self.client_address
            self.log_message('Violation from {ip}:{port}'.format(ip=clientip, port=clientport))
            self.close_connection = True
            return
        elif data:
            self.wfile.write(data.encode('UTF-8'))
            self.wfile.write(b'\n')


def get_mastery(region, player):
    dl = rp.getDownloader(region=region)
    try:
        playerid = get_playerid(dl, region, player)
        if playerid is None:
            return None
        data = get_masterydata(dl, region, playerid)
        return data
    except rp.AnswerException:
        pass

def get_masterydata(dl, region, playerid):
    platformIdMap = {
            'br': 'BR1',
            'eune': 'EUN1',
            'euw': 'EUW1',
            'jp': 'JP1',
            'kr': 'KR',
            'lan': 'LA1',
            'las': 'LA2',
            'na': 'NA1',
            'oce': 'OC1',
            'ru': 'RU',
            'tr': 'TR1'
            }
    try:
        response = dl.api_request('/championmastery/location/{platformId}/player/{playerId}/champions'.format(platformId=platformIdMap[region], playerId=playerid))
        return {a['championId']:make_mastery_data(a)._asdict() for a in response}
    except rp.AnswerException:
        pass

def make_mastery_data(json):
    return MasteryData(json['championId'], json['championPoints'], json['championLevel'], json.get('highestGrade','None'))

def get_playerid(dl, region, playername):
    try:
        response = dl.api_request('/api/lol/{region}/v1.4/summoner/by-name/{summonerName}'.format(region=region, summonerName=playername))
        return response.get(playername, dict()).get('id', None)
    except rp.AnswerException:
        return None


class DBCache:
    def __init__(self, database):
        self.db = sqlite3.connect(database)

    def __del__(self):
        self.db.commit()
        self.db.close()

    def register_map(self, name, table, key_scheme, val_scheme, method):
        arg_num = len(key_scheme)
        eq_test = ' and '.join('{name} = ?'.format(name=name) for name in key_scheme)
        val_print = ','.join(val_scheme)
        query = 'select {val} from {table} where {eq};'.format(val=val_print,table=table,eq=eq_test);
        columns = ', '.join(chain(key_scheme, val_scheme))
        assign_op = ','.join(['?'] * (len(key_scheme) + len(val_scheme)))
        put = 'insert or replace into {table} ({columns}) values ({assign});'.format(table=table, columns=columns, assign=assign_op);
        def query_method(*args):
            assert len(args) == arg_num
            try:
                return next(self.db.execute(query, args))
            except StopIteration:
                return set_method(*args)
        def set_method(*args):
            assert len(args) == arg_num
            received = method(*args)
            vals = args + received
            self.db.execute(put, vals)
            return received

        setattr(self, name, query_method)
        setattr(self, name+'_fresh', set_method)

if __name__ == '__main__':
    rp.init()
    if len(argv) > 1:
        port = int(argv[1])
    else:
        port = 8000
    addr = ('', port)
    httpd = HTTPServer(addr, NameRequest)
    httpd.serve_forever()

