'''
Created on 26.08.2015

@author: Katora
'''
from threading import Lock
import time

class RateLimit():
    """
    This class restricts the number of api queries in a short time frame to a certain amount thus avoiding unecessary error messages and annoying error handling.
    It is not thread safe, which should not be a problem since we only have one downloading thread anyways.
    @param maxrate: maximum request in the intervall of
    @param seconds: that much seconds
    """
    def __init__(self, maxrate, seconds):
        self.maxrate = maxrate
        self.rate = maxrate
        self.seconds = seconds
        self.timestamps = []
        self.lock = Lock()
    
    def reset(self):
        self.timestamps.clear()

    def inc(self):
        """
        Should be called whenever someone tries to access the protected resource
        It blocks when too many callers tried to access in same timeframe.
        Every time it increases the rate by one up to the max rate (linear growth)
        """
        with self.lock:
            now = time.time()
            while len(self.timestamps) > self.rate:
                timestamp = self.timestamps.pop(0)
                diff = now - timestamp
                if diff > self.seconds:
                    continue
                # All later timestamps will have an even shorter diff
                # assert self.rate > 0
                self.timestamps[:] = self.timestamps[-self.rate:]
                relevant = self.timestamps.pop(0)
                # Sleep until we surpassed this timestamp
                time.sleep(relevant + self.seconds - now)
                break
            self.timestamps.append(time.time())
            self.rate = min(self.rate+1, self.maxrate)

    def dec(self, waitTime):
        """
        Decreases the rate limit according to the parameters for a while.
        """
        with self.lock:
            self.rate = max(self.rate//2, 1)
            self.timestamps[:] = self.timestamps[-self.rate:]
            earliest = time.time() + waitTime
            for i in range(len(self.timestamps)):
                if self.timestamps[i] >= earliest:
                    break
                self.timestamps[i] = earliest
        
    def cancel(self):
        raise NotImplementedError()
