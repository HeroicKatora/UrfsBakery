from http.server import BaseHTTPRequestHandler, HTTPServer
from sys import argv
import riotapi as rp
import json
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
        if wellformed:
            self.send_response(200, 'OK')
        else:
            self.send_response(400, 'Forbidden')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET')
        self.send_header('Content-Type', 'text/json')
        self.end_headers()
        if not wellformed:
            clientip, clientport = self.client_address
            self.log_message('Violation from {ip}:{port}'.format(ip=clientip, port=clientport))
            self.close_connection = True
            return
        player = player.lower()
        masterydata = self.get_mastery(region, player)
        data = json.dumps(masterydata)
        self.wfile.write(data.encode('UTF-8'))
        self.wfile.write(b'\n')

    def get_mastery(self, region, player):
        dl = rp.getDownloader(region=region)
        try:
            playerid = self.get_playerid(dl, region, player)
            if playerid is None:
                return None
            data = self.get_masterydata(dl, region, playerid)
            return data
        except rp.AnswerException:
            pass

    def get_masterydata(self, dl, region, playerid):
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
            return {a['championId']:self.make_mastery_data(a)._asdict() for a in response}
        except rp.AnswerException:
            pass

    def make_mastery_data(self, json):
        return MasteryData(json['championId'], json['championPoints'], json['championLevel'], json.get('highestGrade','None'))

    def get_playerid(self, dl, region, playername):
        try:
            response = dl.api_request('/api/lol/{region}/v1.4/summoner/by-name/{summonerName}'.format(region=region, summonerName=playername))
            return response.get(playername, dict()).get('id', None)
        except rp.AnswerException:
            return None


if __name__ == "__main__":
    rp.init()
    if len(argv) > 1:
        port = int(argv[1])
    else:
        port = 8000
    addr = ('', port)
    httpd = HTTPServer(addr, NameRequest)
    httpd.serve_forever()

