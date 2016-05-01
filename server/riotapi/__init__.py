import urllib3
import certifi
import json
import time
import sys
from optparse import OptionParser
from threading import Lock
from .RateLimit import RateLimit
from collections import defaultdict


defaultkey = None
'''This makes sure the api is initialized and a default instance can be fetched.
The defaultkey you give is an offer and does not have to be the defaultkey after this call. If you need to access the api with 
a specific key, use that key in the call to get_api, too.
You should keep in mind that in case there is no default key set yet and no user input, then this call will raise a RuntimeError.
This signals that th api was not initialized properly. All subsequent calls to this module may fail. 
'''
def init(key=None, userinput=True):
    global defaultkey
    if defaultkey or key:
        defaultkey = defaultkey or key
        return
    parser = OptionParser()
    parser.add_option("-f", "--failed", action="store_false", dest="ignoreFailedFiles",
                  default=True, help="Retry previously failed game ids")
    parser.add_option("-k", default = None, action="store", dest="key", type="string", help="Retry previously failed game ids")
    parsed_options = parser.parse_args(sys.argv)[0]
    entered_key = parsed_options.key
    if (not entered_key) and userinput:
        print("To work correctly, the api needs to have a key, please enter it now or start again with option -k <key>.")
        entered_key = input();
    if not entered_key:
        raise RuntimeError("Api remains uninitialized since there was neither a default key nor user input")
    defaultkey = entered_key 


key_limits = defaultdict(lambda:lambda:None)
'''Sets a function to return limit for an api key if there isn't one in place
If no api key is given, then the defaultkey is limited
'''
def limit(limit_fun, apikey=None):
    global defaultkey, key_limits
    apikey = apikey or defaultkey
    key_limits.setdefault(apikey, limit_fun)


class AnswerException(Exception):
    def __init__(self, msg, answer):
        Exception(msg)
        self.msg = msg
        self.answer = answer


class Downloader:
    """An API python-binding. Requests can be done via #api_request.
    The class automatically limits the usage of the API to conform to
    the restrictions of a production key: 3000 rq/10s and 180.000rq/10min
    """
    def __init__(self, key, region):  
        self.limit_fast = RateLimit(3000, 12.0)
        self.limit_slow = RateLimit(180000, 620.0)
        self.lock = Lock()
        
        global key_limits
        self.key = key 
        self.limit = key_limits[self.key]()
        
        self.region = region
        self.api = urllib3.PoolManager(          # https connector
            cert_reqs='CERT_REQUIRED', # Force certificate check.
            ca_certs=certifi.where(),  # Path to the Certifi bundle.
            maxsize = 3,
            num_pools = 10,
            timeout = 5
        )

    def api_request(self, path, _fields = None, **data):
        """Makes an API request from the server, waiting if necessary to keep below the datacap.
        
        @param path: the API path of the requested data, e.g. "/api/lol/tr/v2.2/match/263959903".
        A leading slash is mandatory
        @param _reg: a specific server region to request the data from, e.g. 'na'
        @param _fields: the fields to forward to the raw HTTP-request. leading underscore to
        prevent conflicts with
        @param data: additional parameters for the request, e.g. includeTimeline=True
        @return: a parsed version of the received JSON response
        @raise AnswerException: when the HTTP status of the response is not 200.
        """
        if self.limit is not None:
            self.limit.inc()
        url = "https://{region}.api.pvp.net{path}".format(region = self.region, path = path)
        data['api_key'] = self.key
        url += '?' + '&'.join(str(arg) + '=' + str(data[arg]) for arg in data)
        print(url)
        with self.lock:
            answer = self.api.request('GET', url, fields = _fields)
            readdata = answer.data.decode('utf-8')
            retryTime = 0
            if 'Retry-After' in answer.headers:
                retryTime = answer.headers['Retry-After']
        if answer.status == 429:
            self.limit_fast.dec(retryTime)
            self.limit_slow.dec(retryTime)
            print("Limit exceeded received, slowing down")
        elif answer.status >= 500:
            print('Issues on the server side, hope for the best')
        if answer.status != 200:
            raise AnswerException('Error code returned by api: {err}'.format(err = answer.status), answer)
        elif not readdata:
            answer.status = 719
            raise AnswerException('No data received in answer', answer)
        return json.loads(readdata)


downloader_map = dict()
def getDownloader(region = 'global', apikey=None):
    """Gets the downloader for the specified region. If no region is given,
    returns the global downloader for static endpoint.
    """
    global defaultkey, downloader_map
    apikey = apikey or defaultkey
    dl = downloader_map.get((apikey, region), None)
    if dl is None:
        downloader_map[(apikey, region)] = dl = Downloader(region=region, key=apikey)
    return dl
