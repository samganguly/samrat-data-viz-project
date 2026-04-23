# Samrat Ganguly K25131454 Data Viz Project

This local web app serves a pure D3 frontend and reads only the provided CSV files in [outputs](</C:/Users/Samrat/Downloads/Samrat Ganguly K25131454 Data Viz Project/outputs>).

## Stack

- `Flask` only for local serving
- `D3.js` for every chart
- HTML/CSS/JavaScript for the interface

## Run

```powershell
cd "C:\Users\Samrat\Downloads\Samrat Ganguly K25131454 Data Viz Project"
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python app.py
```

Open [http://127.0.0.1:5000](http://127.0.0.1:5000).

## Data Scope

- `q_analysis_core.csv` for Q1 and Q2
- `q_country_summary.csv` for Q3
- `q_q4_spend.csv` and `q_q4_gini.csv` for Q4
- `q_year_summary.csv` and `q_year_region_summary.csv` for the trend charts

No extra datasets are used.
