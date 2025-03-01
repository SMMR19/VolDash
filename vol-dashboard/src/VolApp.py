{
 "cells": [
  {
   "cell_type": "code",
   "execution_count": 1,
   "id": "9f0b858d-905f-4cde-bc91-3b7aa4b649b0",
   "metadata": {},
   "outputs": [
    {
     "name": "stdout",
     "output_type": "stream",
     "text": [
      "Flask server started in the background. Visit http://127.0.0.1:5000/volatility/NIFTY/27-Feb-2025\n",
      " * Serving Flask app '__main__'\n",
      " * Debug mode: on\n"
     ]
    },
    {
     "name": "stderr",
     "output_type": "stream",
     "text": [
      "WARNING: This is a development server. Do not use it in a production deployment. Use a production WSGI server instead.\n",
      " * Running on http://127.0.0.1:5000\n",
      "Press CTRL+C to quit\n",
      "127.0.0.1 - - [27/Feb/2025 19:52:00] \"GET /volatility/NIFTY/27-Feb-2025 HTTP/1.1\" 200 -\n"
     ]
    }
   ],
   "source": [
    "import requests\n",
    "from flask import Flask, jsonify\n",
    "from threading import Thread\n",
    "\n",
    "app = Flask(__name__)\n",
    "\n",
    "headers = {\n",
    "    \"User-Agent\": \"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36\",\n",
    "    \"Accept\": \"application/json\",\n",
    "    \"Accept-Language\": \"en-US,en;q=0.9\",\n",
    "    \"Referer\": \"https://www.nseindia.com/option-chain\",\n",
    "    \"X-Requested-With\": \"XMLHttpRequest\",\n",
    "}\n",
    "\n",
    "@app.route('/volatility/<symbol>/<expiry>')\n",
    "def get_volatility(symbol, expiry):\n",
    "    url = f\"https://www.nseindia.com/api/option-chain-indices?symbol={symbol}\"\n",
    "    session = requests.Session()\n",
    "    session.get(\"https://www.nseindia.com\", headers=headers)\n",
    "    response = session.get(url, headers=headers)\n",
    "    \n",
    "    if response.status_code == 200:\n",
    "        data = response.json()\n",
    "        option_chain = data[\"records\"][\"data\"]\n",
    "        underlying_value = data[\"records\"][\"data\"][0][\"PE\"][\"underlyingValue\"]\n",
    "        \n",
    "        chain_by_strike = {}\n",
    "        for entry in option_chain:\n",
    "            strike = entry[\"strikePrice\"]\n",
    "            if entry[\"expiryDate\"] == expiry:\n",
    "                key = strike\n",
    "                if key not in chain_by_strike:\n",
    "                    chain_by_strike[key] = {\"CE\": {}, \"PE\": {}}\n",
    "                if \"CE\" in entry:\n",
    "                    chain_by_strike[key][\"CE\"] = entry[\"CE\"]\n",
    "                if \"PE\" in entry:\n",
    "                    chain_by_strike[key][\"PE\"] = entry[\"PE\"]\n",
    "        \n",
    "        strikes = sorted(chain_by_strike.keys())\n",
    "        call_ivs = [chain_by_strike[s][\"CE\"].get(\"impliedVolatility\", 0) for s in strikes]\n",
    "        put_ivs = [chain_by_strike[s][\"PE\"].get(\"impliedVolatility\", 0) for s in strikes]\n",
    "        atm_strike = min(strikes, key=lambda x: abs(x - underlying_value))\n",
    "        \n",
    "        return jsonify({\n",
    "            \"strikes\": strikes,\n",
    "            \"call_ivs\": call_ivs,\n",
    "            \"put_ivs\": put_ivs,\n",
    "            \"atm_strike\": atm_strike,\n",
    "            \"underlying_value\": underlying_value\n",
    "        })\n",
    "    return jsonify({\"error\": \"Failed to fetch data\"}), 500\n",
    "\n",
    "# Run Flask in a background thread\n",
    "def run_app():\n",
    "    app.run(debug=True, use_reloader=False)  # Disable reloader for Jupyter\n",
    "\n",
    "# Start the server in a thread\n",
    "thread = Thread(target=run_app)\n",
    "thread.start()\n",
    "\n",
    "print(\"Flask server started in the background. Visit http://127.0.0.1:5000/volatility/NIFTY/27-Feb-2025\")"
   ]
  },
  {
   "cell_type": "code",
   "execution_count": null,
   "id": "6726912b-bc7e-475d-a8b8-b106309e5b6c",
   "metadata": {},
   "outputs": [],
   "source": []
  }
 ],
 "metadata": {
  "kernelspec": {
   "display_name": "Python 3 (ipykernel)",
   "language": "python",
   "name": "python3"
  },
  "language_info": {
   "codemirror_mode": {
    "name": "ipython",
    "version": 3
   },
   "file_extension": ".py",
   "mimetype": "text/x-python",
   "name": "python",
   "nbconvert_exporter": "python",
   "pygments_lexer": "ipython3",
   "version": "3.12.0"
  }
 },
 "nbformat": 4,
 "nbformat_minor": 5
}
