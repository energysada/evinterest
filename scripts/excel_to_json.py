#!/usr/bin/env python3
"""Convert ev-interest-tracker.xlsx into JSON files for the static site."""

import json
import openpyxl
import sys
import os

XLSX = "/Users/energysada/Library/CloudStorage/GoogleDrive-energysada@gmail.com/.shortcut-targets-by-id/1VsHTFQVv_fCHp83Cf4psemLKtzjGH2k3/Shared from work pc/fuel-prices-ev-interest/ev interest tracker.xlsx"
OUT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")


def parse_draft_table(wb):
    ws = wb["Draft Table"]

    # Row 2 has the Brent/edition info
    meta_text = ws.cell(row=2, column=1).value or ""
    title = ws.cell(row=1, column=1).value or ""

    # Find country headers (row 4, cols 3+)
    countries = []
    for col in range(3, 20):
        v = ws.cell(row=4, column=col).value
        if v:
            countries.append({"col": col, "name": v})
        else:
            break

    # Known section names
    section_names = {"WEEKLY VARIABLES", "MARKET CHARACTERISTICS"}

    # Parse metric rows
    sections = []
    current_section = None
    notes = []

    # Find all merged row ranges
    merged_rows = set()
    for m in ws.merged_cells.ranges:
        if m.min_col == 1 and m.max_col > 5:
            merged_rows.add(m.min_row)

    for row in range(5, ws.max_row + 1):
        label = ws.cell(row=row, column=1).value
        if not label:
            continue

        label_str = str(label).strip()

        # Section header — check by name (merge may have been lost)
        if label_str in section_names:
            current_section = {"name": label_str, "metrics": []}
            sections.append(current_section)
            continue

        # Merged row that's not a section = note
        if row in merged_rows:
            notes.append(label_str)
            continue

        # Skip notes that leaked in (long text, no country data)
        if len(label_str) > 80:
            notes.append(label_str)
            continue

        # Skip if no section started yet
        if current_section is None:
            continue

        # It's a metric row
        source = ws.cell(row=row, column=2).value or ""
        values = []
        for c in countries:
            cell = ws.cell(row=row, column=c["col"])
            val = cell.value
            link = cell.hyperlink.target if cell.hyperlink else None
            values.append({
                "country": c["name"],
                "value": str(val) if val else "",
                "link": link,
            })

        metric_label = label_str.replace("\n", " ")
        current_section["metrics"].append({
            "label": metric_label,
            "source": str(source).replace("\n", " ") if source else "",
            "values": values,
        })

    return {
        "title": str(title),
        "subtitle": str(meta_text),
        "countries": [c["name"] for c in countries],
        "sections": sections,
        "notes": notes,
    }


def parse_news_feed(wb):
    ws = wb["Country News Feed"]

    headers = []
    for col in range(1, 10):
        v = ws.cell(row=1, column=col).value
        if v:
            headers.append(v)

    items = []
    for row in range(2, ws.max_row + 1):
        date = ws.cell(row=row, column=1).value
        if not date:
            continue

        # Get hyperlink from URL column (8)
        url_cell = ws.cell(row=row, column=8)
        url = url_cell.value or ""
        if url_cell.hyperlink:
            url = url_cell.hyperlink.target

        is_key = ws.cell(row=row, column=9).value == "Y"

        items.append({
            "date": str(date),
            "region": str(ws.cell(row=row, column=2).value or ""),
            "country": str(ws.cell(row=row, column=3).value or ""),
            "category": str(ws.cell(row=row, column=4).value or ""),
            "headline": str(ws.cell(row=row, column=5).value or ""),
            "data_point": str(ws.cell(row=row, column=6).value or ""),
            "source_name": str(ws.cell(row=row, column=7).value or ""),
            "source_url": str(url),
            "key_country": is_key,
        })

    return items


def main():
    if not os.path.exists(XLSX):
        print(f"Excel file not found: {XLSX}")
        sys.exit(1)

    wb = openpyxl.load_workbook(XLSX)

    # 1. Draft table
    tracker = parse_draft_table(wb)
    with open(os.path.join(OUT, "tracker.json"), "w") as f:
        json.dump(tracker, f, indent=2, ensure_ascii=False)
    print(f"tracker.json: {len(tracker['sections'])} sections, {len(tracker['countries'])} countries")

    # 2. News feed
    news = parse_news_feed(wb)
    with open(os.path.join(OUT, "news.json"), "w") as f:
        json.dump(news, f, indent=2, ensure_ascii=False)
    print(f"news.json: {len(news)} articles")

    # 3. Meta
    meta = {
        "edition": 1,
        "date": "2026-03-30",
        "brent": "$116/bbl",
        "brent_change": "+60% since Feb 28",
        "last_updated": "2026-03-30",
    }
    with open(os.path.join(OUT, "meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    print("meta.json written")

    # 4. Commentary (placeholder — Sada will edit)
    commentary = {
        "bullets": [
            "EV search interest has surged across all 9 tracked markets since the Iran conflict began on Feb 28, with Australia (+150%) and China (+128%) showing the strongest Google Trends response.",
            "Platform-level data confirms the trend: mobile.de (Germany) saw EV search share triple to 36%, AutoTrader UK reported EV leads up 28%, and Aramis Auto (France) saw EV sales share double to 12.7%.",
            "Brent crude hit $116/bbl after Houthi attacks on Israel on Mar 28, adding Red Sea disruption on top of the Hormuz closure. Oil executives warn Hormuz must reopen by mid-April.",
            "The interest signal is strongest in markets with high oil import dependence (>90%) and where governments have not cushioned pump prices — India, where excise cuts held prices flat, shows muted EV search response despite strong registration numbers.",
            "Used EVs are the fastest-moving segment: in the US, used EV sales rose 12% in Q1 while new EV sales fell 28%, and used EV average price ($34,821) is now within $1,300 of used gas cars.",
        ]
    }
    with open(os.path.join(OUT, "commentary.json"), "w") as f:
        json.dump(commentary, f, indent=2, ensure_ascii=False)
    print("commentary.json written")

    print("\nDone. All JSON files in data/")


if __name__ == "__main__":
    main()
