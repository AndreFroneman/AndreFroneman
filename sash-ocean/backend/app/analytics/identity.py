"""Identity consistency checks (IMO check digit, MMSI MID vs declared flag)."""
from __future__ import annotations

# Subset of ITU Maritime Identification Digits -> ISO 3166-1 alpha-2. Extend as needed.
MID_TO_FLAG: dict[str, str] = {
    "201": "AL", "209": "CY", "210": "CY", "212": "CY", "215": "MT", "229": "MT", "248": "MT",
    "249": "MT", "256": "MT", "211": "DE", "218": "DE", "219": "DK", "220": "DK", "224": "ES",
    "225": "ES", "226": "FR", "227": "FR", "228": "FR", "232": "GB", "233": "GB", "234": "GB",
    "235": "GB", "237": "GR", "239": "GR", "240": "GR", "241": "GR", "244": "NL", "245": "NL",
    "246": "NL", "247": "IT", "257": "NO", "258": "NO", "259": "NO", "271": "TR", "273": "RU",
    "304": "AG", "305": "AG", "308": "BS", "309": "BS", "311": "BS", "338": "US", "366": "US",
    "367": "US", "368": "US", "369": "US", "351": "PA", "352": "PA", "353": "PA", "354": "PA",
    "355": "PA", "356": "PA", "357": "PA", "370": "PA", "371": "PA", "372": "PA", "373": "PA",
    "374": "PA", "403": "SA", "412": "CN", "413": "CN", "414": "CN", "419": "IN", "422": "IR",
    "431": "JP", "432": "JP", "440": "KR", "441": "KR", "445": "KP", "461": "OM", "466": "QA",
    "470": "AE", "471": "AE", "473": "YE", "475": "YE", "477": "HK", "463": "PK", "525": "ID",
    "533": "MY", "538": "MH", "548": "PH", "563": "SG", "564": "SG", "565": "SG", "566": "SG",
    "572": "TV", "577": "VU", "601": "ZA", "603": "AO", "605": "DZ", "609": "BI", "616": "KM",
    "620": "KM", "621": "DJ", "622": "EG", "624": "ET", "625": "ER", "626": "GA", "627": "GH",
    "629": "GM", "630": "GW", "631": "GQ", "632": "GN", "634": "KE", "635": "KE", "636": "LR",
    "637": "LR", "642": "LY", "644": "LS", "645": "MU", "647": "MG", "649": "ML", "650": "MZ",
    "654": "MR", "655": "MW", "656": "NE", "657": "NG", "659": "NA", "660": "RE", "661": "RW",
    "662": "SD", "663": "SN", "664": "SC", "665": "SH", "666": "SO", "667": "SL", "668": "ST",
    "669": "SZ", "670": "TD", "671": "TG", "672": "TN", "674": "TZ", "675": "UG", "676": "CD",
    "677": "TZ", "678": "ZM", "679": "ZW",
}


def imo_checksum_valid(imo: str | None) -> bool:
    if not imo or len(imo) != 7 or not imo.isdigit():
        return False
    total = sum(int(d) * w for d, w in zip(imo[:6], range(7, 1, -1), strict=False))
    return total % 10 == int(imo[6])


def imo_with_check_digit(first6: str) -> str:
    total = sum(int(d) * w for d, w in zip(first6, range(7, 1, -1), strict=False))
    return f"{first6}{total % 10}"


def mid_flag(mmsi: str | None) -> str | None:
    if not mmsi or len(mmsi) != 9 or not mmsi.isdigit():
        return None
    return MID_TO_FLAG.get(mmsi[:3])


def identity_issues(imo: str | None, mmsi: str | None, flag: str | None) -> list[str]:
    """Return human-readable OBSERVATIONS of identity inconsistencies (no inference)."""
    issues: list[str] = []
    if imo and not imo_checksum_valid(imo):
        issues.append(f"IMO number {imo} fails the IMO check-digit validation.")
    if mmsi and (len(mmsi) != 9 or not mmsi.isdigit()):
        issues.append(f"MMSI {mmsi} is not a valid 9-digit identifier.")
    mf = mid_flag(mmsi)
    if mf and flag and mf != flag.upper():
        issues.append(
            f"MMSI Maritime Identification Digits ({mmsi[:3]} → {mf}) do not match declared flag {flag.upper()}."
        )
    return issues
