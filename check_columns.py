import pandas as pd
from app import ADJUST_FILE

df = pd.read_csv(ADJUST_FILE)
print("CSV columns:", df.columns.tolist())
