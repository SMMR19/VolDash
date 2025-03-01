import sqlite3
from datetime import datetime

conn = sqlite3.connect('C:/Users/samar/Desktop/VOL MODEL/voldash.db')
c = conn.cursor()

c.execute("SELECT * FROM option_price")
rows = c.fetchall()
if rows:
    print("option_price contents:")
    columns = ['timestamp', 'symbol', 'expiry', 'strike', 'time_to_expiry', 'risk_free_rate', 'ce_iv', 'pe_iv', 'ce_market_price', 'pe_market_price']
    for row in rows:
        formatted_row = list(row)
        formatted_row[0] = datetime.fromtimestamp(row[0] / 1000).strftime('%Y-%m-%d %H:%M:%S')
        print(dict(zip(columns, formatted_row)))
else:
    print("No data in option_price table.")

conn.close()