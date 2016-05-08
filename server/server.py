from http.server import BaseHTTPRequestHandler, HTTPServer
from sys import argv
import riotapi as rp
import json
import sqlite3
import traceback
import time
from argparse import ArgumentParser
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
            data = get_mastery(cache_db, region, player)
        except AssertionError:
            self.send_response(400)
        except Exception as ex:
            traceback.print_exc()
            data = None
            self.send_response(403)
        else:
            self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET')
        self.send_header('Content-Type', 'text/json')
        self.end_headers()
        if not wellformed:
            self.wfile.write(b'{"failed": true}\n')
            clientip, clientport = self.client_address
            self.log_message('Violation from {ip}:{port}'.format(ip=clientip, port=clientport))
            self.close_connection = True
            return
        elif data:
            self.wfile.write(data)
            self.wfile.write(b'\n')


cache_period = 1000 * 60 * 10
def time_millis():
    return int(time.time() * 1000)


def get_mastery(cache_db, region, player):
    try:
        player_query = cache_db.get_playerid(region, player)
        if player_query is None:
            return None
        playerid, = player_query 
        if playerid is None:
            return None
        data, qtime = cache_db.get_mastery_blob(region, playerid)
        if time_millis() - qtime < cache_period:
            return data
        print('Data set for {region} {player} too old, refreshing'.format(region=region, player=player))
        return cache_db.get_mastery_blob_fresh(region, playerid)[0]
    except rp.AnswerException as ex:
        raise ex


def get_mastery_blob(region, playerid):
    dl = rp.getDownloader(region=region)
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
        req_time = time.time()
        response = dl.api_request('/championmastery/location/{platformId}/player/{playerId}/champions'.format(platformId=platformIdMap[region], playerId=playerid))
        print('Took {time_sec} seconds to query'.format(time_sec=time.time()-req_time))
        return (json.dumps({a['championId']:make_mastery_data(a)._asdict() for a in response}).encode('utf-8'), time_millis()) 
    except rp.AnswerException:
        pass

def make_mastery_data(json):
    return MasteryData(json['championId'], json['championPoints'], json['championLevel'], json.get('highestGrade','None'))

def get_playerid(region, playername):
    dl = rp.getDownloader(region=region)
    try:
        req_time = time.time()
        response = dl.api_request('/api/lol/{region}/v1.4/summoner/by-name/{summonerName}'.format(region=region, summonerName=playername))
        print('Took {time_sec} seconds to query'.format(time_sec=time.time()-req_time))
        return (response.get(playername, dict()).get('id', None),)
    except rp.AnswerException:
        return None


class DBCache:
    def __init__(self, database):
        self.db = sqlite3.connect(database)

    def __enter__(self):
        return self

    def __exit__(self, exit, value, exc):
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
            if received is None: return None
            vals = args + received
            self.db.execute(put, vals)
            return received

        setattr(self, name, query_method)
        setattr(self, name+'_fresh', set_method)


cache_db = DBCache('.database')
cache_db.register_map('get_playerid', 'playerid', ['region', 'playername'], ['playerid'] , get_playerid)
cache_db.register_map('get_mastery_blob', 'mastery', ['region', 'playerid'], ['data', 'query_time'], get_mastery_blob)


if __name__ == '__main__':
    parser = ArgumentParser()
    parser.add_argument('-p', dest='port', default='8000', action='store', help='port number')
    options,_ = parser.parse_known_args()
    rp.init()
    port = int(options.port)
    addr = ('', port)
    httpd = HTTPServer(addr, NameRequest)
    try:
        with cache_db:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print('Cancel received, shut down server')

