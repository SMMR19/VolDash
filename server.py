from flask import Flask, jsonify
import requests
from datetime import datetime
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

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
    response = session.get(url, headers=headers)
    if response.status_code == 200:
        return response.json()
    print(f"API failed: {response.status_code} - {response.text}")
    return None

@app.route('/volatility/<symbol>/default')
def get_volatility_default(symbol):
    data = fetch_option_chain(symbol)
    if not data:
        return jsonify({"error": "Failed to fetch data"}), 500
    
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
    
    return jsonify({
        "strikes": strikes,
        "call_ivs": [chain_by_strike[s]["CE"].get("impliedVolatility", 0) for s in strikes],
        "put_ivs": [chain_by_strike[s]["PE"].get("impliedVolatility", 0) for s in strikes],
        "atm_strike": atm_strike,
        "underlying_value": underlying_value,
        "expiryDates": expiry_dates
    })

@app.route('/volatility/<symbol>/<expiry>')
def get_volatility(symbol, expiry):
    data = fetch_option_chain(symbol)
    if not data:
        return jsonify({"error": "Failed to fetch data"}), 500
    
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
    
    return jsonify({
        "strikes": strikes,
        "call_ivs": [chain_by_strike[s]["CE"].get("impliedVolatility", 0) for s in strikes],
        "put_ivs": [chain_by_strike[s]["PE"].get("impliedVolatility", 0) for s in strikes],
        "atm_strike": atm_strike,
        "underlying_value": underlying_value,
        "expiryDates": data["records"]["expiryDates"]
    })

@app.route('/bid-ask/<symbol>/<expiry>/<strike>')
def get_bid_ask(symbol, expiry, strike):
    data = fetch_option_chain(symbol)
    if not data:
        return jsonify({"error": "Failed to fetch data"}), 500
    
    strike = float(strike)
    for entry in data["records"]["data"]:
        if entry["expiryDate"] == expiry and entry["strikePrice"] == strike:
            ce = entry.get("CE", {})
            pe = entry.get("PE", {})
            ce_spread = (ce.get("askPrice", 0) - ce.get("bidprice", 0)) if ce.get("askPrice") and ce.get("bidprice") else 0
            pe_spread = (pe.get("askPrice", 0) - pe.get("bidprice", 0)) if pe.get("askPrice") and pe.get("bidprice") else 0
            ce_spike = ce_spread > 20  # Arbitrary threshold for demo
            pe_spike = pe_spread > 15  # Arbitrary threshold for demo
            return jsonify({
                "timestamp": int(datetime.now().timestamp() * 1000),
                "ce_spread": ce_spread,
                "pe_spread": pe_spread,
                "ce_spike": ce_spike,
                "pe_spike": pe_spike
            })
    return jsonify({"error": "Strike not found"}), 404

@app.route('/option-price/<symbol>/<expiry>/<strike>')
def get_option_price(symbol, expiry, strike):
    data = fetch_option_chain(symbol)
    if not data:
        return jsonify({"error": "Failed to fetch data"}), 500
    
    for entry in data["records"]["data"]:
        if entry["expiryDate"] == expiry and entry["strikePrice"] == float(strike):
            ce = entry.get("CE", {})
            pe = entry.get("PE", {})
            today = datetime.now()
            expiry_date = datetime.strptime(expiry, "%d-%b-%Y")
            time_to_expiry = (expiry_date - today).days / 365.0
            return jsonify({
                "strike": float(strike),
                "time_to_expiry": time_to_expiry,
                "risk_free_rate": 0.06,
                "ce_iv": ce.get("impliedVolatility", 0),
                "pe_iv": pe.get("impliedVolatility", 0),
                "ce_market_price": ce.get("lastPrice", 0),
                "pe_market_price": pe.get("lastPrice", 0)
            })
    return jsonify({"error": "Strike not found"}), 404

@app.route('/underlying-price/<symbol>')
def get_underlying_price(symbol):
    data = fetch_option_chain("NIFTY")
    if data:
        return jsonify({"underlying_value": data["records"]["data"][0]["PE"]["underlyingValue"]})
    return jsonify({"error": "Failed to fetch underlying price"}), 500

@app.route('/volatility-surface/<symbol>/all')
def get_volatility_surface(symbol):
    data = fetch_option_chain(symbol)
    if not data:
        return jsonify({"error": "Failed to fetch data"}), 500
    
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
    
    return jsonify({
        "strikes": strikes,
        "days_to_expiry": days_to_expiry,
        "implied_vols": implied_vols,
        "expiryDates": closest_expiries
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)