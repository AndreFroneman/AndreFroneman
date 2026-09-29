"""Vessel historical exposure reports (PDF and CSV) for insurers / brokers / fleet operators."""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

DISCLAIMER = (
    "SASH Maritime Risk Indicators provide decision-support intelligence and do not constitute "
    "insurance underwriting advice."
)


def _rows(profile: dict) -> list[tuple[str, str]]:
    h = profile["historical_exposure"]
    return [
        ("Voyages analysed", str(h["voyages_analysed"])),
        ("Elevated-risk voyages", str(h["elevated_risk_voyages"])),
        ("High-risk-zone transits", str(h["high_risk_zone_transits"])),
        ("Elevated-risk exposure (hours)", f"{h['elevated_risk_exposure_hours']:.1f}"),
        ("AIS reporting anomalies", str(h["ais_anomalies"])),
        ("Route deviations", str(h["route_deviations"])),
        ("Loitering events", str(h["loitering_events"])),
        ("Unexpected stops", str(h["unexpected_stops"])),
        ("Nearby security incidents", str(h["nearby_security_incidents_total"])),
        ("Confirmed vessel incidents", str(h["confirmed_vessel_incidents"])),
    ]


def render_csv(profile: dict, events: list[dict]) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    v = profile["vessel"]
    w.writerow(["SASH Ocean — Vessel Historical Exposure Report"])
    w.writerow(["Generated", datetime.now(timezone.utc).isoformat()])
    w.writerow(["Vessel", v["name"], "IMO", v["imo"], "MMSI", v["mmsi"], "Flag", v["flag"], "Type", v["vessel_type"]])
    if v.get("synthetic"):
        w.writerow(["DATA", "SYNTHETIC DEMONSTRATION DATA — NOT LIVE INTELLIGENCE"])
    w.writerow([])
    w.writerow(["Metric", "Value", f"Period: last {profile['historical_exposure']['period_months']} months"])
    for k, val in _rows(profile):
        w.writerow([k, val])
    cr = profile.get("current_risk") or {}
    w.writerow(["Current SASH Maritime Risk Indicator", cr.get("score"), cr.get("band"), cr.get("trend")])
    w.writerow([])
    w.writerow(["Event time (UTC)", "Event", "Detail"])
    for e in events:
        w.writerow([e["time"], e["kind"], e["text"]])
    w.writerow([])
    w.writerow([DISCLAIMER])
    w.writerow([profile["historical_exposure"]["note"]])
    return buf.getvalue().encode("utf-8")


def render_pdf(profile: dict, events: list[dict]) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=16 * mm,
                            bottomMargin=16 * mm, title="SASH Ocean Exposure Report")
    ss = getSampleStyleSheet()
    small = ParagraphStyle("small", parent=ss["Normal"], fontSize=8, leading=10)
    story = []
    v = profile["vessel"]
    story.append(Paragraph("SASH OCEAN — Vessel Historical Exposure Report", ss["Title"]))
    story.append(Paragraph(f"Generated {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC", small))
    if v.get("synthetic"):
        story.append(Spacer(1, 4))
        story.append(Paragraph("<b><font color='#b45309'>SYNTHETIC DEMONSTRATION DATA — NOT LIVE INTELLIGENCE</font></b>",
                               ss["Normal"]))
    story.append(Spacer(1, 8))
    ident = [
        ["Vessel", v["name"] or "—", "IMO", v["imo"] or "—"],
        ["MMSI", v["mmsi"] or "—", "Flag", v["flag"] or "—"],
        ["Type", v["vessel_type"] or "—", "Operator", v["operator"] or "—"],
    ]
    t = Table(ident, colWidths=[28 * mm, 60 * mm, 22 * mm, 60 * mm])
    t.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 9), ("TEXTCOLOR", (0, 0), (0, -1), colors.grey),
                           ("TEXTCOLOR", (2, 0), (2, -1), colors.grey), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    story.append(t)
    story.append(Spacer(1, 10))
    cr = profile.get("current_risk")
    if cr:
        story.append(Paragraph(
            f"<b>Current SASH Maritime Risk Indicator:</b> {cr['score']}/100 ({cr['band']}), trend {cr['trend']}, "
            f"confidence {cr['confidence']:.0%}", ss["Normal"]))
        story.append(Spacer(1, 8))
    h = profile["historical_exposure"]
    story.append(Paragraph(f"<b>Historical exposure — last {h['period_months']} months</b>", ss["Heading3"]))
    mt = Table([["Metric", "Value"], *_rows(profile)], colWidths=[100 * mm, 40 * mm])
    mt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f2a3f")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 9), ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#c7d2dc")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f2f6f9")]),
    ]))
    story.append(mt)
    story.append(Paragraph(h["note"], small))
    if h["zones"]:
        story.append(Spacer(1, 6))
        story.append(Paragraph("<b>Risk zones transited:</b> " + "; ".join(h["zones"]), small))
    s = profile.get("sanctions_screening", {})
    story.append(Spacer(1, 6))
    story.append(Paragraph(f"<b>Sanctions screening:</b> {s.get('status')} — {s.get('detail')}", small))
    if events:
        story.append(Spacer(1, 10))
        story.append(Paragraph("<b>Event timeline (observations)</b>", ss["Heading3"]))
        rows = [["Time (UTC)", "Event", "Detail"]] + [
            [e["time"][:16].replace("T", " "), e["kind"].replace("_", " ").title(), Paragraph(e["text"], small)]
            for e in events[-60:]
        ]
        et = Table(rows, colWidths=[30 * mm, 30 * mm, 118 * mm], repeatRows=1)
        et.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f2a3f")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 8), ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#c7d2dc")),
        ]))
        story.append(et)
    story.append(Spacer(1, 12))
    story.append(Paragraph(f"<b>{DISCLAIMER}</b>", small))
    story.append(Paragraph(
        "Observations are reported as recorded; inferences are cautious interpretations; the indicator is a "
        "rules-based heuristic that has not been actuarially validated. AIS anomalies and route deviations do not "
        "by themselves indicate wrongdoing.", small))
    doc.build(story)
    return buf.getvalue()
