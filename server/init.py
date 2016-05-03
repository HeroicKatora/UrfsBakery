import sqlite3 


def create_db():
    db = sqlite3.connect('./.database')
    db.execute('create table playerid (region char(4), playername varchar(40), playerid integer, primary key (region, playername))')
    db.execute('create table mastery (region char(4), playerid integer, data blob, query_time datetime, primary key (region, playerid))')
    db.commit()

if __name__ == "__main__":
    create_db()
