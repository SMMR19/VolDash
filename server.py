from flask import Flask, jsonify
import requests
from datetime import datetime
import sqlite3
from flask_cors import CORS
import time
import threading

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "http://localhost:3000"}})
print("CORS configured for: http://localhost:3000")

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/option-chain",
    "X-Requested-With": "XMLHttpRequest",
}

def fetch_option_chain(symbol):
    url = f"https://www.nseindia.com/api/option-chain-indices?symbol={symbol}"
    session = requests.Session()
    session.get("https://www.nseindia.com", headers=headers)
    for attempt in range(3):
        response = session.get(url, headers=headers)
        if response.status_code == 200:
            return response.json()
        print(f"API failed (attempt {attempt + 1}): {response.status_code} - {response.text}")
        time.sleep(2)
    return None

def isMarketOpen():
    now = datetime.now()
    ist_offset = 5.5 * 60 * 60  # IST is UTC+5:30
    ist_time = datetime.utcfromtimestamp(now.timestamp() + ist_offset)
    day = ist_time.weekday()  # 0 = Monday, 6 = Sunday
    hours = ist_time.hour
    minutes = ist_time.minute
    time_in_minutes = hours * 60 + minutes
    return 0 <= day <= 4 and 555 <= time_in_minutes <= 930

def init_db():
    conn = sqlite3.connect('voldash.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS option_chain (
        timestamp INTEGER, symbol TEXT, data TEXT, expiryDates TEXT
    )''')
    conn.commit()
    conn.close()

def update_option_chain():
    while True:
        if isMarketOpen():
            data = fetch_option_chain("NIFTY")
            if data:
                conn = sqlite3.connect('voldash.db')
                c = conn.cursor()
                timestamp = int(datetime.now().timestamp() * 1000)
                c.execute('DELETE FROM option_chain WHERE symbol = ?', ("NIFTY",))
                c.execute('INSERT INTO option_chain VALUES (?, ?, ?, ?)',
                          (timestamp, "NIFTY", str(data['records']['data']), str(data['records']['expiryDates'])))
                conn.commit()
                conn.close()
                print(f"Updated option chain at {datetime.now().strftime('%H:%M:%S')}")
        time.sleep(60)  # Update every 1 minute

init_db()
threading.Thread(target=update_option_chain, daemon=True).start()

@app.route('/option-chain/<symbol>')
def get_option_chain(symbol):
    conn = sqlite3.connect('voldash.db')
    c = conn.cursor()
    c.execute('SELECT * FROM option_chain WHERE symbol = ? ORDER BY timestamp DESC LIMIT 1', (symbol,))
    row = c.fetchone()
    if row:
        response = {
            "records": {
                "data": eval(row[2]),  # Convert string back to list
                "expiryDates": eval(row[3])
            }
        }
    else:
        # If no cached data, fetch once and cache
        data = fetch_option_chain(symbol)
        if data:
            timestamp = int(datetime.now().timestamp() * 1000)
            c.execute('INSERT INTO option_chain VALUES (?, ?, ?, ?)',
                      (timestamp, symbol, str(data['records']['data']), str(data['records']['expiryDates'])))
            conn.commit()
            response = {
                "records": {
                    "data": data['records']['data'],
                    "expiryDates": data['records']['expiryDates']
                }
            }
        else:
            response = {"error": "Failed to fetch data and no cache available"}
    conn.close()
    return jsonify(response)

if __name__ == '__main__':
    app.run(debug=True, port=5000)