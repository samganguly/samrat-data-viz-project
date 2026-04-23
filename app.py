from pathlib import Path

from flask import Flask, abort, render_template, send_file, send_from_directory


BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "outputs"
REPORT_FILE = BASE_DIR / "Samrat_Ganguly_K25131454_DataVizFINALREPORT.pdf"

ALLOWED_DATA_FILES = {
    "q_analysis_core.csv",
    "q_country_summary.csv",
    "q_q4_spend.csv",
    "q_q4_gini.csv",
    "q_year_summary.csv",
    "q_year_region_summary.csv",
}


app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/data/<path:filename>")
def data_file(filename: str):
    if filename not in ALLOWED_DATA_FILES:
        abort(404)
    return send_from_directory(OUTPUT_DIR, filename, mimetype="text/csv")


@app.route("/report/final")
def report_file():
    if not REPORT_FILE.exists():
        abort(404)
    return send_file(REPORT_FILE, mimetype="application/pdf")


if __name__ == "__main__":
    app.run()
