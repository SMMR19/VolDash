from flask import Flask, jsonify
import requests
from datetime import datetime
import sqlite3
from flask_cors import CORS
import time

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
    # Market open: Mon-Fri, 9:15 AM (555 min) - 3:30 PM (930 min) IST
    return 0 <= day <= 4 and 555 <= time_in_minutes <= 930

def init_db():
    conn = sqlite3.connect('voldash.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS premiums (
        timestamp INTEGER, symbol TEXT, expiry TEXT, straddle_premium REAL, ironfly_premium REAL, 
        atm_strike REAL, call_wing REAL, put_wing REAL, straddle_iv REAL, ironfly_iv REAL
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS volatility (
        timestamp INTEGER, symbol TEXT, expiry TEXT, strikes TEXT, call_ivs TEXT, put_ivs TEXT, 
        atm_strike REAL, underlying_value REAL, expiryDates TEXT
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS bid_ask (
        timestamp INTEGER, symbol TEXT, expiry TEXT, strike REAL, ce_spread REAL, pe_spread REAL, 
        ce_spike INTEGER, pe_spike INTEGER
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS option_price (
        timestamp INTEGER, symbol TEXT, expiry TEXT, strike REAL, time_to_expiry REAL, risk_free_rate REAL, 
        ce_iv REAL, pe_iv REAL, ce_market_price REAL, pe_market_price REAL
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS vol_surface (
        timestamp INTEGER, symbol TEXT, strikes TEXT, days_to_expiry TEXT, implied_vols TEXT, expiryDates TEXT
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS underlying_price (
        timestamp INTEGER, symbol TEXT, underlying_value REAL
    )''')
    conn.commit()
    conn.close()

init_db()

@app.route('/volatility/<symbol>/default')
def get_volatility_default(symbol):
    conn = sqlite3.connect('voldash.db')
    c = conn.cursor()
    if isMarketOpen():
        data = fetch_option_chain(symbol)
        if not data:
            c.execute('SELECT * FROM volatility WHERE symbol = ? ORDER BY timestamp DESC LIMIT 1', (symbol,))
            row = c.fetchone()
            if row:
                response = {
                    "strikes": eval(row[3]),
                    "call_ivs": eval(row[4]),
                    "put_ivs": eval(row[5]),
                    "atm_strike": row[6],
                    "underlying_value": row[7],
                    "expiryDates": eval(row[8])
                }
                conn.close()
                return jsonify(response)
            conn.close()
            return jsonify({"error": "Failed to fetch data and no historical data available"}), 500

        underlying_value = data["records"]["data"][0]["PE"]["underlyingValue"]
        expiry_dates = data["records"]["expiryDates"]
        today = datetime.now()
        latest_expiry = sorted(
            expiry_dates,
            key=lambda x: abs((datetime.strptime(x, "%d-%b-%Y") - today).days)
        )[0]
        chain_by_strike = {}
        for entry in data["records"]["data"]:
            if entry["expiryDate"] == latest_expiry:
                strike = entry["strikePrice"]
                chain_by_strike[strike] = {
                    "CE": entry.get("CE", {}),
                    "PE": entry.get("PE", {})
                }
        strikes = sorted(chain_by_strike.keys())
        atm_strike = min(strikes, key=lambda x: abs(x - underlying_value))
        response = {
            "strikes": strikes,
            "call_ivs": [chain_by_strike[s]["CE"].get("impliedVolatility", 0) for s in strikes],
            "put_ivs": [chain_by_strike[s]["PE"].get("impliedVolatility", 0) for s in strikes],
            "atm_strike": atm_strike,
            "underlying_value": underlying_value,
            "expiryDates": expiry_dates
        }
        timestamp = int(datetime.now().timestamp() * 1000)
        c.execute('INSERT INTO volatility VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                  (timestamp, symbol, latest_expiry, str(strikes), str(response["call_ivs"]), str(response["put_ivs"]), atm_strike, underlying_value, str(expiry_dates)))
        conn.commit()
    else:
        c.execute('SELECT * FROM volatility WHERE symbol = ? ORDER BY timestamp DESC LIMIT 1', (symbol,))
        row = c.fetchone()
        if row:
            response = {
                "strikes": eval(row[3]),
                "call_ivs": eval(row[4]),
                "put_ivs": eval(row[5]),
                "atm_strike": row[6],
                "underlying_value": row[7],
                "expiryDates": eval(row[8])
            }
        else:
            response = {"error": "Market closed and no historical data available"}
    conn.close()
    return jsonify(response)

@app.route('/volatility/<symbol>/<expiry>')
def get_volatility(symbol, expiry):
    conn = sqlite3.connect('voldash.db')
    c = conn.cursor()
    if isMarketOpen():
        data = fetch_option_chain(symbol)
        if not data:
            c.execute('SELECT * FROM volatility WHERE symbol = ? AND expiry = ? ORDER BY timestamp DESC LIMIT 1', (symbol, expiry))
            row = c.fetchone()
            if row:
                response = {
                    "strikes": eval(row[3]),
                    "call_ivs": eval(row[4]),
                    "put_ivs": eval(row[5]),
                    "atm_strike": row[6],
                    "underlying_value": row[7],
                    "expiryDates": eval(row[8])
                }
                conn.close()
                return jsonify(response)
            conn.close()
            return jsonify({"error": "Failed to fetch data and no historical data available"}), 500

        underlying_value = data["records"]["data"][0]["PE"]["underlyingValue"]
        chain_by_strike = {}
        for entry in data["records"]["data"]:
            if entry["expiryDate"] == expiry:
                strike = entry["strikePrice"]
                chain_by_strike[strike] = {
                    "CE": entry.get("CE", {}),
                    "PE": entry.get("PE", {})
                }
        strikes = sorted(chain_by_strike.keys())
        atm_strike = min(strikes, key=lambda x: abs(x - underlying_value))
        response = {
            "strikes": strikes,
            "call_ivs": [chain_by_strike[s]["CE"].get("impliedVolatility", 0) for s in strikes],
            "put_ivs": [chain_by_strike[s]["PE"].get("impliedVolatility", 0) for s in strikes],
            "atm_strike": atm_strike,
            "underlying_value": underlying_value,
            "expiryDates": data["records"]["expiryDates"]
        }
        timestamp = int(datetime.now().timestamp() * 1000)
        c.execute('INSERT INTO volatility VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                  (timestamp, symbol, expiry, str(strikes), str(response["call_ivs"]), str(response["put_ivs"]), atm_strike, underlying_value, str(data["records"]["expiryDates"])))
        conn.commit()
    else:
        c.execute('SELECT * FROM volatility WHERE symbol = ? AND expiry = ? ORDER BY timestamp DESC LIMIT 1', (symbol, expiry))
        row = c.fetchone()
        if row:
            response = {
                "strikes": eval(row[3]),
                "call_ivs": eval(row[4]),
                "put_ivs": eval(row[5]),
                "atm_strike": row[6],
                "underlying_value": row[7],
                "expiryDates": eval(row[8])
            }
        else:
            response = {"error": "Market closed and no historical data available"}
    conn.close()
    return jsonify(response)

@app.route('/bid-ask/<symbol>/<expiry>/<strike>')
def get_bid_ask(symbol, expiry, strike):
    conn = sqlite3.connect('voldash.db')
    c = conn.cursor()
    strike = float(strike)
    if isMarketOpen():
        data = fetch_option_chain(symbol)
        if not data:
            c.execute('SELECT * FROM bid_ask WHERE symbol = ? AND expiry = ? AND strike = ? ORDER BY timestamp DESC LIMIT 1', (symbol, expiry, strike))
            row = c.fetchone()
            if row:
                response = {
                    "timestamp": row[0],
                    "ce_spread": row[4],
                    "pe_spread": row[5],
                    "ce_spike": bool(row[6]),
                    "pe_spike": bool(row[7])
                }
                conn.close()
                return jsonify(response)
            conn.close()
            return jsonify({"error": "Failed to fetch data and no historical data available"}), 500

        for entry in data["records"]["data"]:
            if entry["expiryDate"] == expiry and entry["strikePrice"] == strike:
                ce = entry.get("CE", {})
                pe = entry.get("PE", {})
                ce_spread = (ce.get("askPrice", 0) - ce.get("bidprice", 0)) if ce.get("askPrice") and ce.get("bidprice") else 0
                pe_spread = (pe.get("askPrice", 0) - pe.get("bidprice", 0)) if pe.get("askPrice") and pe.get("bidprice") else 0
                ce_spike = ce_spread > 20
                pe_spike = pe_spread > 15
                timestamp = int(datetime.now().timestamp() * 1000)
                response = {
                    "timestamp": timestamp,
                    "ce_spread": ce_spread,
                    "pe_spread": pe_spread,
                    "ce_spike": ce_spike,
                    "pe_spike": pe_spike
                }
                c.execute('INSERT INTO bid_ask VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                          (timestamp, symbol, expiry, strike, ce_spread, pe_spread, int(ce_spike), int(pe_spike)))
                conn.commit()
                conn.close()
                return jsonify(response)
        conn.close()
        return jsonify({"error": "Strike not found"}), 404
    else:
        c.execute('SELECT * FROM bid_ask WHERE symbol = ? AND expiry = ? AND strike = ? ORDER BY timestamp DESC LIMIT 1', (symbol, expiry, strike))
        row = c.fetchone()
        if row:
            response = {
                "timestamp": row[0],
                "ce_spread": row[4],
                "pe_spread": row[5],
                "ce_spike": bool(row[6]),
                "pe_spike": bool(row[7])
            }
        else:
            response = {"error": "Market closed and no historical data available"}
        conn.close()
        return jsonify(response)

@app.route('/option-price/<symbol>/<expiry>/<strike>')
def get_option_price(symbol, expiry, strike):
    conn = sqlite3.connect('voldash.db')
    c = conn.cursor()
    strike = float(strike)
    if isMarketOpen():
        data = fetch_option_chain(symbol)
        if not data:
            c.execute('SELECT * FROM option_price WHERE symbol = ? AND expiry = ? AND strike = ? ORDER BY timestamp DESC LIMIT 1', (symbol, expiry, strike))
            row = c.fetchone()
            if row:
                response = {
                    "strike": row[3],
                    "time_to_expiry": row[4],
                    "risk_free_rate": row[5],
                    "ce_iv": row[6],
                    "pe_iv": row[7],
                    "ce_market_price": row[8],
                    "pe_market_price": row[9]
                }
                conn.close()
                return jsonify(response)
            conn.close()
            return jsonify({"error": "Failed to fetch data and no historical data available"}), 500

        for entry in data["records"]["data"]:
            if entry["expiryDate"] == expiry and entry["strikePrice"] == strike:
                ce = entry.get("CE", {})
                pe = entry.get("PE", {})
                today = datetime.now()
                expiry_date = datetime.strptime(expiry, "%d-%b-%Y")
                time_to_expiry = (expiry_date - today).days / 365.0
                timestamp = int(datetime.now().timestamp() * 1000)
                response = {
                    "strike": strike,
                    "time_to_expiry": time_to_expiry,
                    "risk_free_rate": 0.06,
                    "ce_iv": ce.get("impliedVolatility", 0),
                    "pe_iv": pe.get("impliedVolatility", 0),
                    "ce_market_price": ce.get("lastPrice", 0),
                    "pe_market_price": pe.get("lastPrice", 0)
                }
                c.execute('INSERT INTO option_price VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                          (timestamp, symbol, expiry, strike, time_to_expiry, 0.06, response["ce_iv"], response["pe_iv"], response["ce_market_price"], response["pe_market_price"]))
                conn.commit()
                conn.close()
                return jsonify(response)
        conn.close()
        return jsonify({"error": "Strike not found"}), 404
    else:
        c.execute('SELECT * FROM option_price WHERE symbol = ? AND expiry = ? AND strike = ? ORDER BY timestamp DESC LIMIT 1', (symbol, expiry, strike))
        row = c.fetchone()
        if row:
            response = {
                "strike": row[3],
                "time_to_expiry": row[4],
                "risk_free_rate": row[5],
                "ce_iv": row[6],
                "pe_iv": row[7],
                "ce_market_price": row[8],
                "pe_market_price": row[9]
            }
        else:
            response = {"error": "Market closed and no historical data available"}
        conn.close()
        return jsonify(response)

@app.route('/underlying-price/<symbol>')
def get_underlying_price(symbol):
    conn = sqlite3.connect('voldash.db')
    c = conn.cursor()
    if isMarketOpen():
        data = fetch_option_chain(symbol)
        if data:
            underlying_value = data["records"]["data"][0]["PE"]["underlyingValue"]
            timestamp = int(datetime.now().timestamp() * 1000)
            c.execute('INSERT INTO underlying_price VALUES (?, ?, ?)', (timestamp, symbol, underlying_value))
            conn.commit()
            conn.close()
            return jsonify({"underlying_value": underlying_value})
    c.execute('SELECT underlying_value FROM underlying_price WHERE symbol = ? ORDER BY timestamp DESC LIMIT 1', (symbol,))
    row = c.fetchone()
    if row:
        conn.close()
        return jsonify({"underlying_value": row[0]})
    conn.close()
    return jsonify({"error": "Market closed and no historical data available"}), 500

@app.route('/volatility-surface/<symbol>/all')
def get_volatility_surface(symbol):
    conn = sqlite3.connect('voldash.db')
    c = conn.cursor()
    if isMarketOpen():
        data = fetch_option_chain(symbol)
        if not data:
            c.execute('SELECT * FROM vol_surface WHERE symbol = ? ORDER BY timestamp DESC LIMIT 1', (symbol,))
            row = c.fetchone()
            if row:
                response = {
                    "strikes": eval(row[2]),
                    "days_to_expiry": eval(row[3]),
                    "implied_vols": eval(row[4]),
                    "expiryDates": eval(row[5])
                }
                conn.close()
                return jsonify(response)
            conn.close()
            return jsonify({"error": "Failed to fetch data and no historical data available"}), 500

        underlying_value = data["records"]["data"][0]["PE"]["underlyingValue"]
        expiry_dates = data["records"]["expiryDates"]
        today = datetime.now()
        closest_expiries = sorted(
            expiry_dates,
            key=lambda x: abs((datetime.strptime(x, "%d-%b-%Y") - today).days)
        )[:4]
        strikes = []
        days_to_expiry = []
        implied_vols = []
        for expiry in closest_expiries:
            chain_by_strike = {}
            for entry in data["records"]["data"]:
                if entry["expiryDate"] == expiry:
                    strike = entry["strikePrice"]
                    chain_by_strike[strike] = {
                        "CE": entry.get("CE", {}),
                        "PE": entry.get("PE", {})
                    }
            all_strikes = sorted(chain_by_strike.keys())
            atm_strike = min(all_strikes, key=lambda x: abs(x - underlying_value))
            atm_index = all_strikes.index(atm_strike)
            start_idx = max(0, atm_index - 5)
            end_idx = min(len(all_strikes), atm_index + 6)
            selected_strikes = all_strikes[start_idx:end_idx]
            expiry_date = datetime.strptime(expiry, "%d-%b-%Y")
            days = (expiry_date - today).days
            for strike in selected_strikes:
                ce_iv = chain_by_strike[strike]["CE"].get("impliedVolatility", 0)
                pe_iv = chain_by_strike[strike]["PE"].get("impliedVolatility", 0)
                iv = max(ce_iv, pe_iv)
                strikes.append(strike)
                days_to_expiry.append(days)
                implied_vols.append(iv)
        response = {
            "strikes": strikes,
            "days_to_expiry": days_to_expiry,
            "implied_vols": implied_vols,
            "expiryDates": closest_expiries
        }
        timestamp = int(datetime.now().timestamp() * 1000)
        c.execute('INSERT INTO vol_surface VALUES (?, ?, ?, ?, ?, ?)',
                  (timestamp, symbol, str(strikes), str(days_to_expiry), str(implied_vols), str(closest_expiries)))
        conn.commit()
    else:
        c.execute('SELECT * FROM vol_surface WHERE symbol = ? ORDER BY timestamp DESC LIMIT 1', (symbol,))
        row = c.fetchone()
        if row:
            response = {
                "strikes": eval(row[2]),
                "days_to_expiry": eval(row[3]),
                "implied_vols": eval(row[4]),
                "expiryDates": eval(row[5])
            }
        else:
            response = {"error": "Market closed and no historical data available"}
    conn.close()
    return jsonify(response)

@app.route('/premiums/<symbol>/<expiry>/<int:strike>', defaults={'call_wing': None, 'put_wing': None})
@app.route('/premiums/<symbol>/<expiry>/<int:strike>/<int:call_wing>/<int:put_wing>')
def get_premiums(symbol, expiry, strike, call_wing, put_wing):
    conn = sqlite3.connect('voldash.db')
    c = conn.cursor()
    if isMarketOpen():
        data = fetch_option_chain(symbol)
        if not data:
            c.execute('SELECT * FROM premiums WHERE symbol = ? AND expiry = ? AND atm_strike = ? ORDER BY timestamp DESC LIMIT 1', (symbol, expiry, strike))
            row = c.fetchone()
            if row:
                response = {
                    "timestamp": row[0],
                    "straddle_premium": row[3],
                    "ironfly_premium": row[4] if row[4] is not None else None,
                    "atm_strike": row[5],
                    "call_wing": row[6] if row[6] is not None else None,
                    "put_wing": row[7] if row[7] is not None else None,
                    "straddle_iv": row[8],
                    "ironfly_iv": row[9] if row[9] is not None else None,
                    "underlying_value": None,
                    "expiryDates": None
                }
                conn.close()
                return jsonify(response)
            conn.close()
            return jsonify({"error": "Failed to fetch data and no historical data available"}), 500

        underlying_value = data["records"]["data"][0]["PE"]["underlyingValue"]
        chain_by_strike = {}
        for entry in data["records"]["data"]:
            if entry["expiryDate"] == expiry:
                chain_by_strike[entry["strikePrice"]] = {"CE": entry.get("CE", {}), "PE": entry.get("PE", {})}

        if strike not in chain_by_strike:
            return jsonify({"error": "Strike not found"}), 404

        straddle_premium = chain_by_strike[strike]["CE"].get("lastPrice", 0) + chain_by_strike[strike]["PE"].get("lastPrice", 0)
        straddle_iv = (chain_by_strike[strike]["CE"].get("impliedVolatility", 0) + chain_by_strike[strike]["PE"].get("impliedVolatility", 0)) / 2

        ironfly_premium = None
        ironfly_iv = None
        if call_wing and put_wing and call_wing in chain_by_strike and put_wing in chain_by_strike:
            ironfly_premium = (
                chain_by_strike[strike]["CE"].get("lastPrice", 0) +
                chain_by_strike[strike]["PE"].get("lastPrice", 0) -
                chain_by_strike[call_wing]["CE"].get("lastPrice", 0) -
                chain_by_strike[put_wing]["PE"].get("lastPrice", 0)
            )
            ironfly_iv = (
                chain_by_strike[strike]["CE"].get("impliedVolatility", 0) +
                chain_by_strike[strike]["PE"].get("impliedVolatility", 0) +
                chain_by_strike[call_wing]["CE"].get("impliedVolatility", 0) +
                chain_by_strike[put_wing]["PE"].get("impliedVolatility", 0)
            ) / 4

        timestamp = int(datetime.now().timestamp() * 1000)
        response = {
            "timestamp": timestamp,
            "straddle_premium": straddle_premium,
            "ironfly_premium": ironfly_premium,
            "atm_strike": strike,
            "call_wing": call_wing,
            "put_wing": put_wing,
            "straddle_iv": straddle_iv,
            "ironfly_iv": ironfly_iv,
            "underlying_value": underlying_value,
            "expiryDates": data["records"]["expiryDates"]
        }
        c.execute('INSERT INTO premiums VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                  (timestamp, symbol, expiry, straddle_premium, ironfly_premium, strike, call_wing, put_wing, straddle_iv, ironfly_iv))
        conn.commit()
    else:
        c.execute('SELECT * FROM premiums WHERE symbol = ? AND expiry = ? AND atm_strike = ? ORDER BY timestamp DESC LIMIT 1', (symbol, expiry, strike))
        row = c.fetchone()
        if row:
            response = {
                "timestamp": row[0],
                "straddle_premium": row[3],
                "ironfly_premium": row[4] if row[4] is not None else None,
                "atm_strike": row[5],
                "call_wing": row[6] if row[6] is not None else None,
                "put_wing": row[7] if row[7] is not None else None,
                "straddle_iv": row[8],
                "ironfly_iv": row[9] if row[9] is not None else None,
                "underlying_value": None,
                "expiryDates": None
            }
        else:
            response = {"error": "Market closed and no historical data available"}
    conn.close()
    return jsonify(response)

@app.route('/premiums-history/<symbol>/<expiry>')
def get_premiums_history(symbol, expiry):
    conn = sqlite3.connect('voldash.db')
    c = conn.cursor()
    c.execute('SELECT timestamp, straddle_premium, ironfly_premium, atm_strike, call_wing, put_wing, straddle_iv, ironfly_iv FROM premiums WHERE symbol = ? AND expiry = ? ORDER BY timestamp ASC',
              (symbol, expiry))
    rows = c.fetchall()
    conn.close()
    return jsonify({
        "timestamps": [row[0] for row in rows],
        "straddle_premiums": [row[1] for row in rows],
        "ironfly_premiums": [row[2] for row in rows],
        "atm_strike": rows[0][3] if rows else 0,
        "call_wing": rows[0][4] if rows else 0,
        "put_wing": rows[0][5] if rows else 0,
        "straddle_ivs": [row[6] for row in rows],
        "ironfly_ivs": [row[7] for row in rows]
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)