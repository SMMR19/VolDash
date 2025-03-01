import sqlite3
from datetime import datetime

# Connect to the database
conn = sqlite3.connect('C:/Users/samar/Desktop/VOL MODEL/voldash.db')
c = conn.cursor()

# List all tables
c.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = c.fetchall()
print("Tables in database:", [table[0] for table in tables])

# Function to print table contents
def print_table(table_name):
    print(f"\nContents of {table_name}:")
    c.execute(f"SELECT * FROM {table_name}")
    rows = c.fetchall()
    if rows:
        # Get column names
        c.execute(f"PRAGMA table_info({table_name})")
        columns = [col[1] for col in c.fetchall()]
        print("Columns:", columns)
        # Print each row
        for row in rows:
            # Convert timestamp to readable format if present
            formatted_row = list(row)
            if 'timestamp' in columns:
                ts_index = columns.index('timestamp')
                formatted_row[ts_index] = datetime.fromtimestamp(row[ts_index] / 1000).strftime('%Y-%m-%d %H:%M:%S')
            print(formatted_row)
    else:
        print("No data found.")

# Check each table
for table in [table[0] for table in tables]:
    print_table(table)

# Close the connection
conn.close()