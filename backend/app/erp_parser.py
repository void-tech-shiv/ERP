"""Parse NewERP Attendance Register HTML into safe LTPS counts.

Only attendance table cells are consumed. Raw HTML, CSRF tokens and
per-student Register links never enter the returned Course models.
"""
import re
from collections import OrderedDict

from bs4 import BeautifulSoup
from .calculator import Course, Counts


class AttendanceParseError(ValueError):
    """The response is not a recognizable and consistent attendance table."""


def _normalized(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def _get_int(value: str, field: str) -> int:
    cleaned = value.strip().replace(",", "")
    if not cleaned.isdecimal():
        raise AttendanceParseError(f"Invalid {field} count")
    return int(cleaned)


def parse_course_list_html(html: str) -> list[Course]:
    """Read student attendance HTML without retaining tokens or links.

    Count unique (course, LTPS, section) rows once. Repeated components in
    different sections are summed. Reject mixed academic-year/semester rows.
    """
    if not isinstance(html, str) or len(html) > 2_000_000:
        raise AttendanceParseError("HTML must be text no larger than 2 MB")
    soup = BeautifulSoup(html, "html.parser")
    required = {"coursecode", "coursedesc", "ltps", "total conducted", "total attended"}
    table = headers = None
    for candidate in soup.select("table"):
        names = [_normalized(h.get_text(" ", strip=True)) for h in candidate.select("thead th")]
        if required.issubset(set(names)):
            table, headers = candidate, names
            break
    if table is None or headers is None:
        raise AttendanceParseError("Attendance Register table headers not found")
    columns = {name: headers.index(name) for name in required}
    for optional in ("section", "year", "semester"):
        if optional in headers:
            columns[optional] = headers.index(optional)
    courses: OrderedDict[str, dict] = OrderedDict()
    seen: set[tuple[str, str, str]] = set()
    terms: set[tuple[str, str]] = set()
    for row in table.select("tbody tr"):
        cells = row.find_all("td", recursive=False)
        if not cells:
            continue
        if len(cells) <= max(columns.values()):
            if len(cells) == 1 and cells[0].has_attr("colspan"):
                continue
            raise AttendanceParseError("Unexpected table row length")

        def field(name: str) -> str:
            return cells[columns[name]].get_text(" ", strip=True)

        code, name = field("coursecode"), field("coursedesc")
        part = field("ltps").upper()
        if not code or not name or part not in ("L", "T", "P", "S"):
            raise AttendanceParseError("Invalid course or LTPS component")
        section = field("section") if "section" in columns else ""
        key = (code, part, section)
        if key in seen:
            raise AttendanceParseError("Duplicate course/component/section row")
        seen.add(key)
        attended = _get_int(field("total attended"), "attended")
        conducted = _get_int(field("total conducted"), "conducted")
        if attended > conducted:
            raise AttendanceParseError("Attended count exceeds conducted")
        year = field("year") if "year" in columns else ""
        semester = field("semester") if "semester" in columns else ""
        terms.add((year, semester))
        item = courses.setdefault(code, {"name": name, "components": {}})
        if item["name"] != name:
            raise AttendanceParseError("Conflicting course names")
        before = item["components"].get(part, (0, 0))
        item["components"][part] = (before[0] + attended, before[1] + conducted)
    if len(terms) > 1:
        raise AttendanceParseError("Mixed academic years or semesters")
    return [Course(
        code=code, name=data["name"],
        components={
            part: Counts(attended=counts[0], conducted=counts[1])
            for part, counts in data["components"].items()
        },
    ) for code, data in courses.items()]
